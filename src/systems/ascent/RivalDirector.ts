import { PLAYER_KINGDOM_ID } from '../../game/constants';
import {
  COALITION_COOLDOWN_TICKS,
  COALITION_DOMINANCE,
  COALITION_LEAD_TICKS,
  TRIBUTE_COOLDOWN_TICKS,
  TRIBUTE_INCOME_MULT,
  TRIBUTE_POWER_RATIO,
  TRIBUTE_REFUSE_TICKS,
  VASSAL_COOLDOWN_TICKS,
  VASSAL_POWER_RATIO,
  VASSAL_TITHE_GOLD,
} from '../../game/ascentConfig';
import { addOpinionModifier, getEmpirePower, getFear, getPlayerMilitary, hasPact } from '../DiplomacySystem';
import { addCourtModifier } from '../CourtSystem';
import { applyResourceDelta, canSpend, refreshAllLandOutputs } from '../ResourceSystem';
import { pushToast } from '../empire/notifications';
import { enqueueAscentPrompt } from './AscentState';
import { computeFieldDefencePower } from './PowerSystem';
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

// ── Tribute ─────────────────────────────────────────────────────────────────

/** Gold a rival demands: pegged to income, so it stays a real cost at any wealth. */
export function tributeDemandGold(state: GameState): number {
  return Math.round(Math.max(120, state.resourceRates.gold * TRIBUTE_INCOME_MULT));
}

function offerTribute(state: GameState): boolean {
  const ascent = state.ascent;
  if (!ascent) return false;

  // Only an empire that could actually make good on the threat bothers to make it.
  const bully = rivals(state)
    .filter((kingdom) => !hasPact(kingdom) && (kingdom.relations ?? 50) < 48)
    .filter((kingdom) => getEmpirePower(state, kingdom) > getPlayerMilitary(state) * TRIBUTE_POWER_RATIO)
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
  const buyOff = Math.round(Math.max(400, state.resourceRates.gold * 18));
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
    .filter((kingdom) => (kingdom.relations ?? 50) < 46)
    .filter((kingdom) => getEmpirePower(state, kingdom) > getPlayerMilitary(state) * VASSAL_POWER_RATIO)
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

  // Vassalage first: being dwarfed is the most urgent thing a rival can tell you.
  if ((ascent.vassalCooldown ?? 0) <= 0 && offerVassalage(state)) return true;
  if ((ascent.coalitionCooldownTicks ?? 0) <= 0 && offerCoalition(state)) return true;
  if ((ascent.tributeCooldown ?? 0) <= 0 && offerTribute(state)) return true;
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
      // The teeth: their host is already on the road.
      ascent.ticksToWave = Math.max(1, ascent.ticksToWave - TRIBUTE_REFUSE_TICKS);
      pushToast(state, t('ascent.rival.tributeRefused', { kingdom: kingdom.name }), 'threat');
      break;
    }

    case 'buy-off': {
      const gold = Math.round(Math.max(400, state.resourceRates.gold * 18));
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
      ascent.ticksToWave = Math.max(1, ascent.ticksToWave - TRIBUTE_REFUSE_TICKS);
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
