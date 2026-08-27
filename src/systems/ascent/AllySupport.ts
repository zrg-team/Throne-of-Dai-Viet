/**
 * **Calling for help, and what turns up.**
 *
 * Asked for as *"can call support from other kingdom (they can send an army to save us if relation
 * high enough): but make it simple, it just directly support to a battle not create army or
 * complicated control."* That constraint is the design, not a simplification of it: a second army
 * the player has to command is a second army to micromanage, and this mode's whole shape is one
 * legible decision at a time.
 *
 * So a relief column is **not a new kind of thing**. `Army.patron` already describes exactly this —
 * a host that fights on our side and that the player cannot order, reinforce, disband or be billed
 * for. Every system that needs to know already checks it: `armyOrders.canOrder`, `StandingOrders`,
 * `AutopilotSystem`, `ConquestSystem`'s host pickers and `ResourceSystem`'s wage and ration passes
 * all skip a patron host, and `BattleSystem` already conscripts one into a defence on the tile it
 * stands on. Dropping an allied column onto the contested province is therefore the entire feature:
 * `enrolArrivals` seats it on the next beat and the fight announces it as relief, because relief is
 * a thing the battle screen has been able to do since the membership rewrite.
 *
 * What it costs is standing, spent on the asking rather than on the outcome — an ally who marches
 * and loses has still marched. The cooldown is what keeps it a plan rather than a button: asking
 * twice in a run is strategy, asking every wave is not on offer.
 */
import { PLAYER_KINGDOM_ID } from '../../game/constants';
import {
  ALLY_AID_COOLDOWN_TICKS,
  ALLY_AID_MIN_RELATIONS,
  ALLY_AID_POWER_SHARE,
  ALLY_AID_STANDING_COST,
} from '../../game/ascentConfig';
import { addOpinionModifier } from '../DiplomacySystem';
import { pushToast } from '../empire/notifications';
import { liveBattles } from './fronts';
import { t } from '../../i18n';
import type { AscentBattle, Army, GameState, Kingdom } from '../../state/types';

/** Prefix on `Army.patron` for a column somebody else's crown sent us. */
export const ALLY_PATRON_PREFIX = 'ally:';

/** The battle a relief column would join: whichever of ours is live and closest to being lost. */
export function battleNeedingRelief(state: GameState): AscentBattle | undefined {
  const ours = liveBattles(state).filter((battle) => battle.role !== 'offence');
  if (ours.length === 0) return undefined;
  // The worst one. A player with two fights running is asking about the one they are losing.
  return [...ours].sort((a, b) => (a.ourHostCount ?? 0) - (b.ourHostCount ?? 0))[0];
}

/** Whether this court will hear the request at all, and why not if it will not. */
export function aidRefusal(
  state: GameState,
  kingdom: Kingdom,
): 'standing' | 'cooling' | 'no-battle' | undefined {
  if ((kingdom.relations ?? 50) < ALLY_AID_MIN_RELATIONS) return 'standing';
  const last = state.ascent?.allyAidTurn?.[kingdom.id];
  if (last !== undefined && state.turn - last < ALLY_AID_COOLDOWN_TICKS) return 'cooling';
  if (!battleNeedingRelief(state)) return 'no-battle';
  return undefined;
}

/**
 * Sends for an ally's column, and stands it on the contested ground.
 *
 * Sized against the invasion it is answering rather than against the ally's own strength: a relief
 * column exists to make a losing fight winnable, and one scaled to an abstract power index would
 * be either irrelevant or decisive depending on a number the player never sees. A share of the
 * host in front of them is legible — it is *help*, not a rescue, and the battle is still theirs.
 */
export function callForAid(state: GameState, kingdomId: string): boolean {
  const ascent = state.ascent;
  const kingdom = state.kingdoms.find((candidate) => candidate.id === kingdomId);
  if (!ascent || !kingdom || aidRefusal(state, kingdom)) return false;

  const battle = battleNeedingRelief(state);
  if (!battle) return false;
  const land = state.lands.find((candidate) => candidate.id === battle.landId);
  if (!land) return false;

  const facing = (battle.theirArmyIds ?? []).reduce((sum, id) => {
    const army = state.armies.find((candidate) => candidate.id === id);
    if (!army) return sum;
    return sum + army.units.spearmen + army.units.archers + army.units.heavyInfantry;
  }, 0);
  const soldiers = Math.max(140, Math.round(Math.max(facing, 400) * ALLY_AID_POWER_SHARE));

  const column: Army = {
    id: `ally-${kingdomId}-${state.turn}`,
    // Ours for the purposes of the fight — `enrolArrivals` reads `kingdomId` to decide sides, and
    // the column is on our side. `patron` is what keeps it out of the player's hands.
    kingdomId: PLAYER_KINGDOM_ID,
    name: t('ascent.envoy.aidColumn', { kingdom: kingdom.name }),
    landId: land.id,
    units: {
      spearmen: Math.round(soldiers * 0.55),
      archers: Math.round(soldiers * 0.3),
      heavyInfantry: Math.round(soldiers * 0.15),
    },
    morale: 92,
    supply: 70,
    // What they brought with them. Nothing refills it: when this is gone the column goes home,
    // which is what stops one ask buying a permanent second army.
    rations: Math.round(soldiers * 0.45),
    provisions: Math.round(soldiers * 0.18),
    level: 1,
    experience: 0,
    experienceToNextLevel: 140,
    autoDefend: true,
    patron: `${ALLY_PATRON_PREFIX}${kingdomId}`,
  };
  state.armies.push(column);

  // Spent on the asking. An ally who marched and lost has still marched, and a cost contingent on
  // the outcome would make this a bet rather than a favour asked of a friend.
  addOpinionModifier(kingdom, {
    id: `aid-asked-${state.turn}`,
    label: t('diplo.mod.aidAsked'),
    value: -ALLY_AID_STANDING_COST,
    decay: 0.35,
    source: 'request',
  });
  ascent.allyAidTurn ??= {};
  ascent.allyAidTurn[kingdomId] = state.turn;

  pushToast(state, t('ascent.envoy.aidSent', { kingdom: kingdom.name, land: land.name }), 'reward');
  return true;
}

/**
 * Sends home any allied column whose larder is empty or whose battle has ended.
 *
 * Called from the ascent tick. Without it the column stands on the map for the rest of the run —
 * uncommandable, unbillable and permanent, which is the exact "second free army" this was written
 * to avoid.
 */
export function tickAllyColumns(state: GameState): void {
  const columns = state.armies.filter((army) => army.patron?.startsWith(ALLY_PATRON_PREFIX));
  if (columns.length === 0) return;

  const contested = new Set(liveBattles(state).map((battle) => battle.landId));
  const going: Army[] = [];
  for (const column of columns) {
    // A column standing in a live fight is never pulled out of it, whatever its larder says:
    // a host vanishing mid-battle reads as a bug, and the fight it came for is the whole point.
    if (contested.has(column.landId)) continue;
    column.rations = Math.max(0, column.rations - 1);
    // The battle it came for is over. It eats its way home, and when the larder is out so is it —
    // which is what keeps one ask from buying a permanent second army.
    if (column.rations <= 0) going.push(column);
  }
  if (going.length === 0) return;
  state.armies = state.armies.filter((army) => !going.includes(army));
}
