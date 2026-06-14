import Phaser from 'phaser';
import { gameConfig } from './game/config';
import type { GameState } from './state/types';

declare global {
  interface Window {
    __mandateState?: GameState;
    __phaserGame?: Phaser.Game;
    __suppressMapInputUntil?: number;
    render_game_to_text?: () => string;
    advanceTime?: (ms: number) => void;
  }
}

const game = new Phaser.Game(gameConfig);
window.__phaserGame = game;

window.render_game_to_text = () => {
  const state = window.__mandateState;

  if (!state) {
    return JSON.stringify({ mode: 'loading' });
  }

  const selectedLand = state.selectedLandId
    ? state.lands.find((land) => land.id === state.selectedLandId)
    : undefined;

  return JSON.stringify({
    coordinateSystem: 'Phaser canvas pixels, origin top-left, x right, y down',
    mode: state.victory ? 'victory' : state.awaitingMoveArmyId ? 'moving_army' : 'playing',
    time: `Year ${state.year}, ${state.season}`,
    realtimeSeconds: Math.round(state.realtimeSeconds),
    mapRenderMode: state.mapRenderMode,
    mapSettings: state.mapSettings,
    resources: state.resources,
    resourceRates: state.resourceRates,
    visibility: {
      visible: state.lands.filter((land) => land.isVisible).length,
      explored: state.lands.filter((land) => land.isExplored).length,
      total: state.lands.length,
    },
    acquisitionOrders: state.acquisitionOrders,
    selectedLand: selectedLand
      ? {
          id: selectedLand.id,
          name: selectedLand.name,
          ownerId: selectedLand.ownerId,
          type: selectedLand.type,
          defense: selectedLand.defense,
          loyalty: selectedLand.loyalty,
          buildings: selectedLand.buildings,
          buildingCapacity: selectedLand.buildingCapacity,
          terrainSummary: selectedLand.terrainSummary,
          outputs: selectedLand.outputs,
        }
      : null,
    armies: state.armies.map((army) => ({
      id: army.id,
      kingdomId: army.kingdomId,
      landId: army.landId,
      total: army.units.spearmen + army.units.archers + army.units.heavyInfantry,
      morale: army.morale,
      supply: army.supply,
    })),
    draftChoices: state.activeHeroDraft?.map((hero) => hero.name) ?? [],
    politicsCard: state.activePoliticsCard?.title ?? null,
    message: state.message,
  });
};

window.advanceTime = (ms: number) => {
  const steps = Math.max(1, Math.round(ms / (1000 / 60)));
  for (let index = 0; index < steps; index += 1) {
    game.step(performance.now(), 1000 / 60);
  }
};
