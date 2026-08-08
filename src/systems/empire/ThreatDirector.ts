import { PLAYER_KINGDOM_ID } from '../../game/constants';
import type { Difficulty, EraId, GameState, Kingdom } from '../../state/types';
import { launchOffMapInvasion } from './InvasionSystem';
import { issuePrepDirective } from './DirectiveSystem';
import { eraIndex } from './MandateSystem';
import { ambition } from './GreatPowersSystem';
import { getEmpirePower, getFear, getPlayerMilitary } from '../DiplomacySystem';
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

/**
 * How threatening an empire is right now: strong + ambitious + hostile + confident
 * empires weigh heaviest, while unstable or fearful ones can't project force. This is
 * the "why does a strong stable empire come for me" logic the player expects.
 */
function threatWeight(state: GameState, k: Kingdom): number {
  const power = k.power ?? 50;
  const relations = k.relations ?? 50;
  const warApp = k.warAppetite ?? 0;
  const stability = k.stability ?? 50;
  const hostility = Math.max(0, 60 - relations);
  let w = power * 0.6 + warApp * 0.6 + hostility * ambition(k.personality);
  w *= stability > 35 ? 1 : 0.4; // a realm in turmoil can't march
  w *= 1 - Math.min(0.7, getFear(state, k) / 140); // fear of our might deters them
  return Math.max(2, w);
}

/** Picks the aggressor for the next wave, weighted by live threat. */
function pickAggressor(state: GameState): Kingdom | undefined {
  const empires = activeEmpires(state);
  if (empires.length === 0) return undefined;
  const weighted = empires.map((k) => ({ k, w: threatWeight(state, k) }));
  const total = weighted.reduce((sum, e) => sum + e.w, 0);
  let roll = Math.random() * total;
  for (const entry of weighted) {
    roll -= entry.w;
    if (roll <= 0) return entry.k;
  }
  return empires[0];
}

/** Host-size multiplier from an empire's evolving power — strong realms field bigger armies. */
function powerSizeMult(k: Kingdom): number {
  return Math.min(2.4, Math.max(0.7, (k.power ?? 50) / 50));
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
  // Rubber-band: a larger realm invites larger threats.
  const rubber = 1 + Math.min(0.6, playerStrength(state) * 0.02);
  // Escalation-with-success: a wealthy treasury draws proportionally fiercer coalitions, so
  // a snowballing empire keeps facing real pressure instead of coasting late-game.
  const wealthPressure = 1 + Math.min(0.85, (state.resources.gold ?? 0) / 5000);
  return BASE_REGEN * ERA_REGEN_MULT[era] * diff * rubber * wealthPressure;
}

function hasActivePact(kingdom: Kingdom | undefined, turn: number): boolean {
  return Boolean(kingdom?.treaties?.some((tr) => tr.type === 'non-aggression' && tr.expiresTurn > turn));
}

/**
 * Raises a pausing intelligence alert (our agents warn of a coming host) and halts the
 * game so the player reads it and prepares — musters an army, signs a pact, raises walls —
 * instead of a big invasion sneaking up in a toast they might miss.
 */
function issueThreatAlert(state: GameState, kind: 'incoming' | 'coalition', kingdom: Kingdom, warlordName: string, turns: number): void {
  if (state.pendingThreatAlert) return;
  const mil = getPlayerMilitary(state);
  const power = getEmpirePower(state, kingdom);
  const strength: 'weaker' | 'even' | 'stronger' = power > mil * 1.25 ? 'stronger' : power < mil * 0.7 ? 'weaker' : 'even';
  state.pendingThreatAlert = {
    id: `alert-${state.turn}-${kingdom.id}`,
    kind,
    kingdomId: kingdom.id,
    kingdomName: kingdom.name,
    warlordName,
    turns,
    strength,
  };
  state.isPaused = true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main tick
// ─────────────────────────────────────────────────────────────────────────────

/** 0..~2: how dominant the player has become — drives coalitions and vassalage demands. */
function playerDominance(state: GameState): number {
  const lands = state.lands.filter((l) => l.ownerId === PLAYER_KINGDOM_ID).length;
  const emp = activeEmpires(state);
  const avgFear = emp.length ? emp.reduce((s, k) => s + getFear(state, k), 0) / emp.length : 0;
  return (lands / 14) * 0.7 + (avgFear / 100) * 0.7;
}

/** A dominant realm invites a Grand Coalition — the empires band together. Success breeds threat. */
function maybeStageCoalition(state: GameState): boolean {
  state.coalitionCooldown = Math.max(0, (state.coalitionCooldown ?? 0) - 1);
  if (state.pendingUltimatum || state.coalitionCooldown > 0) return false;
  if (playerDominance(state) < 1.0 || activeEmpires(state).length < 2) return false;
  if (Math.random() > 0.5) return false;

  const aggressor = pickAggressor(state);
  if (!aggressor) return false;
  state.coalitionCooldown = 18;
  const warlord = WARLORD_NAMES[Math.floor(Math.random() * WARLORD_NAMES.length)];
  const dueTurn = state.turn + GREAT_LEAD;
  state.pendingUltimatum = {
    id: `coalition-${state.turn}`,
    kingdomId: aggressor.id,
    dueTurn,
    hostSize: 0,
    isGreatInvasion: true,
    warlordName: warlord,
  };
  issuePrepDirective(state, dueTurn, 40);
  pushToast(state, t('empire.coalition.form', { warlord, turns: GREAT_LEAD }), 'threat');
  issueThreatAlert(state, 'coalition', aggressor, warlord, GREAT_LEAD);
  return true;
}

/** When a hegemon dwarfs the player, it demands submission — vassalage or war. */
function maybeIssueVassalage(state: GameState): void {
  if (state.pendingForeignCard || state.pendingUltimatum || (state.invasions?.length ?? 0) > 0) return;
  if (state.activePoliticsCard || state.pendingCourtRequest) return;
  if (Math.random() > 0.05) return;
  const strongest = [...activeEmpires(state)].sort((a, b) => getEmpirePower(state, b) - getEmpirePower(state, a))[0];
  if (!strongest) return;
  if (getEmpirePower(state, strongest) < getPlayerMilitary(state) * 1.8) return;
  if ((strongest.relations ?? 50) >= 46) return;

  state.pendingForeignCard = {
    id: `vassalage-${state.turn}`,
    kingdomId: strongest.id,
    kingdomName: strongest.name,
    title: t('empire.vassal.title'),
    description: t('empire.vassal.desc', { kingdom: strongest.name }),
    choices: [
      { id: 'submit', label: t('empire.vassal.submit'), description: t('empire.vassal.submit.d'), delta: { gold: -90 }, prestigeDelta: -12, appease: true },
      { id: 'defy', label: t('empire.vassal.defy'), description: t('empire.vassal.defy.d'), prestigeDelta: 14, provoke: 55, requiresArmy: true },
    ],
  };
  state.isPaused = true;
  state.message = t('empire.vassal.arrive', { kingdom: strongest.name });
}

export function tickThreatDirector(state: GameState): void {
  if (state.gameMode !== 'empire') return;
  state.threatBudget ??= 0;
  state.greatInvasionEras ??= [];
  const era: EraId = state.mandate?.era ?? 'founding';

  // Success breeds threat: a dominant player faces coalitions and vassalage ultimatums.
  if (maybeStageCoalition(state)) return;
  maybeIssueVassalage(state);

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
      const sizeMult = (kingdom ? powerSizeMult(kingdom) : 1) * (u.isGreatInvasion ? 1.3 : 1);
      launchOffMapInvasion(state, u.kingdomId, {
        forceCoalition: u.isGreatInvasion ? Math.min(3, activeEmpires(state).length + 1) : undefined,
        sizeMult,
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
      launchOffMapInvasion(state, aggressor.id, { sizeMult: powerSizeMult(aggressor) });
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
  issueThreatAlert(state, 'incoming', aggressor, warlord, GREAT_LEAD);
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
