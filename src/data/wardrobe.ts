import { PLAYER_KINGDOM_ID } from '../game/constants';
import { createRng } from '../map/random';
import {
  ENEMY_WARDROBES, VIET_WARDROBES,
  type ArmyComposition, type ArmyWardrobe, type GameState,
} from '../state/types';

/**
 * The five ways a host can be deployed. Not a balance lever: it decides the *shape of the
 * formation* — how many blocks, how wide, how deep — and nothing else.
 */
const DOCTRINES: ArmyComposition[] = ['balanced', 'spears', 'archers', 'shock', 'horse'];

/**
 * Rolls what this run's armies look like.
 *
 * Two runs on the same map used to open on the same picture. Now the player's dynasty, the
 * player's deployment, and every rival's power and deployment are drawn at muster — so one run is
 * fought against a Ming column in a spear wall and the next against Chăm raiders with a cavalry
 * wing, on the same board.
 *
 * **Seeded off `mapConfig.seed`, never `Math.random`.** Two reasons, and both have bitten:
 *
 *  - The same seed has to produce the same run. A wardrobe rolled from the global generator makes
 *    a "reproducible" seed reproduce a different-looking war.
 *  - Drawing must not reach into the simulation. Every mode's `verify-modes-regression`
 *    fingerprint is a hash of sixty ticks of state; pulling from the shared generator here would
 *    shift every one of them for a reason that has nothing to do with what changed.
 *
 * The four rivals are dealt distinct powers from the five, rather than each rolling
 * independently — a war against three realms that all turned out to be Thanh is a worse picture
 * than a war against three different ones, and dealing costs nothing.
 */
export function rollMuster(state: GameState): void {
  // A second stream off the same seed: the map generator has already used the seed itself, and
  // reusing the number rather than the generator keeps the two independent.
  const rng = createRng((state.mapConfig?.seed ?? 1337) ^ 0x5f3a91);

  state.muster = {
    dynasty: pick(rng, VIET_WARDROBES),
    composition: pick(rng, DOCTRINES),
  };

  const powers = shuffle(rng, [...ENEMY_WARDROBES]);
  let next = 0;
  for (const kingdom of state.kingdoms) {
    if (kingdom.id === PLAYER_KINGDOM_ID) continue;
    kingdom.wardrobe = powers[next % powers.length];
    kingdom.composition = pick(rng, DOCTRINES);
    next += 1;
  }
}

function pick<T>(rng: () => number, from: readonly T[]): T {
  return from[Math.floor(rng() * from.length) % from.length];
}

/** Fisher–Yates, so the deal is uniform rather than merely shuffled-looking. */
function shuffle<T>(rng: () => number, list: T[]): T[] {
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

/** What a realm is dressed as, for callers that only have the id. */
export function wardrobeOf(state: GameState, kingdomId: string): ArmyWardrobe | undefined {
  if (kingdomId === PLAYER_KINGDOM_ID) return state.muster?.dynasty;
  return state.kingdoms.find((k) => k.id === kingdomId)?.wardrobe;
}
