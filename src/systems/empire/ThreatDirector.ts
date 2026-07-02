import { PLAYER_KINGDOM_ID } from '../../game/constants';
import type { Difficulty, EraId, GameState, Kingdom } from '../../state/types';
import { launchOffMapInvasion } from './InvasionSystem';
import { issuePrepDirective } from './DirectiveSystem';
import { eraIndex } from './MandateSystem';
import { pushToast } from './notifications';
import { t } from '../../i18n';

// ─────────────────────────────────────────────────────────────────────────────
// Tuning
// ─────────────────────────────────────────────────────────────────────────────

/** Base pressure gained per economy tick before era/difficulty scaling. */
const BASE_REGEN = 6;
/** Budget needed to launch a normal invasion. */
const NORMAL_COST = 58;
/** Turns before a normal wave actually musters when it is telegraphed. */
const TELEGRAPH_LEAD = 3;
/** Turns of lead time before a Great Invasion. */
const GREAT_LEAD = 5;
/** Don't stage the first Great Invasion before this turn. */
const GREAT_MIN_TURN = 24;

const ERA_REGEN_MULT: Record<EraId, number> = {
  founding: 0.55,
  rivalry: 1.0,
  empires: 1.4,
  mandate: 1.85,
};

function difficultyMult(difficulty: Difficulty | undefined): number {
  if (difficulty === 'easy') return 0.72;
  if (difficulty === 'hard') return 1.35;
  if (difficulty === 'ironman') return 1.7;
  return 1.0;
}

const WARLORD_NAMES = [
  'Ô Mã', 'Toa Đô', 'Thoát Hoan', 'Trương Phụ', 'Liễu Thăng',
  'Mộc Thạnh', 'Vương Thông', 'Tôn Sĩ Nghị', 'Sầm Nghi Đống',
];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function activeEmpires(state: GameState): Kingdom[] {
  return state.kingdoms.filter((k) => k.id !== PLAYER_KINGDOM_ID && !k.isDefeated);
}

/** Picks the aggressor for the next wave — colder relations weigh heavier. */
function pickAggressor(state: GameState): Kingdom | undefined {
  const empires = activeEmpires(state);
  if (empires.length === 0) return undefined;
  const weighted = empires.map((k) => ({ k, w: Math.max(4, 100 - (k.relations ?? 50)) }));
  const total = weighted.reduce((sum, e) => sum + e.w, 0);
  let roll = Math.random() * total;
  for (const entry of weighted) {
    roll -= entry.w;
    if (roll <= 0) return entry.k;
  }
  return empires[0];
}

function playerStrength(state: GameState): number {
  const lands = state.lands.filter((l) => l.ownerId === PLAYER_KINGDOM_ID).length;
  const troops = state.armies
    .filter((a) => a.kingdomId === PLAYER_KINGDOM_ID)
    .reduce((sum, a) => sum + a.units.spearmen + a.units.archers + a.units.heavyInfantry, 0);
  return lands + troops / 400;
}

function regenPerTick(state: GameState, era: EraId): number {
  const diff = difficultyMult(state.campaignConfig?.difficulty);
  // Mild rubber-band: a larger realm invites larger threats.
  const rubber = 1 + Math.min(0.6, playerStrength(state) * 0.02);
  return BASE_REGEN * ERA_REGEN_MULT[era] * diff * rubber;
}

function hasActivePact(kingdom: Kingdom | undefined, turn: number): boolean {
  return Boolean(kingdom?.treaties?.some((tr) => tr.type === 'non-aggression' && tr.expiresTurn > turn));
}

// ─────────────────────────────────────────────────────────────────────────────
// Main tick
// ─────────────────────────────────────────────────────────────────────────────

export function tickThreatDirector(state: GameState): void {
  if (state.gameMode !== 'empire') return;
  state.threatBudget ??= 0;
  state.greatInvasionEras ??= [];
  const era: EraId = state.mandate?.era ?? 'founding';

  // 1) Resolve a telegraphed ultimatum in flight.
  if (state.pendingUltimatum) {
    const u = state.pendingUltimatum;
    const kingdom = state.kingdoms.find((k) => k.id === u.kingdomId);

    // Defused by diplomacy (a pact signed before the due turn).
    if (!u.defused && hasActivePact(kingdom, state.turn)) {
      u.defused = true;
      state.pendingUltimatum = undefined;
      pushToast(state, t('empire.ultimatum.defused', { kingdom: kingdom?.name ?? '' }), 'milestone');
      return;
    }

    if (state.turn >= u.dueTurn) {
      launchOffMapInvasion(state, u.kingdomId, {
        forceCoalition: u.isGreatInvasion ? Math.min(3, activeEmpires(state).length + 1) : undefined,
        sizeMult: u.isGreatInvasion ? 1.25 : 1,
        warlordName: u.isGreatInvasion ? u.warlordName : undefined,
        forceConquest: u.isGreatInvasion,
      });
      state.pendingUltimatum = undefined;
    }
    return;
  }

  // 2) Regenerate pressure.
  state.threatBudget += regenPerTick(state, era);

  // 3) Once per era (from Rivalry on), stage a telegraphed Great Invasion.
  if (
    era !== 'founding' &&
    !state.greatInvasionEras.includes(era) &&
    state.turn >= GREAT_MIN_TURN &&
    state.threatBudget >= NORMAL_COST * 0.5 &&
    activeEmpires(state).length > 0
  ) {
    stageGreatInvasion(state, era);
    return;
  }

  // 4) Spend budget on the next normal wave (half telegraphed, half immediate).
  const cost = NORMAL_COST;
  if (state.threatBudget >= cost) {
    state.threatBudget -= cost;
    const aggressor = pickAggressor(state);
    if (!aggressor) return;
    if (Math.random() < 0.5) {
      stageMinorUltimatum(state, aggressor);
    } else {
      launchOffMapInvasion(state, aggressor.id);
    }
  }
}

function stageGreatInvasion(state: GameState, era: EraId): void {
  const aggressor = pickAggressor(state);
  if (!aggressor) return;
  state.greatInvasionEras!.push(era);
  state.threatBudget = Math.max(0, (state.threatBudget ?? 0) - NORMAL_COST * 0.5);
  const warlord = WARLORD_NAMES[Math.floor(Math.random() * WARLORD_NAMES.length)];
  const dueTurn = state.turn + GREAT_LEAD;
  state.pendingUltimatum = {
    id: `great-${era}-${state.turn}`,
    kingdomId: aggressor.id,
    dueTurn,
    hostSize: 0,
    isGreatInvasion: true,
    warlordName: warlord,
  };
  // A guaranteed heavy reward for weathering it.
  issuePrepDirective(state, dueTurn, 30 + eraIndex(era) * 10);
  pushToast(state, t('empire.ultimatum.great', { warlord, kingdom: aggressor.name, turns: GREAT_LEAD }), 'threat');
}

function stageMinorUltimatum(state: GameState, aggressor: Kingdom): void {
  const dueTurn = state.turn + TELEGRAPH_LEAD;
  state.pendingUltimatum = {
    id: `ult-${aggressor.id}-${state.turn}`,
    kingdomId: aggressor.id,
    dueTurn,
    hostSize: 0,
    isGreatInvasion: false,
  };
  pushToast(state, t('empire.ultimatum.minor', { kingdom: aggressor.name, turns: TELEGRAPH_LEAD }), 'threat');
}
