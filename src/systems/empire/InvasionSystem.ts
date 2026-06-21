import { PLAYER_KINGDOM_ID } from '../../game/constants';
import { findLand, getAcquisitionTicksRequired } from '../LandSystem';
import { createBattlePreview } from '../WarSystem';
import { applyResourceDelta, refreshAllLandOutputs } from '../ResourceSystem';
import type { Army, Difficulty, GameState, InvasionRecord, Kingdom, Land } from '../../state/types';
import { t } from '../../i18n';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function totalUnits(army: Army): number {
  return army.units.spearmen + army.units.archers + army.units.heavyInfantry;
}

function difficultyArmyScale(difficulty: Difficulty | undefined): number {
  if (difficulty === 'easy') return 0.7;
  if (difficulty === 'hard') return 1.35;
  if (difficulty === 'ironman') return 1.7;
  return 1.0;
}

function personalityWeight(kingdom: Kingdom): number {
  if (kingdom.personality === 'aggressive') return 1.15;
  if (kingdom.personality === 'expansionist') return 1.08;
  if (kingdom.personality === 'economic') return 0.85;
  return 0.95;
}

function playerLands(state: GameState): Land[] {
  return state.lands.filter((l) => l.ownerId === PLAYER_KINGDOM_ID);
}

function playerCapital(state: GameState): Land | undefined {
  return state.lands.find((l) => l.ownerId === PLAYER_KINGDOM_ID && l.type === 'castle');
}

function nearestLand(from: Land, candidates: Land[]): Land | undefined {
  let best: Land | undefined;
  let bestDist = Infinity;
  for (const land of candidates) {
    const d = (land.x - from.x) ** 2 + (land.y - from.y) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = land;
    }
  }
  return best;
}

/** First land to move to along the shortest path from `fromId` to `toId`, across any owner. */
function findInvasionStep(state: GameState, fromId: string, toId: string): string | undefined {
  if (fromId === toId) {
    return undefined;
  }
  const cameFrom = new Map<string, string>();
  const visited = new Set<string>([fromId]);
  const queue: string[] = [fromId];

  while (queue.length > 0) {
    const current = queue.shift() as string;
    const land = findLand(state, current);
    if (!land) {
      continue;
    }
    for (const neighborId of land.neighbors) {
      if (visited.has(neighborId)) {
        continue;
      }
      visited.add(neighborId);
      cameFrom.set(neighborId, current);
      if (neighborId === toId) {
        let step = neighborId;
        while (cameFrom.get(step) !== fromId) {
          step = cameFrom.get(step) as string;
        }
        return step;
      }
      queue.push(neighborId);
    }
  }
  return undefined;
}

function applyInvaderLosses(army: Army, rate: number): void {
  army.units.spearmen = Math.max(0, Math.floor(army.units.spearmen * (1 - rate)));
  army.units.archers = Math.max(0, Math.floor(army.units.archers * (1 - rate)));
  army.units.heavyInfantry = Math.max(0, Math.floor(army.units.heavyInfantry * (1 - rate)));
}

function despawnInvasion(state: GameState, record: InvasionRecord): void {
  state.armies = state.armies.filter((a) => a.id !== record.armyId);
  state.siegeOrders = state.siegeOrders.filter((o) => o.armyId !== record.armyId);
  state.invasions = (state.invasions ?? []).filter((r) => r !== record);
}

function recordArmyDefeated(state: GameState, total: number): void {
  if (!state.campaignScore) {
    return;
  }
  state.campaignScore.armiesDefeated += 1;
  state.campaignScore.largestArmyDefeated = Math.max(state.campaignScore.largestArmyDefeated, total);
}

// ─────────────────────────────────────────────────────────────────────────────
// Spawning an invasion
// ─────────────────────────────────────────────────────────────────────────────

/** Replaces the on-map `launchDynastyAttack` for empire mode: spawns one or more off-map hosts at the frontier. */
export function launchOffMapInvasion(state: GameState, kingdomId: string | undefined): void {
  if (state.gameMode !== 'empire' || !kingdomId) {
    return;
  }
  const kingdom = state.kingdoms.find((k) => k.id === kingdomId && !k.isDefeated && k.id !== PLAYER_KINGDOM_ID);
  if (!kingdom) {
    return;
  }

  const capital = playerCapital(state) ?? playerLands(state)[0];
  if (!capital) {
    return;
  }

  // Frontier staging grounds: neutral districts far from the capital.
  const neutralEdges = state.lands
    .filter((l) => l.ownerId === 'neutral')
    .sort((a, b) => ((b.x - capital.x) ** 2 + (b.y - capital.y) ** 2) - ((a.x - capital.x) ** 2 + (a.y - capital.y) ** 2));
  if (neutralEdges.length === 0) {
    return;
  }

  const relations = kingdom.relations ?? 50;
  const conquestChance =
    0.4 + (relations < 35 ? 0.3 : relations < 50 ? 0.1 : 0) + (personalityWeight(kingdom) > 1 ? 0.18 : 0);
  const intent: InvasionRecord['intent'] = Math.random() < conquestChance ? 'conquest' : 'raid';

  // Conquest with very cold relations can field a coalition of 2-3 hosts.
  let armyCount = 1;
  if (intent === 'conquest') {
    if (relations < 25 && Math.random() < 0.4) armyCount = 3;
    else if (relations < 40 && Math.random() < 0.5) armyCount = 2;
  }

  const scale = difficultyArmyScale(state.campaignConfig?.difficulty) * personalityWeight(kingdom);
  const growth = 1 + state.turn * 0.02; // later invasions hit harder

  state.invasions ??= [];
  for (let i = 0; i < armyCount; i += 1) {
    const stage = neutralEdges[i % neutralEdges.length];
    const size = Math.round((180 + Math.floor(Math.random() * 140)) * scale * growth);
    const army: Army = {
      id: `invasion-${kingdomId}-${state.turn}-${i}`,
      kingdomId,
      name: `${kingdom.name} ${intent === 'conquest' ? 'War Host' : 'Raiders'}`,
      landId: stage.id,
      units: {
        spearmen: Math.floor(size * 0.6),
        archers: Math.floor(size * 0.28),
        heavyInfantry: Math.floor(size * 0.12),
      },
      morale: 85,
      supply: 90,
      rations: 350,
      provisions: 250,
      level: 2,
      experience: 0,
      experienceToNextLevel: 160,
    };
    state.armies.push(army);
    state.invasions.push({ armyId: army.id, kingdomId, intent });
  }

  state.message = t('empire.invade.muster', { kingdom: kingdom.name, armies: armyCount });
}

// ─────────────────────────────────────────────────────────────────────────────
// Marching + resolving invasions each tick
// ─────────────────────────────────────────────────────────────────────────────

export function tickInvasions(state: GameState): void {
  if (state.gameMode !== 'empire' || !state.invasions || state.invasions.length === 0) {
    return;
  }

  for (const record of [...state.invasions]) {
    const army = state.armies.find((a) => a.id === record.armyId);
    if (!army || totalUnits(army) <= 0) {
      // Already wiped out by the player elsewhere.
      if (army) {
        despawnInvasion(state, record);
      } else {
        state.invasions = (state.invasions ?? []).filter((r) => r !== record);
      }
      continue;
    }

    // A host mid-siege stays put until progressSiegeOrders resolves it.
    if (state.siegeOrders.some((o) => o.armyId === army.id)) {
      continue;
    }

    // A raider that has done its damage marches back to the frontier and vanishes.
    if (record.pillaged) {
      const exitId = record.exitLandId;
      if (!exitId || army.landId === exitId) {
        state.message = t('empire.invade.withdraw', { kingdom: kingdomName(state, record.kingdomId) });
        despawnInvasion(state, record);
        continue;
      }
      const step = findInvasionStep(state, army.landId, exitId);
      if (step) {
        army.landId = step;
      } else {
        despawnInvasion(state, record);
      }
      continue;
    }

    const target = chooseTarget(state, army, record);
    if (!target) {
      // Nothing left to attack (player eliminated) — let defeat checks handle it.
      continue;
    }

    const here = findLand(state, army.landId);
    const adjacentToTarget = here?.neighbors.includes(target.id) ?? false;

    if (target.ownerId === PLAYER_KINGDOM_ID && adjacentToTarget) {
      resolveInvaderBattle(state, army, record, target);
      continue;
    }

    // March one land closer.
    const step = findInvasionStep(state, army.landId, target.id);
    if (!step) {
      continue;
    }
    const stepLand = findLand(state, step);
    if (stepLand?.ownerId === PLAYER_KINGDOM_ID) {
      resolveInvaderBattle(state, army, record, stepLand);
    } else {
      army.landId = step;
    }
  }
}

function chooseTarget(state: GameState, army: Army, record: InvasionRecord): Land | undefined {
  const here = findLand(state, army.landId);
  const owned = playerLands(state);
  if (owned.length === 0 || !here) {
    return undefined;
  }
  if (record.intent === 'conquest') {
    return playerCapital(state) ?? nearestLand(here, owned);
  }
  return nearestLand(here, owned);
}

function resolveInvaderBattle(state: GameState, army: Army, record: InvasionRecord, land: Land): void {
  const preview = createBattlePreview(state, army.id, land.id);
  if (!preview) {
    return;
  }
  const preTotal = totalUnits(army);
  // Walls give the defender a slight edge over a raw power comparison.
  const victory = preview.attackerPower >= preview.defenderPower * 0.85;

  if (!victory) {
    applyInvaderLosses(army, 0.4);
    army.morale = Math.max(20, army.morale - 16);
    awardDefenderXp(state, land, preview.defenderPower);

    if (totalUnits(army) < 40) {
      recordArmyDefeated(state, preTotal);
      state.message = t('empire.invade.repelled', { kingdom: kingdomName(state, record.kingdomId), land: land.name });
      despawnInvasion(state, record);
      return;
    }
    // A bloodied raider gives up and withdraws; a war host keeps grinding.
    if (record.intent === 'raid') {
      record.pillaged = true;
      record.exitLandId = farthestNeutralFromCapital(state)?.id;
    }
    return;
  }

  // Invader wins the field.
  applyInvaderLosses(army, 0.16);
  retreatDefenders(state, land);

  if (record.intent === 'raid') {
    pillage(state, land);
    record.pillaged = true;
    record.exitLandId = farthestNeutralFromCapital(state)?.id;
    state.message = t('empire.invade.raidHit', { kingdom: kingdomName(state, record.kingdomId), land: land.name });
    return;
  }

  // Conquest: occupy and lay siege; progressSiegeOrders flips ownership.
  const fromLandId = army.landId;
  army.landId = land.id;
  state.siegeOrders.push({
    landId: land.id,
    armyId: army.id,
    attackerKingdomId: army.kingdomId,
    fromLandId,
    progress: 0,
    required: getAcquisitionTicksRequired(land),
  });
  state.message = t('empire.invade.besiege', { kingdom: kingdomName(state, record.kingdomId), land: land.name });
}

function retreatDefenders(state: GameState, land: Land): void {
  const defenders = state.armies.filter((a) => a.kingdomId === PLAYER_KINGDOM_ID && a.landId === land.id);
  for (const defender of defenders) {
    const retreat = land.neighbors
      .map((id) => findLand(state, id))
      .find((l) => l?.ownerId === PLAYER_KINGDOM_ID);
    if (retreat) {
      defender.landId = retreat.id;
    }
    defender.morale = Math.max(25, defender.morale - 18);
    applyInvaderLosses(defender, 0.18);
  }
}

function awardDefenderXp(state: GameState, land: Land, defenderPower: number): void {
  const defender = state.armies.find((a) => a.kingdomId === PLAYER_KINGDOM_ID && a.landId === land.id);
  if (!defender) {
    return;
  }
  defender.experience += Math.max(8, Math.round(defenderPower / 90));
  while (defender.level < 5 && defender.experience >= defender.experienceToNextLevel) {
    defender.experience -= defender.experienceToNextLevel;
    defender.level += 1;
    defender.experienceToNextLevel = 100 + (defender.level - 1) * 60;
    defender.morale = Math.min(100, defender.morale + 5);
  }
}

function pillage(state: GameState, land: Land): void {
  land.loyalty = Math.max(15, land.loyalty - 22);
  const lootGold = Math.min(state.resources.gold, 25);
  const lootFood = Math.min(state.resources.food, 35);
  applyResourceDelta(state, { gold: -lootGold, food: -lootFood });
  if (land.buildings.length > 0) {
    land.buildings.splice(Math.floor(Math.random() * land.buildings.length), 1);
  }
  if (state.dynastyStatus) {
    state.dynastyStatus.farmerUnrest = Math.min(100, state.dynastyStatus.farmerUnrest + 10);
  }
  refreshAllLandOutputs(state);
}

function farthestNeutralFromCapital(state: GameState): Land | undefined {
  const capital = playerCapital(state) ?? playerLands(state)[0];
  if (!capital) {
    return undefined;
  }
  return state.lands
    .filter((l) => l.ownerId === 'neutral')
    .sort((a, b) => ((b.x - capital.x) ** 2 + (b.y - capital.y) ** 2) - ((a.x - capital.x) ** 2 + (a.y - capital.y) ** 2))[0];
}

function kingdomName(state: GameState, kingdomId: string): string {
  return state.kingdoms.find((k) => k.id === kingdomId)?.name ?? kingdomId;
}
