/**
 * What a fought defence costs the ground, and what the throne can pay to make it good.
 *
 * Two reports, one cause. *Multiple fight on a land → the land immediately restore full powers
 * after fight* and *if your kingdom have no people why it defend still high?* Both came from the
 * same shape: only the watched fight (3% of engagements) ever charged the province, the other 97%
 * resolved in a hidden roll that cost a held line nothing, and nothing a fight did ever touched a
 * building. Measured on seed 55: one province, no army, forty-two waves, seventeen capital
 * defences from wave 22 on and every one of them `us 6958 -> 6958`.
 *
 * `chargeProvinceForDefence` is now the one door both paths go through: the dead are people, the
 * turnout is spent, the walls are breached, and building levels are knocked down. Then, if the
 * damage is worth a decision, the restore card asks how hard the rebuilding is pushed — haste
 * (the whole bill, whole at once), steady (under half, at four times the pace) or endure (free,
 * on the ground's own clocks). Dragon Ascent only; every function here returns at once elsewhere.
 */
import { PLAYER_KINGDOM_ID } from '../../game/constants';
import {
  HIDDEN_DEFENCE_LOSS_AT_PARITY,
  HIDDEN_DEFENCE_LOSS_MAX,
  HIDDEN_DEFENCE_LOSS_MIN,
  LEVY_DEAD_POPULATION_SHARE,
  LEVY_POWER_PER_MAN,
  RESTORE_ASK_MIN_BREACH,
  RESTORE_ASK_MIN_SPENT,
  RESTORE_FOOD_PER_100_SPENT,
  RESTORE_FOOD_PER_LEVEL,
  RESTORE_GOLD_PER_100_SPENT,
  RESTORE_GOLD_PER_BREACH,
  RESTORE_GOLD_PER_LEVEL,
  RESTORE_HASTE_EXHAUSTION_LEFT,
  RESTORE_STEADY_EXHAUSTION_LEFT,
  RESTORE_STEADY_SHARE,
  RESTORE_STEADY_TICKS,
  RESTORE_SUPPLIES_PER_BREACH,
  RESTORE_SUPPLIES_PER_LEVEL,
  RUIN_LEVELS_PER_LOSS,
  RUIN_REBUILD_TICKS,
  WALL_ATTRITION_SHARE,
  WALL_DEFENCE_FLOOR,
} from '../../game/ascentConfig';
import { enqueueAscentPrompt } from './AscentState';
import {
  BUILDING_ECONOMY, applyResourceDelta, canSpend, refreshAllLandOutputs,
} from '../ResourceSystem';
import { masonryPowerPerDefense } from '../WarSystem';
import { findLand } from '../LandSystem';
import { pushToast } from '../empire/notifications';
import { t } from '../../i18n';
import type { AscentPrompt, GameState, Land, LandBuildingType, ResourceBag, RestoreOption } from '../../state/types';

/** What one defence took from a province, as the card reports it. */
export interface DefenceCharge {
  dead: number;
  spent: number;
  breach: number;
  ruins: number;
}

/**
 * The share of a turnout a *hidden-roll* defence spends, from the odds it was held at.
 *
 * At parity `HIDDEN_DEFENCE_LOSS_AT_PARITY`; a host a third the size costs a third of that; never
 * nothing, never the whole. It is the figure the levy would have lost had the screen opened for
 * this fight, which is what makes the two paths the same fight.
 */
export function hiddenDefenceLossShare(attackerPower: number, defenderPower: number): number {
  const odds = attackerPower / Math.max(1, defenderPower);
  return Math.max(HIDDEN_DEFENCE_LOSS_MIN, Math.min(HIDDEN_DEFENCE_LOSS_MAX, HIDDEN_DEFENCE_LOSS_AT_PARITY * odds));
}

/**
 * Charges a province for a defence it fought, whether the screen opened or not.
 *
 * `lostShare` is the share of the turnout that fell; `militiaDead` the men of the watch among
 * them (already removed from `localSoldiers` by the caller). The population pays for the dead,
 * the turnout is spent by the share, the walls take `WALL_ATTRITION_SHARE` of it as a breach, and
 * building levels come down in proportion. Then the restore card is raised if there is enough to
 * decide about. Ascent only: the classic modes' hidden roll stays exactly what it was.
 */
export function chargeProvinceForDefence(
  state: GameState,
  land: Land,
  lostShare: number,
  militiaDead: number,
): DefenceCharge | undefined {
  if (state.gameMode !== 'ascent' || !state.ascent) return undefined;
  if (land.ownerId !== PLAYER_KINGDOM_ID) return undefined;
  const share = Math.max(0, Math.min(1, lostShare));

  /**
   * The dead were people. The militia is drawn from `land.population` (`militiaCapacity`), and
   * the men who did not come back used to vanish from `localSoldiers` and from nowhere else, so
   * the watch regrew out of the very people who had died. Bounded so a district can never be
   * emptied by its own defence.
   */
  const dead = Math.max(0, Math.round(militiaDead * LEVY_DEAD_POPULATION_SHARE));
  if (dead > 0) {
    land.population = Math.max(Math.round(land.population * 0.25), land.population - dead);
  }

  // The turnout is spent in the share it fell, to be made good over `GARRISON_RECOVER_SEASONS`.
  land.garrisonExhaustion = Math.min(1, (land.garrisonExhaustion ?? 0) + share);

  // The masonry that stood in for the rest of the turnout. Floored rather than allowed to reach
  // nothing: a province with no walls left is a province that cannot be held at all.
  const breach = Math.round(land.defense * share * WALL_ATTRITION_SHARE);
  let taken = 0;
  if (breach > 0) {
    taken = Math.max(0, Math.min(breach, land.defense - WALL_DEFENCE_FLOOR));
    land.defense -= taken;
    if (taken > 0) land.wallsBreached = (land.wallsBreached ?? 0) + taken;
  }

  // And the district itself: a fight across a province burns its farms and houses. Only levels
  // above one are taken — a level-one farm is still a farm, just a poorer one — and never the
  // walls and towers, which the breach above already charges.
  const ruins = knockDownLevels(state, land, Math.round(share * RUIN_LEVELS_PER_LOSS * land.buildings.length));

  // The clock the militia waits out before it starts raising again.
  land.levyReturnedTurn = state.turn;

  const charge: DefenceCharge = { dead, spent: share, breach: taken, ruins };
  raiseRestoreCard(state, land, charge);
  return charge;
}

function knockDownLevels(state: GameState, land: Land, levels: number): number {
  let taken = 0;
  for (let i = 0; i < levels; i += 1) {
    // The tallest first, and no dice: a fight burns what stands out, and drawing on `Math.random`
    // here shifted every seeded fight that followed it, which is what made two costly-victory
    // checks flap between runs.
    const candidates = land.buildings
      .filter((building) => building.level > 1 && BUILDING_ECONOMY[building.type].category !== 'military')
      .sort((a, b) => b.level - a.level);
    if (candidates.length === 0) break;
    const hit = candidates[0];
    hit.level -= 1;
    (land.ruins ??= []).push(hit.type);
    taken += 1;
  }
  if (taken > 0) refreshAllLandOutputs(state);
  return taken;
}

/** Puts one burnt level back on the building of that type that has the least. */
function rebuildOneLevel(state: GameState, land: Land): boolean {
  const ruins = land.ruins;
  if (!ruins || ruins.length === 0) return false;
  const type = ruins.shift() as LandBuildingType;
  if (ruins.length === 0) land.ruins = undefined;
  const target = land.buildings
    .filter((building) => building.type === type)
    .sort((a, b) => a.level - b.level)[0];
  // The building was pulled down since — nothing to rebuild, the entry is simply gone.
  if (!target) return false;
  target.level += 1;
  return true;
}

/**
 * Burnt levels come back on their own, one every `RUIN_REBUILD_TICKS` per province — or at four
 * times that pace while a `steady` restore is paid for. Called once per Ascent tick beside the
 * masonry and the turnout, the three halves of the same recovery.
 */
export function rebuildRuins(state: GameState): void {
  if (state.gameMode !== 'ascent') return;
  let changed = false;
  for (const land of state.lands) {
    if (!land.ruins?.length) continue;
    if (land.ownerId !== PLAYER_KINGDOM_ID) continue;
    const hasted = (land.restoreHasteUntil ?? -1) > state.turn;
    const period = hasted ? Math.max(1, Math.round(RUIN_REBUILD_TICKS / 4)) : RUIN_REBUILD_TICKS;
    if (state.turn % period !== 0) continue;
    if (rebuildOneLevel(state, land)) changed = true;
  }
  if (changed) refreshAllLandOutputs(state);
}

/** Whether a `steady` restore is still paying for pace on this province. */
export function restoreHasted(state: GameState, land: Land): boolean {
  return (land.restoreHasteUntil ?? -1) > state.turn;
}

/** Men of the turnout still recovering, so the bill can price feeding and re-arming them. */
function spentMen(state: GameState, land: Land): number {
  const spent = land.garrisonExhaustion ?? 0;
  if (spent <= 0) return 0;
  const wallsMen = (land.defense * masonryPowerPerDefense(state)) / LEVY_POWER_PER_MAN;
  return Math.round(spent * (land.localSoldiers + wallsMen));
}

/** The whole bill for making the province good at once, priced off what is standing damaged now. */
export function restoreBill(state: GameState, land: Land): Partial<ResourceBag> {
  const breach = Math.round(land.wallsBreached ?? 0);
  const ruins = land.ruins?.length ?? 0;
  const men = spentMen(state, land);
  const bill: Partial<ResourceBag> = {
    gold: Math.round(breach * RESTORE_GOLD_PER_BREACH + ruins * RESTORE_GOLD_PER_LEVEL + (men / 100) * RESTORE_GOLD_PER_100_SPENT),
    food: Math.round(ruins * RESTORE_FOOD_PER_LEVEL + (men / 100) * RESTORE_FOOD_PER_100_SPENT),
    supplies: Math.round(breach * RESTORE_SUPPLIES_PER_BREACH + ruins * RESTORE_SUPPLIES_PER_LEVEL),
  };
  for (const key of Object.keys(bill) as (keyof ResourceBag)[]) {
    if (!bill[key]) delete bill[key];
  }
  return bill;
}

function scaled(bill: Partial<ResourceBag>, share: number): Partial<ResourceBag> {
  const out: Partial<ResourceBag> = {};
  for (const [key, value] of Object.entries(bill) as [keyof ResourceBag, number][]) {
    const v = Math.ceil(value * share);
    if (v > 0) out[key] = v;
  }
  return out;
}

export function buildRestoreOptions(state: GameState, land: Land): RestoreOption[] {
  const full = restoreBill(state, land);
  const steady = scaled(full, RESTORE_STEADY_SHARE);
  return [
    { id: 'haste', cost: full, affordable: Object.keys(full).length > 0 && canSpend(state, full) },
    { id: 'steady', cost: steady, affordable: Object.keys(steady).length > 0 && canSpend(state, steady) },
    // Always takeable: the player must never be cornered with no legal move.
    { id: 'endure', affordable: true },
  ];
}

/**
 * Asks once per province per wave, and only when the damage is worth the interruption. A card
 * already waiting for the same province is replaced with the running total rather than stacked —
 * four assaults on the seat in one wave are one question, not four.
 */
function raiseRestoreCard(state: GameState, land: Land, charge: DefenceCharge): void {
  const ascent = state.ascent;
  if (!ascent) return;
  const material = charge.ruins > 0
    || charge.breach >= RESTORE_ASK_MIN_BREACH
    || charge.spent >= RESTORE_ASK_MIN_SPENT;
  if (!material) return;

  const queued = ascent.promptQueue.find(
    (prompt) => prompt.kind === 'restore-land' && prompt.landId === land.id,
  );
  const onScreen = state.pendingAscentPrompt?.kind === 'restore-land'
    && state.pendingAscentPrompt.landId === land.id;
  if (!queued && !onScreen && land.restoreAskedWave === ascent.wave) return;

  const prior = queued && queued.kind === 'restore-land' ? queued : undefined;
  const merged = {
    kind: 'restore-land' as const,
    landId: land.id,
    landName: land.name,
    breach: (prior?.breach ?? 0) + charge.breach,
    ruins: (prior?.ruins ?? 0) + charge.ruins,
    dead: (prior?.dead ?? 0) + charge.dead,
    spent: Math.min(1, land.garrisonExhaustion ?? 0),
    options: buildRestoreOptions(state, land),
  };
  if (onScreen) return;
  if (prior) {
    ascent.promptQueue[ascent.promptQueue.indexOf(prior)] = merged;
  } else {
    enqueueAscentPrompt(state, merged);
  }
  land.restoreAskedWave = ascent.wave;
}

/**
 * Answers the card. The price charged is the price *on the card*, not a re-quote: the district
 * keeps healing while the card waits, and re-pricing the bill off what is still standing damaged
 * made a paid-for `haste` unaffordable-by-definition once nothing was left to fix — the resolver
 * refused it, the card stayed up, and the run wedged behind it (measured: no prompt of any kind
 * surfaced for the last 300 ticks of a seeded run). An unknown option dismisses the card; a
 * priced one the treasury cannot meet *now* leaves it standing, as the famine card does.
 */
export function resolveRestore(
  state: GameState,
  prompt: Extract<AscentPrompt, { kind: 'restore-land' }>,
  optionId: string,
): boolean {
  const land = findLand(state, prompt.landId);
  if (!land || land.ownerId !== PLAYER_KINGDOM_ID) return true;
  const option = prompt.options.find((candidate) => candidate.id === optionId);
  if (!option) return true;
  if (option.cost && !canSpend(state, option.cost)) return false;

  switch (option.id) {
    case 'haste': {
      applyResourceDelta(state, negate(option.cost ?? {}));
      const breach = Math.round(land.wallsBreached ?? 0);
      land.defense += breach;
      land.wallsBreached = undefined;
      let levels = 0;
      while (land.ruins?.length) { if (rebuildOneLevel(state, land)) levels += 1; }
      if (levels > 0) refreshAllLandOutputs(state);
      const spent = land.garrisonExhaustion ?? 0;
      land.garrisonExhaustion = spent * RESTORE_HASTE_EXHAUSTION_LEFT > 0.005
        ? spent * RESTORE_HASTE_EXHAUSTION_LEFT
        : undefined;
      pushToast(state, t('ascent.restore.hasteToast', { land: land.name }), 'reward');
      break;
    }
    case 'steady': {
      applyResourceDelta(state, negate(option.cost ?? {}));
      land.restoreHasteUntil = state.turn + RESTORE_STEADY_TICKS;
      const spent = land.garrisonExhaustion ?? 0;
      land.garrisonExhaustion = spent * RESTORE_STEADY_EXHAUSTION_LEFT > 0.005
        ? spent * RESTORE_STEADY_EXHAUSTION_LEFT
        : undefined;
      pushToast(state, t('ascent.restore.steadyToast', { land: land.name }), 'info');
      break;
    }
    case 'endure':
      break;
  }
  return true;
}

function negate(cost: Partial<ResourceBag>): Partial<ResourceBag> {
  const out: Partial<ResourceBag> = {};
  for (const [key, value] of Object.entries(cost) as [keyof ResourceBag, number][]) out[key] = -value;
  return out;
}
