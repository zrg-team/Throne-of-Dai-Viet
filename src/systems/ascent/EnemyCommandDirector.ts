/**
 * The rival empires as commanders rather than a metronome.
 *
 * Ten minutes of Dragon Ascent produced no battle at all, and five separate things were causing it:
 *
 *  1. Waves fired on a fixed `WAVE_INTERVAL_TICKS` countdown, and `launchWave` skipped the spawn
 *     entirely whenever `waveBudgetSpent` was true — so a realm holding its own simply stopped
 *     being attacked.
 *  2. Hosts spawned on the neutral district *farthest* from the capital and walked one hop a tick.
 *  3. That walk was a bare `army.landId = step`, which bypasses `MovementOrder` and therefore the
 *     march tween, the dust, and the marching column — an invader teleported between provinces.
 *  4. It made no difference anyway, because `refreshPlayerVisibility` lights only owned lands and
 *     their neighbours, so the approach happened entirely in the dark.
 *  5. Targeting was capital-or-nearest, with no notion of value, of splitting up, or of retreat —
 *     so even an invasion that arrived was not a campaign anyone could read or answer.
 *
 * This director owns the first, second and fifth of those. The third and fourth are fixed in
 * `InvasionSystem.tickInvasions` and `LandSystem.refreshPlayerVisibility` respectively, both
 * ascent-gated.
 *
 * Runs before `tickInvasions` each tick so a host spawned this tick marches on the same tick it
 * was given its orders.
 */
import { PLAYER_KINGDOM_ID } from '../../game/constants';
import {
  ENEMY_CONTACT_FLOOR_TICKS,
  ENEMY_LAUNCH_DRAW,
  ENEMY_PRESSURE_DIVISOR,
  ENEMY_RETREAT_HYSTERESIS_TICKS,
  ENEMY_RETREAT_POWER_RATIO,
  MAX_LIVE_INVADER_HOSTS,
} from '../../game/ascentConfig';
import { launchOffMapInvasion } from '../empire/InvasionSystem';
import { pushToast } from '../empire/notifications';
import { armyPower } from '../WarSystem';
import { ambitionHeat } from './AmbitionSystem';
import { landGarrisonPower } from './PowerSystem';
import { waveSoldierBudget } from './WaveDirector';
import { t } from '../../i18n';
import type { GameState, InvasionRecord, Kingdom, Land } from '../../state/types';

// ─── Who attacks, and when ────────────────────────────────────────────────────

/**
 * How badly one rival wants to march on the player, as a 0..1 pressure.
 *
 * The weights are the ones `WaveDirector.pickAggressor` and `ThreatDirector.threatWeight` already
 * use, so the empire that has been snarling at the player through the diplomacy screen is the one
 * that actually turns up. Relations dominate: a kingdom the player has been paying tribute to is
 * genuinely safer than one they have been defying, which is what makes the diplomacy lane matter.
 */
function aggressionPressure(state: GameState, kingdom: Kingdom): number {
  const hostility = Math.max(0, 100 - (kingdom.relations ?? 50));
  const appetite = Math.max(0, kingdom.warAppetite ?? 0);
  const power = Math.max(0, kingdom.power ?? 40);
  const raw = hostility * 1.0 + appetite * 0.55 + power * 0.25;
  // Ambition is a property of the run rather than of any one rival — the player's own expansion is
  // what draws attention — so it scales every rival's appetite together.
  return Math.max(0, Math.min(1, (raw * ambitionHeat(state)) / ENEMY_PRESSURE_DIVISOR));
}

/**
 * A rival whose ground the player has just come to border, if any.
 *
 * Compares the set of rivals the realm touches against the set it touched last tick, so this fires
 * once per new frontier rather than every tick the frontier exists. The player's own provinces are
 * the reference: a rival becomes "contested" the moment one of its lands neighbours one of theirs.
 */
function newlyContestedRival(state: GameState): Kingdom | undefined {
  const ascent = state.ascent;
  if (!ascent) return undefined;

  const ownedIds = new Set(
    state.lands.filter((land) => land.ownerId === PLAYER_KINGDOM_ID).map((land) => land.id),
  );
  const touching = new Set<string>();
  for (const land of state.lands) {
    if (land.ownerId === PLAYER_KINGDOM_ID || land.ownerId === 'neutral') continue;
    if (land.neighbors.some((id) => ownedIds.has(id))) touching.add(land.ownerId);
  }

  const known = new Set(ascent.borderedRivalIds ?? []);
  ascent.borderedRivalIds = [...touching];
  for (const kingdomId of touching) {
    if (known.has(kingdomId)) continue;
    const kingdom = state.kingdoms.find((k) => k.id === kingdomId && !k.isDefeated);
    if (kingdom) return kingdom;
  }
  return undefined;
}

/** Rivals that could plausibly march. */
function aggressors(state: GameState): Kingdom[] {
  return state.kingdoms.filter(
    (kingdom) => kingdom.id !== PLAYER_KINGDOM_ID && !kingdom.isDefeated,
  );
}

/** Whether any hostile host is currently standing on or beside the player's ground. */
function contactIsLive(state: GameState): boolean {
  const owned = new Set(
    state.lands.filter((land) => land.ownerId === PLAYER_KINGDOM_ID).map((land) => land.id),
  );
  return state.armies.some((army) => {
    if (army.kingdomId === PLAYER_KINGDOM_ID) return false;
    if (owned.has(army.landId)) return true;
    const at = state.lands.find((land) => land.id === army.landId);
    return Boolean(at?.neighbors.some((id) => owned.has(id)));
  });
}

/**
 * Decides whether a rival marches this tick.
 *
 * A random draw against each rival's pressure rather than a shared countdown, so contact is
 * genuinely unpredictable and a hostile neighbour is genuinely more dangerous than a friendly one.
 * Two guards keep that honest in both directions:
 *
 *  - a floor, because the defect this exists to fix is "ten minutes, no battle", and a run of bad
 *    rolls must not be allowed to reproduce it;
 *  - the existing live-threat ceiling, so incursions cannot stack into an unanswerable pile.
 */
function maybeLaunch(state: GameState): void {
  const ascent = state.ascent;
  if (!ascent) return;

  // The ceiling, and deliberately stricter than the wave director's.
  //
  // `WaveDirector` still runs its own metronome, so this director is a second source of hosts on
  // the same map. Letting it fill to `MAX_LIVE_INVADER_HOSTS` on its own put seven hosts in the
  // field at once and turned the run into one unbroken siege — which is a different failure from
  // the one being fixed, not a cure for it. Half the cap leaves room for the wave director's
  // scheduled pressure on top.
  if ((state.invasions?.length ?? 0) >= Math.ceil(MAX_LIVE_INVADER_HOSTS / 2)) return;

  const candidates = aggressors(state);
  if (candidates.length === 0) return;

  const sinceContact = state.turn - (ascent.lastContactTurn ?? 0);
  const forced = sinceContact >= ENEMY_CONTACT_FLOOR_TICKS;

  let chosen: Kingdom | undefined;
  if (forced) {
    // The floor fired: send the angriest, so a forced attack still reads as coming from the
    // empire the player has most reason to expect it from.
    chosen = candidates.reduce((worst, kingdom) => (
      aggressionPressure(state, kingdom) > aggressionPressure(state, worst) ? kingdom : worst
    ), candidates[0]);
  } else {
    // One draw per rival per tick. The coefficient is small on purpose: at three rivals this is
    // roughly one unscheduled march every forty ticks, which sits *under* the wave director's
    // twelve-tick metronome rather than competing with it. The randomness is what makes contact
    // unpredictable; the volume comes from the schedule, and the floor below guarantees the worst
    // case. Tuned up from a coefficient four times this, which produced a permanent siege.
    for (const kingdom of candidates) {
      if (Math.random() < aggressionPressure(state, kingdom) * ENEMY_LAUNCH_DRAW) {
        chosen = kingdom;
        break;
      }
    }
  }
  if (!chosen) return;

  const budget = waveSoldierBudget(state, ascent.wave, false);
  launchOffMapInvasion(state, chosen.id, { totalSoldiers: budget });
  ascent.lastContactTurn = state.turn;
  if (forced) {
    pushToast(state, t('ascent.enemy.marchForced', { kingdom: chosen.name }), 'threat');
  }
}

// ─── Story strikes ────────────────────────────────────────────────────────────

/**
 * A host sent *now*, because of something that just happened.
 *
 * The distinction from `maybeLaunch` is the whole point: that one is weather, this is
 * consequence. It bypasses the randomised cadence entirely so the march is legibly an answer to
 * the player's own choice, and it stamps `lastContactTurn` so the floor does not immediately send
 * a second one on top of it.
 *
 * Returns false when the map is already too crowded to add another — a punitive host that cannot
 * spawn must not be announced, or the toast promises something that never arrives.
 */
export function launchPunitiveHost(
  state: GameState,
  kingdomId: string,
  opts: { conquest?: boolean; sizeMult?: number } = {},
): boolean {
  const ascent = state.ascent;
  if (state.gameMode !== 'ascent' || !ascent) return false;
  if ((state.invasions?.length ?? 0) >= MAX_LIVE_INVADER_HOSTS) return false;

  const budget = Math.round(waveSoldierBudget(state, ascent.wave, false) * (opts.sizeMult ?? 1));
  launchOffMapInvasion(state, kingdomId, {
    totalSoldiers: budget,
    forceConquest: opts.conquest,
  });
  ascent.lastContactTurn = state.turn;
  return true;
}

/**
 * Attacks that answer something that just happened, bypassing every telegraph and cooldown.
 *
 * These are the ones that should feel like consequences rather than weather. Each is tied to a
 * thing the player did or a thing the world did to them, and each fires at most once for the
 * situation that caused it.
 */
function storyStrikes(state: GameState): void {
  const ascent = state.ascent;
  if (!ascent) return;
  if ((state.invasions?.length ?? 0) >= MAX_LIVE_INVADER_HOSTS) return;

  // A rival empire falling apart is an opportunity its neighbours take — including at the player's
  // expense. Tracked against the count so it fires on the transition, not every tick afterwards.
  const liveRivals = aggressors(state).length;
  if (ascent.lastRivalCount === undefined) {
    ascent.lastRivalCount = liveRivals;
  } else if (liveRivals < ascent.lastRivalCount) {
    ascent.lastRivalCount = liveRivals;
    const opportunist = aggressors(state)
      .sort((a, b) => aggressionPressure(state, b) - aggressionPressure(state, a))[0];
    if (opportunist && launchPunitiveHost(state, opportunist.id)) {
      pushToast(state, t('ascent.enemy.powerVacuum', { kingdom: opportunist.name }), 'threat');
      return;
    }
  } else if (liveRivals > ascent.lastRivalCount) {
    ascent.lastRivalCount = liveRivals;
  }

  // Taking ground on a rival's doorstep is answered by *that* rival.
  //
  // Deliberately not "the realm grew by N provinces". Growth is already charged for, twice over —
  // `chargeAmbition` on every claim, and `ambitionHeat` scaling every wave — so a third tax on
  // expansion punishes the core loop rather than dramatising it. Measured, the growth version took
  // a run from peak 16 / ended 14 down to peak 13 / ended 7.
  //
  // Border friction is the honest trigger: it fires only when the player's new province actually
  // touches ground a rival holds, so it reads as *that empire* reacting to *that* encroachment,
  // and a player expanding into empty country is left alone.
  const borderRival = newlyContestedRival(state);
  if (borderRival && launchPunitiveHost(state, borderRival.id)) {
    pushToast(state, t('ascent.enemy.borderAlarm', { kingdom: borderRival.name }), 'threat');
  }

  // An undefended seat is an invitation. Checked against a flag so it fires once per exposure
  // rather than every tick the capital happens to be empty.
  const capital = state.lands.find((land) => land.id === ascent.capitalLandId);
  if (capital && capital.ownerId === PLAYER_KINGDOM_ID) {
    const garrisoned = state.armies.some(
      (army) => army.kingdomId === PLAYER_KINGDOM_ID && army.landId === capital.id,
    );
    if (!garrisoned && !ascent.capitalExposedFired) {
      const opportunist = aggressors(state)
        .sort((a, b) => aggressionPressure(state, b) - aggressionPressure(state, a))[0];
      if (opportunist) {
        ascent.capitalExposedFired = true;
        ascent.lastContactTurn = state.turn;
        launchOffMapInvasion(state, opportunist.id, {
          totalSoldiers: waveSoldierBudget(state, ascent.wave, false),
          forceConquest: true,
        });
        pushToast(state, t('ascent.enemy.capitalExposed', { kingdom: opportunist.name }), 'threat');
      }
    } else if (garrisoned) {
      ascent.capitalExposedFired = false;
    }
  }
}

// ─── Hosts that march with a plan ─────────────────────────────────────────────

/** What a province is worth taking, from what it produces and what stands on it. */
function landValue(state: GameState, land: Land): number {
  const outputs = land.outputs;
  const yield_ = (outputs?.gold ?? 0) * 1.2 + (outputs?.food ?? 0) + (outputs?.supplies ?? 0);
  const capital = land.id === state.ascent?.capitalLandId ? 90 : 0;
  return yield_ + land.buildings.length * 14 + land.population * 0.04 + capital;
}

/** Assigns each host without one a plan, and a province to carry it out on. */
function assignPlans(state: GameState): void {
  const records = state.invasions ?? [];
  const owned = state.lands.filter((land) => land.ownerId === PLAYER_KINGDOM_ID);
  if (owned.length === 0) return;

  // Targets already claimed by another host, so flankers genuinely spread rather than stacking.
  const taken = new Set(
    records.map((record) => record.targetLandId).filter((id): id is string => Boolean(id)),
  );

  for (const record of records) {
    if (record.plan && record.targetLandId) continue;

    const army = state.armies.find((candidate) => candidate.id === record.armyId);
    if (!army) continue;

    if (record.intent === 'raid') {
      record.plan = 'raider';
      // A raider wants the nearest thing worth burning, not the best-defended prize.
      const nearest = [...owned].sort((a, b) => distance(army.landId, a, state) - distance(army.landId, b, state));
      record.targetLandId = (nearest.find((land) => !taken.has(land.id)) ?? nearest[0])?.id;
      if (record.targetLandId) taken.add(record.targetLandId);
      continue;
    }

    // Conquest hosts split: the first goes for the prize, the rest for whatever is weakly held.
    //
    // Both scores are divided by distance, and that is not decoration. Scored on value alone the
    // hosts behave like a solver rather than an army: every flanker beelines across the whole map
    // for whichever province happens to be softest, and a measured run lost 31 provinces against a
    // baseline of 13. An army marches on what is in front of it and worth taking, which is both
    // more believable and considerably less punishing.
    const spearheadExists = records.some((other) => other !== record && other.plan === 'spearhead');
    const reach = (land: Land): number => 1 + Math.sqrt(distance(army.landId, land, state)) / 220;

    if (!spearheadExists) {
      record.plan = 'spearhead';
      const best = [...owned].sort((a, b) => landValue(state, b) / reach(b) - landValue(state, a) / reach(a));
      record.targetLandId = (best.find((land) => !taken.has(land.id)) ?? best[0])?.id;
    } else {
      record.plan = 'flanker';
      // Value per unit of defence, per unit of march: what pays best for the least fighting and
      // the least walking.
      const softness = (land: Land): number => landValue(state, land)
        / Math.max(1, landGarrisonPower(state, land))
        / reach(land);
      const soft = [...owned].sort((a, b) => softness(b) - softness(a));
      record.targetLandId = (soft.find((land) => !taken.has(land.id)) ?? soft[0])?.id;
    }
    if (record.targetLandId) taken.add(record.targetLandId);
  }
}

/** Straight-line distance between a host's province and another, for rough ordering. */
function distance(fromLandId: string, to: Land, state: GameState): number {
  const from = state.lands.find((land) => land.id === fromLandId);
  if (!from) return Number.POSITIVE_INFINITY;
  return (from.x - to.x) ** 2 + (from.y - to.y) ** 2;
}

/**
 * Re-reads each host's situation and pulls it back if the fight in front of it is hopeless.
 *
 * `createBattlePreview` cannot be used here: it requires the host to be adjacent to the target
 * already, and the whole point is to make this decision while the host is still marching. So the
 * comparison is a direct one between the host's power and what is waiting for it.
 *
 * Hysteresis matters more than the threshold. Without it a host sitting near the line oscillates
 * between advancing and withdrawing every tick, which reads as a bug rather than as caution.
 */
function reconsider(state: GameState): void {
  for (const record of state.invasions ?? []) {
    if (record.plan === 'raider' || record.pillaged) continue;

    const army = state.armies.find((candidate) => candidate.id === record.armyId);
    const target = state.lands.find((candidate) => candidate.id === record.targetLandId);
    if (!army || !target) continue;

    // A host that has already reached its objective commits to the assault.
    //
    // Without this the retreat check fires on the doorstep and the host turns around one tick
    // before contact — which is precisely the "no battle ever happens" defect this director was
    // written to fix, reintroduced from the other side. Withdrawal is for a march that has become
    // pointless, not for an attack that has become costly.
    const here = state.lands.find((candidate) => candidate.id === army.landId);
    if (here?.id === target.id || here?.neighbors.includes(target.id)) {
      record.retreatTicks = 0;
      continue;
    }

    const attack = armyPower(state, army);
    const defence = landGarrisonPower(state, target)
      + state.armies
        .filter((other) => other.kingdomId === PLAYER_KINGDOM_ID && other.landId === target.id)
        .reduce((sum, other) => sum + armyPower(state, other), 0);

    const outmatched = attack < defence * ENEMY_RETREAT_POWER_RATIO;
    if (outmatched) {
      record.retreatTicks = (record.retreatTicks ?? 0) + 1;
      if (record.retreatTicks >= ENEMY_RETREAT_HYSTERESIS_TICKS && record.plan !== 'withdrawing') {
        // Rather than dying to attrition against a province it cannot take, the host looks for
        // softer ground. Only if there is none does it turn for home.
        const owned = state.lands.filter((land) => land.ownerId === PLAYER_KINGDOM_ID);
        const softer = owned
          .filter((land) => land.id !== target.id)
          .sort((a, b) => landGarrisonPower(state, a) - landGarrisonPower(state, b))[0];
        if (softer && landGarrisonPower(state, softer) * ENEMY_RETREAT_POWER_RATIO < attack) {
          record.targetLandId = softer.id;
          record.retreatTicks = 0;
        } else {
          record.plan = 'withdrawing';
          record.pillaged = true; // reuses the existing withdraw-and-despawn path
        }
      }
    } else {
      record.retreatTicks = 0;
    }
  }
}

/**
 * One tick of enemy high command. Ascent only — empire keeps its ThreatDirector and its metronome.
 */
export function tickEnemyCommand(state: GameState): void {
  if (state.gameMode !== 'ascent' || !state.ascent) return;

  if (contactIsLive(state)) {
    state.ascent.lastContactTurn = state.turn;
  }

  storyStrikes(state);
  maybeLaunch(state);
  assignPlans(state);
  reconsider(state);
}
