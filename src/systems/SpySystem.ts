import { isCampaignMode, PLAYER_KINGDOM_ID } from '../game/constants';
import type { GameState, SpyReport } from '../state/types';
import { logEvent } from './empire/notifications';
import { t } from '../i18n';

function makeSpyReport(state: GameState, message: string): SpyReport {
  // Every spy report is also a notification: mirror it into the unified event log so
  // it surfaces in the notification bell alongside empire toasts.
  logEvent(state, message, 'threat');
  return {
    id: `spy-${state.turn}-${Math.floor(Math.random() * 10000)}`,
    tick: state.turn,
    message,
  };
}

export function tickSpySystem(state: GameState): void {
  if (!isCampaignMode(state.gameMode)) return;

  const spymasterHeroId = state.court.seats['spymaster'];
  if (spymasterHeroId) {
    const spymasterHero = state.heroes.find((h) => h.id === spymasterHeroId && h.type === 'agent');
    if (spymasterHero) {
      tickSpymasterIntel(state);
    }
  }

  tickAgentIntel(state);
}

function tickSpymasterIntel(state: GameState): void {
  const warningWindow = spyWarningWindow(state);

  for (const event of state.scheduledCampaignEvents) {
    if (event.resolved || event.type !== 'dynasty-attack') continue;
    const ticksUntil = event.scheduledTick - state.turn;
    if (ticksUntil > 0 && ticksUntil <= warningWindow) {
      const alreadyReported = state.spyReports.some(
        (r) => r.message.includes(event.id) || (r.tick === state.turn && r.message.includes('invasion')),
      );
      if (!alreadyReported) {
        const kingdom = state.kingdoms.find((k) => k.id === event.sourceKingdomId);
        if (kingdom) {
          state.spyReports.push(
            makeSpyReport(state, t('msg.spyReport.dynastyAttack', { kingdom: kingdom.name })),
          );
        }
      }
    }
  }

  // Reveal one ring of neighbors around each rival capital
  for (const kingdom of state.kingdoms) {
    if (kingdom.id === PLAYER_KINGDOM_ID || kingdom.isDefeated) continue;
    const capital = state.lands.find(
      (l) => l.ownerId === kingdom.id && (l.type === 'enemyCastle' || l.type === 'castle'),
    );
    if (capital) {
      capital.isExplored = true;
      for (const neighborId of capital.neighbors) {
        const neighbor = state.lands.find((l) => l.id === neighborId);
        if (neighbor) {
          neighbor.isExplored = true;
        }
      }
    }
  }
}

function tickAgentIntel(state: GameState): void {
  for (const hero of state.heroes) {
    if (hero.type !== 'agent' || !hero.assignedTo) continue;

    const assignedLand = state.lands.find((l) => l.id === hero.assignedTo);
    if (!assignedLand) continue;

    assignedLand.isVisible = true;
    assignedLand.isExplored = true;

    for (const neighborId of assignedLand.neighbors) {
      const neighbor = state.lands.find((l) => l.id === neighborId);
      if (neighbor) {
        neighbor.isVisible = true;
        neighbor.isExplored = true;
      }
    }

    // Report enemy armies at that land
    const enemyArmy = state.armies.find(
      (a) => a.landId === assignedLand.id && a.kingdomId !== PLAYER_KINGDOM_ID,
    );
    if (enemyArmy && state.turn % 3 === 0) {
      const kingdom = state.kingdoms.find((k) => k.id === enemyArmy.kingdomId);
      const total = enemyArmy.units.spearmen + enemyArmy.units.archers + enemyArmy.units.heavyInfantry;
      if (kingdom) {
        state.spyReports.push(
          makeSpyReport(
            state,
            t('msg.spyReport.armySpotted', { kingdom: kingdom.name, land: assignedLand.name }) +
              ` (${total} soldiers)`,
          ),
        );
      }
    }
  }

  // Keep spy reports from getting too large
  if (state.spyReports.length > 20) {
    state.spyReports = state.spyReports.slice(-20);
  }
}

function spyWarningWindow(state: GameState): number {
  const difficulty = state.campaignConfig?.difficulty ?? 'normal';
  if (difficulty === 'easy') return 5;
  if (difficulty === 'hard') return 3;
  if (difficulty === 'ironman') return 2;
  return 4;
}
