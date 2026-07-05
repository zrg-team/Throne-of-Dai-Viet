import type { GameState, Hero, HeroEventKind } from '../../state/types';
import { applyResourceDelta } from '../ResourceSystem';
import { activeHeroMission } from './HeroActionSystem';
import { pushToast } from './notifications';
import { heroName, t } from '../../i18n';

// Heroes are a living cast, not stat sticks: when overworked, grown renowned, or wavering
// in loyalty, they raise a personal dilemma. Choices feed the Energy/loyalty loop —
// overworking breeds resentment which breeds desertion, so how you use heroes matters.

const AMBITION_RENOWN = 62;
const EXHAUSTION_FATIGUE = 85;
const LOYALTY_FLOOR = 16;

function eligibleHeroes(state: GameState): Hero[] {
  return state.heroes.filter((h) => h.id !== 'king' && !activeHeroMission(state, h.id));
}

/** Occasionally raises a hero dilemma; pauses the game until answered (empire mode). */
export function maybeTriggerHeroEvent(state: GameState): void {
  if (state.gameMode !== 'empire') return;
  // Never stack on another modal-worthy interrupt.
  if (state.pendingHeroEvent || state.pendingForeignCard || state.activePoliticsCard || state.pendingCourtRequest) return;
  if (state.latestBattleResult) return;

  state.heroEventCooldown = (state.heroEventCooldown ?? 5) - 1;
  if ((state.heroEventCooldown ?? 0) > 0) return;

  const candidates = eligibleHeroes(state);
  let hero: Hero | undefined;
  let kind: HeroEventKind | undefined;

  // Crises first: exhaustion, then wavering loyalty, then ambition.
  hero = candidates.find((h) => h.fatigue >= EXHAUSTION_FATIGUE);
  if (hero) kind = 'exhaustion';
  if (!hero) {
    hero = candidates.find((h) => h.stats.loyalty <= LOYALTY_FLOOR);
    if (hero) kind = 'loyalty';
  }
  if (!hero) {
    hero = candidates.find((h) => h.stats.renown >= AMBITION_RENOWN);
    if (hero) kind = 'ambition';
  }

  if (!hero || !kind) {
    state.heroEventCooldown = 4;
    return;
  }
  // A random gate keeps events occasional rather than firing the instant one is eligible.
  if (Math.random() < 0.4) {
    state.heroEventCooldown = 3;
    return;
  }

  state.pendingHeroEvent = { id: `hev-${state.turn}-${hero.id}`, heroId: hero.id, kind };
  state.isPaused = true;
  state.heroEventCooldown = 6 + Math.floor(Math.random() * 4);
  state.message = t('heroEvent.arrive', { hero: heroName(hero) });
}

export interface HeroEventChoiceView {
  id: 'a' | 'b';
  label: string;
  description: string;
}

export interface HeroEventView {
  heroId: string;
  hero?: Hero;
  title: string;
  description: string;
  choices: HeroEventChoiceView[];
}

/** UI-facing description of the pending hero event, or undefined if none. */
export function heroEventView(state: GameState): HeroEventView | undefined {
  const ev = state.pendingHeroEvent;
  if (!ev) return undefined;
  const hero = state.heroes.find((h) => h.id === ev.heroId);
  const heroLabel = hero ? heroName(hero) : '';
  const key = (suffix: string) => `heroEvent.${ev.kind}.${suffix}` as Parameters<typeof t>[0];
  return {
    heroId: ev.heroId,
    hero,
    title: t(key('title')),
    description: t(key('desc'), { hero: heroLabel }),
    choices: [
      { id: 'a', label: t(key('a')), description: t(key('a.d'), { hero: heroLabel }) },
      { id: 'b', label: t(key('b')), description: t(key('b.d'), { hero: heroLabel }) },
    ],
  };
}

function spendUpTo(state: GameState, amount: number): void {
  const gold = Math.min(amount, state.resources.gold);
  if (gold > 0) applyResourceDelta(state, { gold: -gold });
}

/** Remove a departing hero from the roster (loyalty crisis), returning them to the draft deck. */
function departHero(state: GameState, hero: Hero): void {
  state.heroes = state.heroes.filter((h) => h.id !== hero.id);
  for (const positionId of Object.keys(state.court.seats)) {
    if (state.court.seats[positionId as keyof typeof state.court.seats] === hero.id) {
      state.court.seats[positionId as keyof typeof state.court.seats] = undefined;
    }
  }
  for (const army of state.armies) {
    if (army.generalHeroId === hero.id) army.generalHeroId = undefined;
  }
  state.heroMissions = (state.heroMissions ?? []).filter((m) => m.heroId !== hero.id);
  hero.assignedTo = undefined;
  hero.fatigue = 0;
  state.heroDeck.push(hero);
}

export function resolveHeroEvent(state: GameState, choiceId: string): void {
  const ev = state.pendingHeroEvent;
  if (!ev) return;
  const hero = state.heroes.find((h) => h.id === ev.heroId);
  const choice: 'a' | 'b' = choiceId === 'b' ? 'b' : 'a';
  state.pendingHeroEvent = undefined;
  state.isPaused = false;
  if (!hero) return;
  const heroLabel = heroName(hero);

  switch (ev.kind) {
    case 'exhaustion': {
      if (choice === 'a') {
        hero.fatigue = 10;
        hero.stats.loyalty += 5;
      } else {
        hero.stats.loyalty -= 6;
        hero.stats.renown = Math.min(100, hero.stats.renown + 2);
      }
      break;
    }
    case 'ambition': {
      if (choice === 'a') {
        spendUpTo(state, 40);
        hero.stats.loyalty += 10;
        hero.stats.renown = Math.min(100, hero.stats.renown + 2);
      } else {
        hero.stats.loyalty -= 12;
      }
      break;
    }
    case 'loyalty': {
      if (choice === 'a') {
        spendUpTo(state, 50);
        hero.stats.loyalty += 25;
      } else {
        departHero(state, hero);
      }
      break;
    }
  }

  hero.stats.loyalty = Math.max(0, Math.min(100, hero.stats.loyalty));
  const doneKey = `heroEvent.${ev.kind}.${choice}.done` as Parameters<typeof t>[0];
  state.message = t(doneKey, { hero: heroLabel });
  pushToast(state, state.message, choice === 'a' ? 'reward' : ev.kind === 'loyalty' ? 'threat' : 'info');
}
