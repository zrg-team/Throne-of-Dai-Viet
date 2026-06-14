import { PLAYER_KINGDOM_ID } from '../game/constants';
import { clamp } from '../utils/math';
import type { GameState, ResourceBag, ResourceKey } from '../state/types';

export function canSpend(state: GameState, cost: Partial<ResourceBag>): boolean {
  return Object.entries(cost).every(([key, value]) => {
    const resourceKey = key as ResourceKey;
    return state.resources[resourceKey] >= Math.abs(value ?? 0);
  });
}

export function applyResourceDelta(state: GameState, delta: Partial<ResourceBag>): void {
  for (const [key, value] of Object.entries(delta)) {
    const resourceKey = key as ResourceKey;
    const current = state.resources[resourceKey];
    const next = current + (value ?? 0);
    state.resources[resourceKey] =
      resourceKey === 'stability' ? clamp(next, 0, 100) : Math.max(0, next);
  }
}

export function collectPlayerIncome(state: GameState): void {
  for (const land of state.lands) {
    if (land.ownerId !== PLAYER_KINGDOM_ID) {
      continue;
    }

    applyResourceDelta(state, {
      [land.bonus.resource]: land.bonus.amount + land.upgradeLevel * 4,
    });

    if (land.upgradeLevel > 0) {
      applyResourceDelta(state, land.upgrade.bonus);
    }
  }

  for (const hero of state.heroes) {
    if (hero.type === 'minister' && hero.id === 'su-gia') {
      applyResourceDelta(state, { influence: 5 });
    }
  }
}

export function payPlayerUpkeep(state: GameState): void {
  const heroUpkeep = state.heroes.reduce((sum, hero) => sum + hero.upkeepGold, 0);
  const playerTroops = state.armies
    .filter((army) => army.kingdomId === PLAYER_KINGDOM_ID)
    .reduce(
      (sum, army) => sum + army.units.spearmen + army.units.archers + army.units.heavyInfantry,
      0,
    );
  const foodUpkeep = Math.ceil(playerTroops / 250);

  applyResourceDelta(state, {
    gold: -heroUpkeep,
    food: -foodUpkeep,
  });

  if (state.resources.food <= 0) {
    applyResourceDelta(state, { stability: -8 });
    state.message = 'Food stores are empty. Stability suffers.';
  }
}
