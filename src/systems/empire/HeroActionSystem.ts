import { PLAYER_KINGDOM_ID } from '../../game/constants';
import type { GameState, Hero, HeroMission, HeroMissionKind, HeroStats, HeroType, Kingdom } from '../../state/types';
import { applyResourceDelta, refreshAllLandOutputs } from '../ResourceSystem';
import { eraIndex } from './MandateSystem';
import { pushToast } from './notifications';
import { heroName, t } from '../../i18n';

/**
 * Era potency (founding ≈1.0 → mandate ≈2.05): scales hero mission/ability payoffs so a
 * general's raid or a governor's harvest keeps pace with the compounding late-game economy
 * instead of dwindling into irrelevance.
 */
function eraPotency(state: GameState): number {
  return 1 + eraIndex(state.mandate?.era ?? 'founding') * 0.35;
}

// ── Missions ──────────────────────────────────────────────────────────────────
// One signature mission per hero type. Dispatch spends Energy (fatigue), resolves
// after a few economy ticks with a stat-driven fail/win/crit outcome, then the hero
// returns to the idle roster to recover. This is the "frequency engine" — heroes
// come back off-mission and want redeploying, and the Energy cost forces rotation.

interface MissionDef {
  kind: HeroMissionKind;
  /** Which hero type may run this mission. */
  heroType: HeroType;
  /** Stat that drives the success roll. */
  stat: keyof HeroStats;
  /** Energy spent to dispatch (added to fatigue). */
  energyCost: number;
  /** Economy ticks until the mission resolves. */
  ticks: number;
  /** Missions that strike a rival empire need a chosen target. */
  needsTarget: boolean;
}

export const HERO_MISSION_DEFS: Record<HeroType, MissionDef> = {
  general: { kind: 'raid', heroType: 'general', stat: 'martial', energyCost: 40, ticks: 4, needsTarget: true },
  agent: { kind: 'sabotage', heroType: 'agent', stat: 'renown', energyCost: 35, ticks: 3, needsTarget: true },
  minister: { kind: 'taxCircuit', heroType: 'minister', stat: 'administration', energyCost: 30, ticks: 3, needsTarget: false },
  governor: { kind: 'quellUnrest', heroType: 'governor', stat: 'administration', energyCost: 30, ticks: 2, needsTarget: false },
};

export function heroMissionDef(hero: Hero): MissionDef {
  return HERO_MISSION_DEFS[hero.type];
}

export function getHeroEnergy(hero: Hero): number {
  return Math.max(0, Math.min(100, 100 - hero.fatigue));
}

export function activeHeroMission(state: GameState, heroId: string): HeroMission | undefined {
  return state.heroMissions?.find((m) => m.heroId === heroId);
}

/** Rival empires a strike mission can target (empire mode: off-map living empires). */
export function heroMissionTargets(state: GameState): Kingdom[] {
  return state.kingdoms.filter((k) => k.id !== PLAYER_KINGDOM_ID && !k.isDefeated);
}

/** Why this hero cannot be dispatched right now, or undefined if they can. */
export function heroMissionBlockedReason(state: GameState, hero: Hero): string | undefined {
  if (state.gameMode !== 'empire') return t('hero.block.mode');
  if (hero.id === 'king') return t('hero.block.king');
  if (activeHeroMission(state, hero.id)) return t('hero.block.onMission');
  if (hero.assignedTo) return t('hero.block.assigned');
  const def = heroMissionDef(hero);
  if (getHeroEnergy(hero) < def.energyCost) return t('hero.block.energy');
  if (def.needsTarget && heroMissionTargets(state).length === 0) return t('hero.block.noTargets');
  return undefined;
}

export function dispatchHeroMission(state: GameState, heroId: string, targetKingdomId?: string): boolean {
  const hero = state.heroes.find((h) => h.id === heroId);
  if (!hero) return false;
  const blocked = heroMissionBlockedReason(state, hero);
  if (blocked) {
    state.message = blocked;
    return false;
  }
  const def = heroMissionDef(hero);
  const target = def.needsTarget
    ? (targetKingdomId ?? heroMissionTargets(state)[0]?.id)
    : undefined;
  if (def.needsTarget && !target) {
    state.message = t('hero.block.noTargets');
    return false;
  }

  hero.fatigue = Math.min(100, hero.fatigue + def.energyCost);
  hero.assignedTo = `mission:${def.kind}`;
  state.heroMissions ??= [];
  state.heroMissions.push({
    id: `mission-${heroId}-${state.turn}`,
    heroId,
    kind: def.kind,
    targetKingdomId: target,
    ticksRemaining: def.ticks,
    totalTicks: def.ticks,
  });
  const targetName = target ? state.kingdoms.find((k) => k.id === target)?.name : undefined;
  state.message = t('hero.mission.dispatched', {
    hero: heroName(hero),
    mission: missionLabel(def.kind),
    target: targetName ?? '',
  });
  return true;
}

export function missionLabel(kind: HeroMissionKind): string {
  return t(`hero.mission.${kind}` as Parameters<typeof t>[0]);
}

export function missionDescription(kind: HeroMissionKind): string {
  return t(`hero.mission.${kind}.d` as Parameters<typeof t>[0]);
}

function statSuccessChance(hero: Hero, stat: keyof HeroStats): number {
  return Math.max(0.45, Math.min(0.9, 0.4 + hero.stats[stat] / 180));
}

type Outcome = 'crit' | 'win' | 'fail';

function rollOutcome(chance: number): Outcome {
  const r = Math.random();
  if (r < chance * 0.35) return 'crit';
  if (r < chance) return 'win';
  return 'fail';
}

function resolveMission(state: GameState, mission: HeroMission): void {
  const hero = state.heroes.find((h) => h.id === mission.heroId);
  // Hero gone or reassigned mid-mission → silently abort (defensive: keeps state sane).
  if (!hero || hero.assignedTo !== `mission:${mission.kind}`) {
    return;
  }
  hero.assignedTo = undefined;

  const def = HERO_MISSION_DEFS[hero.type];
  const outcome = rollOutcome(statSuccessChance(hero, def.stat));
  const target = mission.targetKingdomId
    ? state.kingdoms.find((k) => k.id === mission.targetKingdomId)
    : undefined;
  const heroLabel = heroName(hero);

  if (outcome === 'fail') {
    // A failed job tires the hero further and rattles the roster, but never bricks a run.
    hero.fatigue = Math.min(100, hero.fatigue + 10);
    pushToast(state, t(`hero.mission.${mission.kind}.fail` as Parameters<typeof t>[0], { hero: heroLabel, target: target?.name ?? '' }), 'threat');
    return;
  }

  const mult = (outcome === 'crit' ? 2 : 1) * eraPotency(state);
  switch (mission.kind) {
    case 'raid': {
      const gold = Math.round((30 + hero.stats.martial * 0.4) * mult);
      const supplies = Math.round(10 * mult);
      applyResourceDelta(state, { gold, supplies });
      if (target) {
        target.power = Math.max(15, (target.power ?? 60) - 6 * mult);
      }
      if (outcome === 'crit' && state.threatBudget !== undefined) {
        state.threatBudget = Math.max(0, state.threatBudget - 4);
      }
      pushToast(state, t(`hero.mission.raid.${outcome}` as Parameters<typeof t>[0], { hero: heroLabel, target: target?.name ?? '', gold }), 'reward');
      break;
    }
    case 'sabotage': {
      if (target) {
        target.stability = Math.max(0, (target.stability ?? 60) - 9 * mult);
        if (outcome === 'crit') target.power = Math.max(15, (target.power ?? 60) - 5);
      }
      if (state.threatBudget !== undefined) {
        state.threatBudget = Math.max(0, state.threatBudget - 3 * mult);
      }
      addSpyIntel(state, t('hero.mission.sabotage.intel', { hero: heroLabel, target: target?.name ?? '' }));
      pushToast(state, t(`hero.mission.sabotage.${outcome}` as Parameters<typeof t>[0], { hero: heroLabel, target: target?.name ?? '' }), 'reward');
      break;
    }
    case 'taxCircuit': {
      const gold = Math.round((25 + hero.stats.administration * 0.5) * mult);
      applyResourceDelta(state, { gold });
      pushToast(state, t(`hero.mission.taxCircuit.${outcome}` as Parameters<typeof t>[0], { hero: heroLabel, gold }), 'reward');
      break;
    }
    case 'quellUnrest': {
      if (state.dynastyStatus) {
        state.dynastyStatus.farmerUnrest = Math.max(0, state.dynastyStatus.farmerUnrest - 14 * mult);
      }
      for (const land of state.lands.filter((l) => l.ownerId === PLAYER_KINGDOM_ID)) {
        land.loyalty = Math.min(100, land.loyalty + 6 * mult);
      }
      refreshAllLandOutputs(state);
      pushToast(state, t(`hero.mission.quellUnrest.${outcome}` as Parameters<typeof t>[0], { hero: heroLabel }), 'reward');
      break;
    }
  }

  // Progression: every successful mission builds renown; runs of them earn escalating traits.
  hero.missionsDone = (hero.missionsDone ?? 0) + 1;
  hero.stats.renown = Math.min(100, hero.stats.renown + (outcome === 'crit' ? 3 : 1));
  const grantTrait = (milestone: number, traitKey: 'hero.trait.renowned' | 'hero.trait.veteran'): void => {
    if (hero.missionsDone !== milestone) return;
    hero.traits ??= [];
    const trait = t(traitKey);
    if (!hero.traits.includes(trait)) {
      hero.traits.push(trait);
      // A veteran's experience permanently sharpens their signature stat.
      if (traitKey === 'hero.trait.veteran') {
        hero.stats[def.stat] = Math.min(100, hero.stats[def.stat] + 8);
      }
      pushToast(state, t('hero.trait.earned', { hero: heroLabel, trait }), 'milestone');
    }
  };
  grantTrait(3, 'hero.trait.renowned');
  grantTrait(8, 'hero.trait.veteran');
}

function addSpyIntel(state: GameState, message: string): void {
  state.spyReports.push({ id: `intel-${state.turn}-${state.spyReports.length}`, tick: state.turn, message });
}

// ── Signature abilities ─────────────────────────────────────────────────────────
// One tappable, cooldown-gated power per hero type. Short cooldowns = frequent taps
// that make each hero feel different to own, not just a stat total.

interface HeroAbilityDef {
  heroType: HeroType;
  energyCost: number;
  cooldown: number;
}

export const HERO_ABILITY_DEFS: Record<HeroType, HeroAbilityDef> = {
  general: { heroType: 'general', energyCost: 15, cooldown: 5 },
  agent: { heroType: 'agent', energyCost: 20, cooldown: 6 },
  minister: { heroType: 'minister', energyCost: 15, cooldown: 8 },
  governor: { heroType: 'governor', energyCost: 15, cooldown: 7 },
};

export function heroAbilityLabel(hero: Hero): string {
  return t(`hero.ability.${hero.type}` as Parameters<typeof t>[0]);
}

export function heroAbilityDescription(hero: Hero): string {
  return t(`hero.ability.${hero.type}.d` as Parameters<typeof t>[0]);
}

export function heroAbilityCooldown(state: GameState, heroId: string): number {
  return state.heroAbilityCooldowns?.[heroId] ?? 0;
}

export function heroAbilityBlockedReason(state: GameState, hero: Hero): string | undefined {
  if (state.gameMode !== 'empire') return t('hero.block.mode');
  if (activeHeroMission(state, hero.id)) return t('hero.block.onMission');
  if (heroAbilityCooldown(state, hero.id) > 0) return t('hero.block.cooldown', { turns: heroAbilityCooldown(state, hero.id) });
  if (getHeroEnergy(hero) < HERO_ABILITY_DEFS[hero.type].energyCost) return t('hero.block.energy');
  return undefined;
}

function playerArmies(state: GameState) {
  return state.armies.filter((a) => a.kingdomId === PLAYER_KINGDOM_ID);
}

export function useHeroAbility(state: GameState, heroId: string): boolean {
  const hero = state.heroes.find((h) => h.id === heroId);
  if (!hero) return false;
  const blocked = heroAbilityBlockedReason(state, hero);
  if (blocked) {
    state.message = blocked;
    return false;
  }
  const def = HERO_ABILITY_DEFS[hero.type];
  hero.fatigue = Math.min(100, hero.fatigue + def.energyCost);
  state.heroAbilityCooldowns ??= {};
  // Later eras drill the court: signature powers come off cooldown a little sooner, so
  // heroes get tapped more often as the reign matures (more to do per minute).
  state.heroAbilityCooldowns[heroId] = Math.max(2, def.cooldown - eraIndex(state.mandate?.era ?? 'founding'));
  const potency = eraPotency(state);
  const heroLabel = heroName(hero);

  switch (hero.type) {
    case 'general': {
      // Forced March — steel every host's spirit and supply for the fight ahead.
      for (const army of playerArmies(state)) {
        army.morale = Math.min(100, army.morale + 25);
        army.supply = Math.min(100, army.supply + 15);
      }
      break;
    }
    case 'agent': {
      // Poison the Well — gut the morale of the strongest hostile host on the board.
      const hostile = state.armies
        .filter((a) => a.kingdomId !== PLAYER_KINGDOM_ID)
        .sort((a, b) => (b.units.spearmen + b.units.archers + b.units.heavyInfantry) - (a.units.spearmen + a.units.archers + a.units.heavyInfantry))[0];
      if (hostile) {
        hostile.morale = Math.max(10, hostile.morale - 30);
        hostile.supply = Math.max(10, hostile.supply - 20);
      }
      break;
    }
    case 'minister': {
      // Royal Decree — quiet the unrest, rally the nobles, steady every province.
      if (state.dynastyStatus) {
        state.dynastyStatus.farmerUnrest = Math.max(0, state.dynastyStatus.farmerUnrest - 18);
        state.dynastyStatus.nobleRelations = Math.min(100, state.dynastyStatus.nobleRelations + 10);
      }
      state.court.stability = Math.min(100, state.court.stability + 8);
      for (const land of state.lands.filter((l) => l.ownerId === PLAYER_KINGDOM_ID)) {
        land.loyalty = Math.min(100, land.loyalty + 8);
      }
      refreshAllLandOutputs(state);
      break;
    }
    case 'governor': {
      // Bountiful Harvest — the governor's granaries overflow into the treasury.
      applyResourceDelta(state, { food: Math.round(30 * potency), supplies: Math.round(15 * potency), gold: Math.round(10 * potency) });
      refreshAllLandOutputs(state);
      break;
    }
  }

  pushToast(state, t(`hero.ability.done.${hero.type}` as Parameters<typeof t>[0], { hero: heroLabel }), 'reward');
  return true;
}

// ── Per-tick upkeep ─────────────────────────────────────────────────────────────

/** One economy tick: recover Energy, progress/resolve missions, decay ability cooldowns. */
export function tickHeroActions(state: GameState): void {
  if (state.gameMode !== 'empire') return;

  // Energy recovery: idle heroes rest fastest; those posted to court/land/army recover
  // slower; heroes actively on a mission do not recover until they return.
  for (const hero of state.heroes) {
    if (activeHeroMission(state, hero.id)) continue;
    const recover = hero.assignedTo ? 5 : 10;
    hero.fatigue = Math.max(0, hero.fatigue - recover);
  }

  if (state.heroMissions && state.heroMissions.length > 0) {
    const resolved: HeroMission[] = [];
    for (const mission of state.heroMissions) {
      mission.ticksRemaining -= 1;
      if (mission.ticksRemaining <= 0) {
        resolveMission(state, mission);
        resolved.push(mission);
      }
    }
    if (resolved.length > 0) {
      state.heroMissions = state.heroMissions.filter((m) => !resolved.includes(m));
    }
  }

  if (state.heroAbilityCooldowns) {
    for (const key of Object.keys(state.heroAbilityCooldowns)) {
      if (state.heroAbilityCooldowns[key] > 0) state.heroAbilityCooldowns[key] -= 1;
    }
  }
}
