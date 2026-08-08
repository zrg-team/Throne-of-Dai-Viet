import { PLAYER_KINGDOM_ID } from '../../game/constants';
import { CAPITAL_GRACE_TICKS, SUMMON_EVERY_N_WAVES } from '../../game/ascentConfig';
import { pushToast } from '../empire/notifications';
import { progressAcquisitions } from '../AcquisitionSystem';
import { collectPlayerIncome, progressBuildOrders } from '../ResourceSystem';
import {
  progressArmyLogistics,
  progressMovementOrders,
  progressRecruitmentOrders,
  progressSiegeOrders,
} from '../WarSystem';
import { progressCourtModifiers, refreshCourtSeats } from '../CourtSystem';
import { refreshPlayerVisibility } from '../LandSystem';
import { tickAutoDefend, tickInvasions, resolvePendingBattle } from '../empire/InvasionSystem';
import { addMandate } from '../empire/MandateSystem';
import { drainAscentPrompts } from './AscentState';
import { tickAscentAutopilot } from './AutopilotSystem';
import { tickAscentProgress } from './PowerSystem';
import { tickWaveDirector } from './WaveDirector';
import { detectConquests, offerMarchOrder } from './MarchOrderSystem';
import { offerPowerDraft } from './PowerDraftSystem';
import { offerHeroSummon } from './SummonSystem';
import { endAscentRun } from './AscentResolver';
import { seasonLabel, t } from '../../i18n';
import type { GameState, Season } from '../../state/types';

const SEASONS: Season[] = ['Spring', 'Summer', 'Autumn', 'Winter'];

/**
 * The seasonal clock, matching `advanceRealtimeMonth`. Inlined rather than exported from
 * RealtimeSystem so that file — which every shipping mode runs through — stays untouched.
 */
function advanceSeason(state: GameState): void {
  const nextIndex = SEASONS.indexOf(state.season) + 1;
  if (nextIndex >= SEASONS.length) {
    state.season = SEASONS[0];
    state.year += 1;
  } else {
    state.season = SEASONS[nextIndex];
  }
}

function ownedLandIds(state: GameState): Set<string> {
  return new Set(
    state.lands.filter((land) => land.ownerId === PLAYER_KINGDOM_ID).map((land) => land.id),
  );
}

/**
 * The run ends when the capital falls — not when the last province does.
 *
 * Requiring every province to be lost made the run effectively unloseable once the realm
 * had a dozen of them, which drains all stakes from a mode whose whole point is a score
 * chase against an escalating threat curve. Losing the dynasty's seat is the ending.
 */
function checkAscentDefeat(state: GameState): void {
  if (state.isDefeated) return;

  const owned = state.lands.filter((land) => land.ownerId === PLAYER_KINGDOM_ID);
  if (owned.length === 0) {
    endAscentRun(state);
    return;
  }

  const ascent = state.ascent;
  const capitalId = ascent?.capitalLandId;
  if (!ascent || !capitalId) return;

  const capital = state.lands.find((land) => land.id === capitalId);
  if (!capital || capital.ownerId === PLAYER_KINGDOM_ID) {
    // Retaken (or never lost) — the dynasty endures.
    if (ascent.capitalLostTicks > 0) {
      ascent.capitalLostTicks = 0;
      pushToast(state, t('ascent.capital.retaken', { land: capital?.name ?? '' }), 'reward');
    }
    return;
  }

  ascent.capitalLostTicks += 1;
  const remaining = CAPITAL_GRACE_TICKS - ascent.capitalLostTicks;
  if (remaining <= 0) {
    endAscentRun(state);
    return;
  }
  pushToast(state, t('ascent.capital.lost', { land: capital.name, ticks: remaining }), 'threat');
}

/** Keeps the peak-lands figure current; it feeds the run score. */
function trackScore(state: GameState): void {
  if (!state.campaignScore) return;
  const held = state.lands.filter((land) => land.ownerId === PLAYER_KINGDOM_ID).length;
  state.campaignScore.turnsAlive = state.turn;
  state.campaignScore.peakLandsHeld = Math.max(state.campaignScore.peakLandsHeld, held);
}

/**
 * Raises whatever prompts this tick has earned. Ordering here does not matter — the queue's
 * priority table decides what the player actually sees first.
 */
function offerEarnedPrompts(state: GameState): void {
  const ascent = state.ascent;
  if (!ascent) return;

  if (ascent.pendingLevelUps > 0) {
    offerPowerDraft(state);
  }

  // A champion every few waves keeps the gacha beat regular without flooding the roster.
  const summonsEarned = Math.floor(ascent.wavesSurvived / SUMMON_EVERY_N_WAVES);
  if (summonsEarned > ascent.summonsDone) {
    offerHeroSummon(state);
  }

  // Ask where to march the moment a host is actually standing ready — either because
  // nowhere is marked, or because the standing front turned out to be too strong to storm
  // and the player should get the chance to redirect rather than sit blocked forever.
  const idleHost = state.armies.some(
    (army) =>
      army.kingdomId === PLAYER_KINGDOM_ID &&
      !state.movementOrders.some((order) => order.armyId === army.id) &&
      !state.siegeOrders.some((order) => order.armyId === army.id),
  );
  if (idleHost && (!ascent.frontLandId || ascent.frontBlocked)) {
    offerMarchOrder(state);
  }
}

/**
 * One Dragon Ascent economy tick.
 *
 * The first block mirrors `advanceRealtimeMonth` (RealtimeSystem) exactly for the
 * mode-agnostic half — income, orders, logistics, the seasonal clock — so this mode inherits
 * every future economy and combat change for free. It then diverges: no acquisitions, no
 * court cards, no bots, no foreign affairs, no directives. Just autopilot, waves, power.
 */
export function advanceAscentTick(state: GameState): void {
  if (state.isDefeated || !state.ascent) return;

  const ownedBefore = ownedLandIds(state);
  const wavesBefore = state.ascent.wavesSurvived;

  // ── Reused verbatim from the classic tick ────────────────────────────────
  collectPlayerIncome(state);
  // Required, not optional: marching onto unsettled ground routes through
  // `occupyEmptyLand`, which files an acquisition order rather than flipping the province
  // on the spot. Without this the host walks into empty districts and simply stands there.
  progressAcquisitions(state);
  progressBuildOrders(state);
  progressSiegeOrders(state);
  progressMovementOrders(state);
  progressRecruitmentOrders(state);
  progressArmyLogistics(state);
  progressCourtModifiers(state);
  refreshCourtSeats(state);

  state.turn += 1;
  advanceSeason(state);

  // ── Dragon Ascent ────────────────────────────────────────────────────────
  state.ascent.marchCooldown = Math.max(0, state.ascent.marchCooldown - 1);
  tickAscentAutopilot(state);
  tickWaveDirector(state);
  tickAutoDefend(state);
  tickInvasions(state);

  // Safety net: every player host is set to autoDefend, so InvasionSystem should never
  // raise the empire-mode battle modal. If some path ever does, delegate it rather than
  // leaving the run paused on a modal this mode does not render.
  if (state.pendingBattle) {
    resolvePendingBattle(state, 'delegate');
  }

  detectConquests(state, ownedBefore);
  tickAscentProgress(state);

  // Mandate (era) rises with the realm and with every wave broken. Eras raise the building
  // level cap, so the economy's ceiling lifts as the run goes on rather than plateauing.
  const wavesGained = state.ascent.wavesSurvived - wavesBefore;
  const landsGained = state.lands.filter(
    (land) => land.ownerId === PLAYER_KINGDOM_ID && !ownedBefore.has(land.id),
  ).length;
  addMandate(state, 0.35 + wavesGained * 4 + landsGained * 2);

  trackScore(state);
  state.message = state.message || t('msg.economyTick', { year: state.year, season: seasonLabel(state.season) });

  offerEarnedPrompts(state);
  checkAscentDefeat(state);
  drainAscentPrompts(state);

  refreshPlayerVisibility(state);
}
