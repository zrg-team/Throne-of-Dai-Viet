import { PLAYER_KINGDOM_ID } from '../../game/constants';
import { CAPITAL_GRACE_TICKS, LOYALTY_SETTLE_PER_TICK, SUMMON_EVERY_N_WAVES } from '../../game/ascentConfig';
import { pushToast } from '../empire/notifications';
import { progressAcquisitions } from '../AcquisitionSystem';
import { collectPlayerIncome, progressBuildOrders } from '../ResourceSystem';
import {
  progressArmyLogistics,
  progressMovementOrders,
  progressRecruitmentOrders,
  progressSiegeOrders,
} from '../WarSystem';
import { progressCourt } from '../CourtSystem';
import { tickDiplomacy } from '../DiplomacySystem';
import { refreshPlayerVisibility } from '../LandSystem';
import { dissolveGarrisonLevies, tickAutoDefend, tickInvasions, resolvePendingBattle } from '../empire/InvasionSystem';
import { addMandate } from '../empire/MandateSystem';
import { tickGreatPowersYear } from '../empire/GreatPowersSystem';
import { ensureHeroDeck } from '../../data/heroFactory';
import { drainAscentPrompts } from './AscentState';
import { tickAscentAutopilot } from './AutopilotSystem';
import { advanceBattle, beginBattle } from './BattleSystem';
import { tickAscentProgress } from './PowerSystem';
import { tickRaids, tickWaveDirector } from './WaveDirector';
import { detectConquests, ensureAscentLaneState, refreshAscentLaneState } from './ConquestSystem';
import { tickDecisionDirector, tickPromptCooldowns } from './DecisionDirector';
import { endAscentRun } from './AscentResolver';
import { advanceSeasonClock, greatPowersDue } from '../seasonClock';
import { seasonLabel, t } from '../../i18n';
import type { GameState } from '../../state/types';

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
    if (state.ascent) state.ascent.endCause = 'annihilated';
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
    ascent.endCause = 'capital';
    ascent.endLandName = capital.name;
    endAscentRun(state);
    return;
  }
  pushToast(state, t('ascent.capital.lost', { land: capital.name, ticks: remaining }), 'threat');
}

/**
 * Newly-taken provinces come round over time.
 *
 * Without this, the loyalty a method stamps on a province would be a permanent penalty and every
 * player would simply always send the envoy. Drifting upward turns it into what it should be: a
 * *delay* you can choose to pay in seasons or in gold. A seated governor adds to this through
 * `progressCourt`, which is what makes a governorship worth more than a stat line.
 */
function settleOwnedLands(state: GameState): void {
  for (const land of state.lands) {
    if (land.ownerId !== PLAYER_KINGDOM_ID) continue;
    if (land.loyalty >= 100) continue;
    land.loyalty = Math.min(100, land.loyalty + LOYALTY_SETTLE_PER_TICK);
  }
}

/** Keeps the peak-lands figure current; it feeds the run score. */
function trackScore(state: GameState): void {
  if (!state.campaignScore) return;
  const held = state.lands.filter((land) => land.ownerId === PLAYER_KINGDOM_ID).length;
  state.campaignScore.turnsAlive = state.turn;
  state.campaignScore.peakLandsHeld = Math.max(state.campaignScore.peakLandsHeld, held);
}

/**
 * One Dragon Ascent economy tick.
 *
 * The first block mirrors `advanceRealtimeMonth` (RealtimeSystem) exactly for the
 * mode-agnostic half — income, orders, logistics, the court, the seasonal clock — so this mode
 * inherits every future economy and combat change for free. It then diverges: the autopilot
 * executes, the wave director escalates, and the decision director decides what to ask.
 *
 * Deliberately not called: `runBotTurns`, `tickCampaignEvents`, `tickForeignAffairs` (this mode
 * drives rival aggression through its own wave director), `tickSpySystem`, `progressDirectives`,
 * `checkVictory` — an endless run has no map-conquest win condition.
 */
export function advanceAscentTick(state: GameState): void {
  if (state.isDefeated || !state.ascent) return;
  ensureAscentLaneState(state);

  const ownedBefore = ownedLandIds(state);
  const wavesBefore = state.ascent.wavesSurvived;

  // ── Reused verbatim from the classic tick ────────────────────────────────
  collectPlayerIncome(state);
  // Required, not optional: every peaceful claim — bribe, envoy, settle — and marching onto
  // unsettled ground all file acquisition orders rather than flipping the province on the
  // spot. Without this the Conquer lane's non-military methods never complete.
  progressAcquisitions(state);
  progressBuildOrders(state);
  progressSiegeOrders(state);
  progressMovementOrders(state);
  progressRecruitmentOrders(state);
  progressArmyLogistics(state);
  // The full court, not just its modifiers: Favor accrues toward the next hero draft, seated
  // governors raise their province's loyalty, ungoverned provinces drag on stability, and the
  // tax dial's fatigue compounds. That pressure is what makes appointments matter.
  progressCourt(state);
  // Opinion modifiers decay and relations drift back toward each empire's baseline. Normally
  // reached through the campaign-gated `tickForeignAffairs`; called directly here.
  tickDiplomacy(state);

  state.turn += 1;
  advanceSeasonClock(state);
  // The rival empires live on their own: they arm, destabilise, war on each other, collapse
  // and are reborn — so the world the player is fighting is not a static backdrop. On their own
  // tick count rather than on the year, so a longer season does not slow them down with it.
  if (greatPowersDue(state)) tickGreatPowersYear(state);

  // ── Dragon Ascent ────────────────────────────────────────────────────────
  state.ascent.marchCooldown = Math.max(0, state.ascent.marchCooldown - 1);
  tickAscentAutopilot(state);
  // The authored roster is removed from the deck as it is recruited, so a long run empties it
  // and the champion lane — half this mode's identity — quietly stops offering anything.
  ensureHeroDeck(state);

  tickWaveDirector(state);
  tickRaids(state);
  tickAutoDefend(state);
  tickInvasions(state);

  // A field battle is now something the player watches and steers.
  //
  // This used to discard it unconditionally with `resolvePendingBattle(state, 'delegate')`,
  // which is why a host could fight for an entire run without ever being seen to. `beginBattle`
  // opens the watchable engagement; it returns false when there is nothing to watch (no host of
  // ours actually present), and the old silent delegation still covers that case and any run
  // where the player has handed battles back to their generals.
  if (state.pendingBattle) {
    const watched = !state.ascent.autoResolveBattles && beginBattle(state);
    if (!watched) resolvePendingBattle(state, 'delegate');
  }

  // A siege runs across seasons, not seconds. Several beats a tick keeps an engagement to a
  // handful of turns while leaving the player time to raise a host and march it in — which is
  // the whole point of the battle no longer freezing the world.
  advanceBattle(state);

  // Once nothing is being fought, any province that turned its garrison out takes it back in.
  // A levy is a host for the length of one battle and no longer — see `raiseGarrisonLevy`.
  if (!state.ascent.activeBattle && !state.pendingBattle) {
    dissolveGarrisonLevies(state);
  }

  settleOwnedLands(state);
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

  tickPromptCooldowns(state);
  refreshAscentLaneState(state);
  tickDecisionDirector(state);
  checkAscentDefeat(state);
  drainAscentPrompts(state);

  refreshPlayerVisibility(state);
}
