import { progressAcquisitions } from './AcquisitionSystem';
import { checkVictory, refreshPlayerVisibility } from './LandSystem';
import { collectPlayerIncome, progressBuildOrders } from './ResourceSystem';
import { progressArmyLogistics, progressMovementOrders, progressRecruitmentOrders, progressSiegeOrders } from './WarSystem';
import { runBotTurns } from './BotSystem';
import { progressCourt } from './CourtSystem';
import { progressPoliticsCooldown } from './PoliticsSystem';
import { tickCampaignEvents } from './CampaignEventSystem';
import { tickForeignAffairs } from './ForeignAffairsSystem';
import { tickSpySystem } from './SpySystem';
import { checkCampaignDefeat, tickDynastyStatus } from './DynastySystem';
import { tickInvasions } from './empire/InvasionSystem';
import { progressDirectives } from './empire/DirectiveSystem';
import { tickThreatDirector } from './empire/ThreatDirector';
import { maybeDrawForeignCard } from './ForeignEventSystem';
import { isCampaignMode, PLAYER_KINGDOM_ID } from '../game/constants';
import type { GameState, Season } from '../state/types';
import { seasonLabel, t } from '../i18n';

const seasons: Season[] = ['Spring', 'Summer', 'Autumn', 'Winter'];

export function advanceRealtimeMonth(state: GameState): void {
  if (state.victory || state.isDefeated) {
    return;
  }

  collectPlayerIncome(state);
  const acquisitionCompleted = progressAcquisitions(state);
  const buildCompleted = progressBuildOrders(state);
  progressSiegeOrders(state);
  progressMovementOrders(state);
  progressRecruitmentOrders(state);
  progressArmyLogistics(state);
  progressCourt(state);
  progressPoliticsCooldown(state);

  state.turn += 1;
  const nextSeasonIndex = seasons.indexOf(state.season) + 1;

  if (nextSeasonIndex >= seasons.length) {
    state.season = seasons[0];
    state.year += 1;
  } else {
    state.season = seasons[nextSeasonIndex];
  }

  state.ordersRemaining = 3;
  if (!acquisitionCompleted && !buildCompleted) {
    state.message = t('msg.economyTick', { year: state.year, season: seasonLabel(state.season) });
  }

  if (isCampaignMode(state.gameMode) && !state.isDefeated) {
    tickCampaignEvents(state);
    tickForeignAffairs(state);
    maybeDrawForeignCard(state);
    tickSpySystem(state);
    tickInvasions(state);
    if (state.gameMode === 'empire') {
      tickThreatDirector(state);
      progressDirectives(state);
    }
    tickDynastyStatus(state);
    checkCampaignDefeat(state);
    if (state.campaignScore) {
      state.campaignScore.turnsAlive = state.turn;
      state.campaignScore.peakLandsHeld = Math.max(
        state.campaignScore.peakLandsHeld,
        state.lands.filter((l) => l.ownerId === PLAYER_KINGDOM_ID).length,
      );
    }
  }

  runBotTurns(state);
  refreshPlayerVisibility(state);
  checkVictory(state);
}
