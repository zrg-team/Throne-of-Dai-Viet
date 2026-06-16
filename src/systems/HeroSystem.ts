import { PLAYER_KINGDOM_ID } from '../game/constants';
import { chooseByIndex } from '../utils/math';
import type { GameState, Hero, HeroType } from '../state/types';

export function createHeroDraft(state: GameState, preferredType?: HeroType): void {
  if (state.activeHeroDraft || state.heroDeck.length === 0) {
    return;
  }

  const preferred = preferredType ? state.heroDeck.filter((hero) => hero.type === preferredType) : [];
  const pool = preferred.length > 0 ? preferred : state.heroDeck;
  const offset = state.turn % pool.length;
  const picks: Hero[] = [];

  for (let index = 0; index < Math.min(3, pool.length); index += 1) {
    const hero = chooseByIndex(pool, offset + index);
    if (hero && !picks.some((pick) => pick.id === hero.id)) {
      picks.push(hero);
    }
  }

  state.activeHeroDraft = picks;
  state.message = 'New heroes arrive at court. Choose one.';
}

export function recruitHero(state: GameState, heroId: string): boolean {
  if (!state.activeHeroDraft) {
    return false;
  }

  const hero = state.activeHeroDraft.find((candidate) => candidate.id === heroId);

  if (!hero) {
    return false;
  }

  state.heroes.push(hero);
  state.heroDeck = state.heroDeck.filter((candidate) => candidate.id !== hero.id);
  state.activeHeroDraft = undefined;
  state.message = `${hero.name} joins the court.`;

  if (hero.type === 'general') {
    const army = state.armies.find((candidate) => candidate.kingdomId === PLAYER_KINGDOM_ID);
    if (army && !army.generalHeroId) {
      army.generalHeroId = hero.id;
      hero.assignedTo = army.id;
    }
  }

  return true;
}
