import { PLAYER_KINGDOM_ID } from '../../game/constants';
import {
  COALITION_COOLDOWN_TICKS,
  COALITION_DOMINANCE,
  COALITION_LEAD_TICKS,
  TRIBUTE_COOLDOWN_TICKS,
  TRIBUTE_INCOME_MULT,
  TRIBUTE_MEANS_FLOOR,
  TRIBUTE_REFUSE_TICKS,
  TRIBUTE_TREASURY_CAP,
  VASSAL_COOLDOWN_TICKS,
  VASSAL_HEGEMON_MULT,
  VASSAL_TITHE_GOLD,
} from '../../game/ascentConfig';
import { addOpinionModifier, getEmpirePower, getFear, hasPact } from '../DiplomacySystem';
import { addCourtModifier } from '../CourtSystem';
import { applyResourceDelta, canSpend, refreshAllLandOutputs } from '../ResourceSystem';
import { pushToast } from '../empire/notifications';
import { enqueueAscentPrompt } from './AscentState';
import { computeFieldDefencePower, contestedDefencePower } from './PowerSystem';
import { launchPunitiveHost } from './EnemyCommandDirector';
import { t } from '../../i18n';
import type { GameState, Kingdom, RivalDemandOption } from '../../state/types';

/**
 * The half of foreign affairs the player does not start.
 *
 * `ThreatDirector` already models all of this for empire mode, but it writes
 * `pendingUltimatum` / `pendingForeignCard` and sets `isPaused` itself — machinery Dragon
 * Ascent's prompt queue does not read and its UI does not render, so calling it here would
 * silently deadlock the run. This raises the same three pressures through the queue instead,
 * reusing its helpers (`getEmpirePower`, `getFear`, `hasPact`) and its dominance shape.
 *
 * Without it a passive player never hears from a rival at all: empires existed only as a wave
 * spawner, which is why a run could reach year nine with "no actions from other empires".
 */

function rivals(state: GameState): Kingdom[] {
  return state.kingdoms.filter((kingdom) => kingdom.id !== PLAYER_KINGDOM_ID && !kingdom.isDefeated);
}

/** 0..~2: how far the realm has outgrown the world. Mirrors `ThreatDirector.playerDominance`. */
function playerDominance(state: GameState): number {
  const lands = state.lands.filter((land) => land.ownerId === PLAYER_KINGDOM_ID).length;
  const others = rivals(state);
  const avgFear = others.length
    ? others.reduce((sum, kingdom) => sum + getFear(state, kingdom), 0) / others.length
    : 0;
  return (lands / 14) * 0.7 + (avgFear / 100) * 0.7;
}

function cools(state: GameState, kingdom: Kingdom, amount: number, label: string): void {
  addOpinionModifier(kingdom, {
    id: `ascent-${label}-${state.turn}`,
    label: t(`ascent.rival.mod.${label}` as Parameters<typeof t>[0]),
    value: -amount,
    decay: 0.4,
    source: 'request',
  });
}

/**
 * Whether this rival is a hegemon: cold to you, and towering over *the other empires*.
 *
 * Defined against its peers rather than against the player, and that is the whole point. Every
 * absolute "must be N× the player" threshold I tried went dark within a round or two, because
 * each improvement to the realm — routine expansion, walls that finally scale — pushed the
 * player past the bar and silently removed submission demands from the game. Three separate
 * recalibrations, three relapses.
 *
 * A rival that has swallowed its neighbours and dwarfs the rest of the world is a hegemon
 * whatever the player's own curve is doing, which is both self-calibrating and what the world
 * already says out loud when it announces one rising. The floor against the player's own
 * defence stays, at the same bar tribute uses, so a genuine giant is not asked to kneel to a
 * big fish in a small pond.
 */
function demandsSubmission(state: GameState, kingdom: Kingdom): boolean {
  if ((kingdom.relations ?? 50) >= 46) return false;

  const others = rivals(state).filter((candidate) => candidate.id !== kingdom.id);
  if (others.length === 0) return false;
  const meanPeer = others.reduce((sum, peer) => sum + getEmpirePower(state, peer), 0) / others.length;
  const power = getEmpirePower(state, kingdom);

  // Strictly the strongest, not merely one of several that clear the bar. Tribute deliberately
  // excludes anyone who would demand submission instead, so when a weak realm let two or three
  // rivals qualify at once, every candidate for extortion was filtered away and tribute stopped
  // firing entirely. There is only ever one hegemon.
  const strongest = others.every((peer) => getEmpirePower(state, peer) < power);

  // No absolute "N× the player" floor. That clause is what took this branch dark four separate
  // times — every improvement to the realm raised the denominator past whatever number was
  // current, and I re-tuned the constant three times before admitting the shape was wrong.
  //
  // The complement of a coalition is the honest condition: when the player dominates the world,
  // the world bands together (see `offerCoalition`); when they do not, the strongest empire in
  // it demands their submission. Both read the same `playerDominance`, so the two can never
  // both be live and neither can silently stop firing.
  return strongest
    && power >= meanPeer * VASSAL_HEGEMON_MULT
    && playerDominance(state) < COALITION_DOMINANCE;
}

// ── Tribute ─────────────────────────────────────────────────────────────────

/**
 * Gold a rival demands: pegged to income, so it stays a real cost at any wealth — but capped
 * at a share of what the realm actually holds, so paying is always *possible*.
 *
 * Without the cap a demand priced at eleven seasons of income routinely exceeded the whole
 * treasury, and the card arrived reading "Pay the tribute (you cannot) · Refuse them". Measured
 * across four seeds, that was four to six of every run's decisions with exactly one legal
 * answer. An extortion you are not rich enough to satisfy is not a decision, and the refusal's
 * consequences land as an unavoidable punishment rather than a price you chose to pay.
 */
export function tributeDemandGold(state: GameState): number {
  const asked = Math.max(120, state.resourceRates.gold * TRIBUTE_INCOME_MULT);
  const affordableCeiling = state.resources.gold * TRIBUTE_TREASURY_CAP;
  return Math.round(Math.max(120, Math.min(asked, affordableCeiling)));
}

/**
 * What a coalition asks to disperse. Capped against the treasury for the same reason tribute
 * is: a price the player cannot possibly meet turns the card into "Buy them off (you cannot) ·
 * Endure", which is one legal answer wearing two.
 *
 * Shared by the card and the resolver deliberately. Capping it in only one of the two made the
 * card advertise a price the resolver then refused to accept, so the prompt could never be
 * answered and the run sat on a modal with no way out.
 */
export function coalitionBuyOffGold(state: GameState): number {
  return Math.round(Math.max(
    400,
    Math.min(state.resourceRates.gold * 18, state.resources.gold * TRIBUTE_TREASURY_CAP),
  ));
}

function offerTribute(state: GameState): boolean {
  const ascent = state.ascent;
  if (!ascent) return false;

  // A realm that dominates the world is not shaken down by a neighbour — that case belongs to
  // the coalition, and both branches reading the same `playerDominance` is what keeps the
  // seesaw honest: while the realm is small the world squeezes it one court at a time, and the
  // moment it towers, they band together instead. The old gate here was a player-relative
  // power bar (`contestedDefence × ratio`) and it went dark exactly the way `demandsSubmission`
  // documents — the realm's defence compounds, a rival's holdings do not, and the bar ran to
  // 30× the strongest rival in a measured long run. Tribute fired zero times.
  if (playerDominance(state) >= COALITION_DOMINANCE) return false;

  // Only an empire with the means to make good on the threat bothers to make it — but not
  // one strong enough to demand submission outright: the hegemon wants your crown, the merely
  // dangerous neighbour wants your coin. Without that exclusion the two demands compete for
  // the same rival and whichever is *tried* first silently starves the other (measured both
  // ways: 306 ticks with zero tributes, 501 with zero vassalage demands).
  const bully = rivals(state)
    .filter((kingdom) => !hasPact(kingdom) && (kingdom.relations ?? 50) < 48)
    .filter((kingdom) => !demandsSubmission(state, kingdom))
    .filter((kingdom) => getEmpirePower(state, kingdom) > TRIBUTE_MEANS_FLOOR)
    .sort((a, b) => getEmpirePower(state, b) - getEmpirePower(state, a))[0];
  if (!bully) return false;

  const gold = tributeDemandGold(state);
  const options: RivalDemandOption[] = [
    { id: 'pay', cost: { gold }, affordable: canSpend(state, { gold }) },
    { id: 'refuse', affordable: true },
  ];
  enqueueAscentPrompt(state, {
    kind: 'rival-demand',
    demand: 'tribute',
    kingdomId: bully.id,
    kingdomName: bully.name,
    gold,
    options,
  });
  ascent.tributeCooldown = TRIBUTE_COOLDOWN_TICKS;
  return true;
}

// ── Coalition ───────────────────────────────────────────────────────────────

function offerCoalition(state: GameState): boolean {
  const ascent = state.ascent;
  if (!ascent) return false;
  if (playerDominance(state) < COALITION_DOMINANCE) return false;

  const members = rivals(state).filter((kingdom) => !hasPact(kingdom));
  if (members.length < 2) return false;

  const leader = [...members].sort((a, b) => getEmpirePower(state, b) - getEmpirePower(state, a))[0];
  const buyOff = coalitionBuyOffGold(state);
  const options: RivalDemandOption[] = [
    { id: 'buy-off', cost: { gold: buyOff }, affordable: canSpend(state, { gold: buyOff }) },
    { id: 'endure', affordable: true },
  ];

  enqueueAscentPrompt(state, {
    kind: 'rival-demand',
    demand: 'coalition',
    kingdomId: leader.id,
    kingdomName: leader.name,
    memberNames: members.slice(0, 3).map((kingdom) => kingdom.name),
    ticks: COALITION_LEAD_TICKS,
    options,
  });
  ascent.coalitionCooldownTicks = COALITION_COOLDOWN_TICKS;
  return true;
}

// ── Vassalage ───────────────────────────────────────────────────────────────

function offerVassalage(state: GameState): boolean {
  const ascent = state.ascent;
  if (!ascent) return false;

  const hegemon = rivals(state)
    .filter((kingdom) => demandsSubmission(state, kingdom))
    .sort((a, b) => getEmpirePower(state, b) - getEmpirePower(state, a))[0];
  if (!hegemon) return false;

  enqueueAscentPrompt(state, {
    kind: 'rival-demand',
    demand: 'vassalage',
    kingdomId: hegemon.id,
    kingdomName: hegemon.name,
    gold: VASSAL_TITHE_GOLD,
    options: [
      { id: 'submit', affordable: true },
      { id: 'defy', affordable: true },
    ],
  });
  ascent.vassalCooldown = VASSAL_COOLDOWN_TICKS;
  return true;
}

// ── Tick + resolution ───────────────────────────────────────────────────────

export function tickRivalCooldowns(state: GameState): void {
  const ascent = state.ascent;
  if (!ascent) return;
  ascent.tributeCooldown = Math.max(0, (ascent.tributeCooldown ?? 0) - 1);
  ascent.coalitionCooldownTicks = Math.max(0, (ascent.coalitionCooldownTicks ?? 0) - 1);
  ascent.vassalCooldown = Math.max(0, (ascent.vassalCooldown ?? 0) - 1);
}

/** Raises at most one rival demand. Called by the decision director, which owns the pacing. */
export function offerRivalDemand(state: GameState): boolean {
  const ascent = state.ascent;
  if (!ascent) return false;

  // Tried shortest-cadence first, which is the opposite of "most dramatic first" and is
  // deliberate. Tribute is the recurring drain (22-tick cooldown) where vassalage and
  // coalition are rare events (60 and 40); trying the rare ones first meant that whenever
  // either was off cooldown it took the slot, and tribute — the one that is *supposed* to keep
  // coming back — fired zero times across a 306-tick run. Leading with it costs the rare
  // demands nothing: tribute immediately puts itself on a 22-season cooldown, and they fire in
  // those gaps.
  if ((ascent.tributeCooldown ?? 0) <= 0 && offerTribute(state)) return true;
  if ((ascent.vassalCooldown ?? 0) <= 0 && offerVassalage(state)) return true;
  if ((ascent.coalitionCooldownTicks ?? 0) <= 0 && offerCoalition(state)) return true;
  return false;
}

/** True when any rival has something to say — the decision director's readiness gate. */
export function rivalDemandReady(state: GameState): boolean {
  const ascent = state.ascent;
  if (!ascent) return false;
  if (rivals(state).length === 0) return false;
  return (ascent.vassalCooldown ?? 0) <= 0
    || (ascent.coalitionCooldownTicks ?? 0) <= 0
    || (ascent.tributeCooldown ?? 0) <= 0;
}

/**
 * Applies the answer. Every refusal has to land on the *wave curve*, not just in a toast —
 * a demand the player can wave away for free is flavour, not a decision.
 */
export function resolveRivalDemand(
  state: GameState,
  demand: 'tribute' | 'coalition' | 'vassalage',
  kingdomId: string,
  choiceId: string,
): boolean {
  const ascent = state.ascent;
  const kingdom = state.kingdoms.find((candidate) => candidate.id === kingdomId);
  if (!ascent || !kingdom) return false;

  switch (choiceId) {
    case 'pay': {
      const gold = tributeDemandGold(state);
      if (!canSpend(state, { gold })) return false;
      applyResourceDelta(state, { gold: -gold });
      addOpinionModifier(kingdom, {
        id: `ascent-tribute-paid-${state.turn}`,
        label: t('ascent.rival.mod.tributePaid'),
        value: 14,
        decay: 0.5,
        source: 'tribute',
      });
      pushToast(state, t('ascent.rival.tributePaid', { kingdom: kingdom.name, gold }), 'info');
      break;
    }

    case 'refuse': {
      cools(state, kingdom, 20, 'defiance');
      // The teeth: their host is already on the road — a real one.
      //
      // This used only to shorten `ticksToWave`, which meant refusing tribute brought forward a
      // wave that was coming anyway, from whichever empire the wave director happened to pick.
      // The consequence of defying *this* kingdom should be *this* kingdom's army, and it should
      // be visible on the map rather than inferred from a countdown. Falls back to the old nudge
      // when the map is already too crowded to add a host.
      if (!launchPunitiveHost(state, kingdom.id)) {
        ascent.ticksToWave = Math.max(1, ascent.ticksToWave - TRIBUTE_REFUSE_TICKS);
      }
      pushToast(state, t('ascent.rival.tributeRefused', { kingdom: kingdom.name }), 'threat');
      break;
    }

    case 'buy-off': {
      const gold = coalitionBuyOffGold(state);
      if (!canSpend(state, { gold })) return false;
      applyResourceDelta(state, { gold: -gold });
      ascent.coalitionPending = false;
      pushToast(state, t('ascent.rival.coalitionBought', { kingdom: kingdom.name }), 'reward');
      break;
    }

    case 'endure': {
      // Flagged, not spawned: the next wave becomes the coalition, with the lead time the
      // card promised so the player can actually prepare for it.
      ascent.coalitionPending = true;
      ascent.ticksToWave = Math.max(ascent.ticksToWave, COALITION_LEAD_TICKS);
      pushToast(state, t('ascent.rival.coalitionStands'), 'threat');
      break;
    }

    case 'submit': {
      // A permanent drain on the treasury, not a one-off payment — submission should be felt
      // every season it stands, so buying peace has an ongoing price.
      addCourtModifier(state, {
        id: `vassal-tithe-${kingdom.id}`,
        label: t('ascent.rival.titheLabel', { kingdom: kingdom.name }),
        resourceRateModifier: { gold: -VASSAL_TITHE_GOLD },
      });
      addOpinionModifier(kingdom, {
        id: `ascent-submitted-${state.turn}`,
        label: t('ascent.rival.mod.submission'),
        value: 30,
        decay: 0.2,
        source: 'treaty',
      });
      refreshAllLandOutputs(state);
      pushToast(state, t('ascent.rival.submitted', { kingdom: kingdom.name }), 'info');
      break;
    }

    case 'defy': {
      cools(state, kingdom, 34, 'defiance');
      kingdom.warAppetite = Math.min(100, (kingdom.warAppetite ?? 0) + 45);
      // Defying a demand for submission is the harder refusal, so it earns the heavier answer:
      // a war host aimed at the seat rather than a raid on the border.
      if (!launchPunitiveHost(state, kingdom.id, { conquest: true, sizeMult: 1.2 })) {
        ascent.ticksToWave = Math.max(1, ascent.ticksToWave - TRIBUTE_REFUSE_TICKS);
      }
      pushToast(state, t('ascent.rival.defied', { kingdom: kingdom.name }), 'threat');
      break;
    }

    default:
      return false;
  }

  ascent.laneStats.rivalAnswers = (ascent.laneStats.rivalAnswers ?? 0) + 1;
  ascent.laneState.lastDecisionTurn.world = state.turn;
  return true;
}

/** Field power the realm can show a rival, used by the demand cards' framing. */
export function realmStanding(state: GameState, kingdom: Kingdom): 'weaker' | 'even' | 'stronger' {
  const mine = computeFieldDefencePower(state);
  const theirs = getEmpirePower(state, kingdom) * 12;
  if (theirs > mine * 1.25) return 'weaker';
  if (theirs < mine * 0.75) return 'stronger';
  return 'even';
}
