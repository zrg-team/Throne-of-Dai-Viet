import { PLAYER_KINGDOM_ID } from '../../game/constants';
import type { GameState, Hero, Kingdom } from '../../state/types';
import { addOpinionModifier } from '../DiplomacySystem';
import { resolveWar } from './GreatPowersSystem';
import { pushToast } from './notifications';
import { heroName, t } from '../../i18n';

const SABOTAGE_COST = 15;
const INCITE_COST = 22;

function empire(state: GameState, kingdomId: string): Kingdom | undefined {
  return state.kingdoms.find((k) => k.id === kingdomId && k.id !== PLAYER_KINGDOM_ID && !k.isDefeated);
}

function firstFreeHero(state: GameState): Hero | undefined {
  return state.heroes.find((h) => !h.assignedTo);
}

export function ambassadorHero(state: GameState, kingdom: Kingdom): Hero | undefined {
  return kingdom.ambassadorHeroId ? state.heroes.find((h) => h.id === kingdom.ambassadorHeroId) : undefined;
}

/** Posts a free hero as our standing envoy — warms relations and cools their war appetite over the years. */
export function postAmbassador(state: GameState, kingdomId: string): boolean {
  const kingdom = empire(state, kingdomId);
  if (!kingdom) return false;
  if (kingdom.ambassadorHeroId) return false;
  const hero = firstFreeHero(state);
  if (!hero) {
    state.message = t('empire.espionage.needHero');
    return false;
  }
  hero.assignedTo = `ambassador:${kingdomId}`;
  kingdom.ambassadorHeroId = hero.id;
  addOpinionModifier(kingdom, { id: `ambassador-${kingdomId}`, label: t('empire.world.mod.ambassador'), value: 8, source: 'treaty' });
  state.message = t('empire.espionage.ambassadorSet', { hero: heroName(hero), kingdom: kingdom.name });
  return true;
}

export function recallAmbassador(state: GameState, kingdomId: string): boolean {
  const kingdom = empire(state, kingdomId);
  if (!kingdom || !kingdom.ambassadorHeroId) return false;
  const hero = state.heroes.find((h) => h.id === kingdom.ambassadorHeroId);
  if (hero && hero.assignedTo === `ambassador:${kingdomId}`) hero.assignedTo = undefined;
  kingdom.ambassadorHeroId = undefined;
  kingdom.opinionModifiers = (kingdom.opinionModifiers ?? []).filter((m) => m.id !== `ambassador-${kingdomId}`);
  state.message = t('empire.espionage.ambassadorRecalled', { kingdom: kingdom.name });
  return true;
}

/** Spend influence to crash a rival empire's internal stability — weakening a rising threat. */
export function fomentUnrest(state: GameState, kingdomId: string): boolean {
  const kingdom = empire(state, kingdomId);
  if (!kingdom) return false;
  if (state.court.influence < SABOTAGE_COST) {
    state.message = t('empire.espionage.sabotageNoInfluence', { cost: SABOTAGE_COST });
    return false;
  }
  state.court.influence -= SABOTAGE_COST;
  kingdom.stability = Math.max(0, (kingdom.stability ?? 50) - 22);
  kingdom.warAppetite = Math.max(0, (kingdom.warAppetite ?? 0) - 6);

  if (Math.random() < 0.3) {
    addOpinionModifier(kingdom, { id: `sabotage-${state.turn}-${Math.floor(Math.random() * 1e5)}`, label: t('empire.espionage.sabotageDiscovered', { kingdom: kingdom.name }), value: -25, decay: 0.2, source: 'war' });
    state.message = t('empire.espionage.sabotageDiscovered', { kingdom: kingdom.name });
    pushToast(state, t('empire.espionage.sabotageDiscovered', { kingdom: kingdom.name }), 'threat');
  } else {
    state.message = t('empire.espionage.sabotageDone', { kingdom: kingdom.name });
    pushToast(state, t('empire.espionage.sabotageDone', { kingdom: kingdom.name }), 'reward');
  }
  return true;
}

/** Spend influence to turn a rival empire against another — they bleed each other, not you. */
export function inciteWar(state: GameState, kingdomId: string): boolean {
  const kingdom = empire(state, kingdomId);
  if (!kingdom) return false;
  const rival = state.kingdoms
    .filter((k) => k.id !== PLAYER_KINGDOM_ID && k.id !== kingdomId && !k.isDefeated)
    .sort((a, b) => (b.power ?? 0) - (a.power ?? 0))[0];
  if (!rival) {
    state.message = t('empire.espionage.inciteNoTarget');
    return false;
  }
  if (state.court.influence < INCITE_COST) {
    state.message = t('empire.espionage.inciteNoInfluence', { cost: INCITE_COST });
    return false;
  }
  state.court.influence -= INCITE_COST;
  // They march on each other now, and turn their attention away from us.
  resolveWar(state, kingdom, rival);
  kingdom.warAppetite = Math.max(0, (kingdom.warAppetite ?? 0) - 20);
  state.message = t('empire.espionage.inciteDone', { kingdom: kingdom.name, other: rival.name });
  pushToast(state, t('empire.espionage.inciteDone', { kingdom: kingdom.name, other: rival.name }), 'info');
  return true;
}
