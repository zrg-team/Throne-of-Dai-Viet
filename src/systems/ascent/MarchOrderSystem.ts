import { NEUTRAL_OWNER_ID, PLAYER_KINGDOM_ID } from '../../game/constants';
import {
  MARCH_HOLD_TICKS,
  MARCH_MIN_WIN_CHANCE,
  MARCH_REPROMPT_TICKS,
  XP_PER_LAND_TAKEN,
} from '../../game/ascentConfig';
import { armyPower, createBattlePreview, findLandPath, issueMoveOrder } from '../WarSystem';
import { enqueueAscentPrompt } from './AscentState';
import { addAscentXp, landGarrisonPower } from './PowerSystem';
import type { GameState, Land, MarchTarget } from '../../state/types';

/** How many provinces to offer. Enough for a real choice, few enough to read at a glance. */
const MAX_MARCH_TARGETS = 4;

/** Provinces bordering the realm that we do not already own. */
function conquerableNeighbours(state: GameState): Land[] {
  const owned = state.lands.filter((land) => land.ownerId === PLAYER_KINGDOM_ID);
  const seen = new Set<string>();
  const out: Land[] = [];

  for (const land of owned) {
    for (const neighbourId of land.neighbors) {
      if (seen.has(neighbourId)) continue;
      seen.add(neighbourId);
      const neighbour = state.lands.find((candidate) => candidate.id === neighbourId);
      if (neighbour && neighbour.ownerId !== PLAYER_KINGDOM_ID) {
        out.push(neighbour);
      }
    }
  }

  return out;
}

/**
 * The one-word reason to want this province, shown as the card's reward tag. This is what
 * makes the choice a real decision rather than "pick the highest win chance".
 */
function rewardTag(land: Land): string {
  if (land.terrainSummary.shrine > 0) return 'shrine';
  const { gold, food, supplies } = land.outputs;
  const best = Math.max(gold, food, supplies);
  if (best <= 0) return 'plain';
  if (best === gold) return 'gold';
  if (best === supplies) return 'iron';
  if (best === food) return 'food';
  return 'plain';
}

/**
 * Honest win chance against a province.
 *
 * Prefers the real `createBattlePreview` when a host already borders the target; otherwise
 * mirrors its formula against the garrison so a multi-leg march still shows a truthful
 * number rather than a guess. Zero armies reads as 0% — which is the correct warning.
 */
function estimateWinChance(state: GameState, land: Land): number {
  // An unsettled neutral district is walked into, not stormed — `progressMovementOrders`
  // routes it to `occupyEmptyLand` with no battle at all. Scoring it like a defended
  // province would bury the realm's easiest expansion under worse options.
  if (land.ownerId === NEUTRAL_OWNER_ID && !land.hasVillage) return 100;

  const armies = state.armies.filter((army) => army.kingdomId === PLAYER_KINGDOM_ID);
  if (armies.length === 0) return 0;

  let best = 0;
  for (const army of armies) {
    const preview = createBattlePreview(state, army.id, land.id);
    if (preview) {
      best = Math.max(best, preview.winChance);
      continue;
    }
    const attack = armyPower(state, army);
    const defend = landGarrisonPower(land);
    best = Math.max(best, Math.round((attack / Math.max(1, attack + defend)) * 100));
  }
  return best;
}

/**
 * Can a host actually get there? `findLandPath` only routes through owned territory, so a
 * province that borders a cut-off exclave is unreachable no matter how weak it is. Offering
 * it would hand the player a target their armies then refuse to march on.
 */
function isReachable(state: GameState, landId: string): boolean {
  const armies = state.armies.filter((army) => army.kingdomId === PLAYER_KINGDOM_ID);
  const origins = armies.length > 0
    ? armies.map((army) => army.landId)
    : state.lands.filter((land) => land.ownerId === PLAYER_KINGDOM_ID).map((land) => land.id);
  return origins.some((from) => from === landId || Boolean(findLandPath(state, from, landId)));
}

export function buildMarchTargets(state: GameState): MarchTarget[] {
  return conquerableNeighbours(state)
    .filter((land) => isReachable(state, land.id))
    .map((land) => ({
      landId: land.id,
      landName: land.name,
      winChance: estimateWinChance(state, land),
      garrison: Math.round(landGarrisonPower(land)),
      rewardTag: rewardTag(land),
    }))
    // Best odds first, then softest. The secondary key matters: with no host raised yet
    // every win chance is 0, and without it the list would be in arbitrary map order.
    .sort((a, b) => b.winChance - a.winChance || a.garrison - b.garrison)
    .slice(0, MAX_MARCH_TARGETS);
}

/** Best odds any current host has against the standing front. 0 when there is no host. */
export function frontWinChance(state: GameState): number {
  const front = state.lands.find((land) => land.id === state.ascent?.frontLandId);
  return front ? estimateWinChance(state, front) : 0;
}

/**
 * Asks where to march next. Fired the instant a province falls (and once at run start), so
 * the conquest never stalls waiting for the player to go find a menu.
 */
export function offerMarchOrder(state: GameState): void {
  if ((state.ascent?.marchCooldown ?? 0) > 0) return;
  const targets = buildMarchTargets(state);
  if (targets.length === 0) return;
  enqueueAscentPrompt(state, { kind: 'march-order', targets });
}

/** Commits to a province: it becomes the front, and every idle host is sent at it. */
export function executeMarchOrder(state: GameState, landId: string): boolean {
  const ascent = state.ascent;
  const land = state.lands.find((candidate) => candidate.id === landId);
  if (!ascent || !land) return false;

  ascent.frontLandId = landId;
  ascent.marchCooldown = MARCH_REPROMPT_TICKS;

  // Choosing a province sets the realm's intent, not a suicide order. Hosts that cannot
  // win yet hold at the border and the autopilot marches them once the odds turn — which
  // is what makes the power curve, rather than the clock, the thing that opens the map.
  if (estimateWinChance(state, land) < MARCH_MIN_WIN_CHANCE) {
    ascent.frontBlocked = true;
    return true;
  }

  for (const army of state.armies) {
    if (army.kingdomId !== PLAYER_KINGDOM_ID) continue;
    if (state.siegeOrders.some((order) => order.armyId === army.id)) continue;
    issueMoveOrder(state, army.id, landId);
  }
  return true;
}

/** Declines to advance; the autopilot consolidates instead, and stays quiet for a while. */
export function holdMarchOrder(state: GameState): void {
  if (state.ascent) {
    state.ascent.frontLandId = undefined;
    state.ascent.marchCooldown = MARCH_HOLD_TICKS;
  }
}

/**
 * Watches for provinces changing hands. A gain awards momentum and asks for the next
 * march; that pairing is the loop that keeps the run moving without any menu.
 */
export function detectConquests(state: GameState, ownedBefore: Set<string>): void {
  const ascent = state.ascent;
  if (!ascent) return;

  const gained = state.lands.filter(
    (land) => land.ownerId === PLAYER_KINGDOM_ID && !ownedBefore.has(land.id),
  );
  if (gained.length === 0) return;

  addAscentXp(state, XP_PER_LAND_TAKEN * gained.length);

  if (gained.some((land) => land.id === ascent.frontLandId)) {
    ascent.frontLandId = undefined;
  }
  offerMarchOrder(state);
}
