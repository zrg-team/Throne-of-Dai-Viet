import { PLAYER_KINGDOM_ID } from '../../game/constants';
import { pushToast } from '../empire/notifications';
import { storyText } from '../../i18n/story';
import type { GameState, StoryCharge, StoryGoal } from '../../state/types';
import type { StoryCtx } from './types';

/**
 * A charge: an undertaking the player accepts, that the world then judges.
 *
 * The Chronicle could already *do* almost anything — `effects.ts` is fifty verbs, and a story can
 * grant a hero, build a wall, launch an invasion, set a stipend or start a civil war. What it
 * could not do was **ask**. A fragment fired, offered options, applied an effect, and that was the
 * end of the transaction; nothing could say "build a shrine at Trường Yên and come back to me" and
 * then check, twelve seasons later, whether you did.
 *
 * Three rules hold this to the standard `riverStakes.ts` set when it rejected quest timers as
 * "exactly the thing that reads as cheap":
 *
 *  1. **A charge is always accepted, never imposed.** It arrives as one option on a card the
 *     player is already reading, beside the option to walk away. Most stories carry none at all.
 *  2. **The goal is something the player might have wanted anyway** — hold a province, seat a
 *     minister, drive a neighbour cold. Not a fetch errand invented for the story.
 *  3. **Nothing is serialised that cannot be.** A charge stores goals and a key, never callbacks:
 *     keeping or breaking one writes a flag into the story's own memory and heats it, and the
 *     story's ordinary fragments — gated on `when` like every other fragment — say what it meant.
 *     That is the same salience machinery everything else here runs on, so a charge cannot invent
 *     a second narrative engine beside the first.
 */

/** Memory key a kept charge writes on its story. Fragments gate on this to pay out. */
export function keptKey(key: string): string {
  return `kept:${key}`;
}

/** Memory key a broken charge writes. Fragments gate on this to take the price. */
export function brokenKey(key: string): string {
  return `broken:${key}`;
}

/** Every charge still outstanding. */
export function activeCharges(state: GameState): StoryCharge[] {
  return state.storyCharges ?? [];
}

/** Whether this story already has an outstanding charge — one at a time, per story. */
export function hasCharge(state: GameState, storyId: string): boolean {
  return activeCharges(state).some((charge) => charge.storyId === storyId);
}

/**
 * Swears a charge. Called from a fragment option's `apply`, so accepting is the player's tap.
 *
 * `bySeason` is a count of seasons from now, not an absolute turn — a fragment has no idea what
 * turn it will fire on, and every deadline written as an absolute in the first draft was wrong.
 */
export function swearCharge(
  ctx: StoryCtx,
  key: string,
  goals: StoryGoal[],
  opts: { withinSeasons?: number } = {},
): void {
  const state = ctx.state;
  if (goals.length === 0 || hasCharge(state, ctx.story.id)) return;

  const charges = (state.storyCharges ??= []);
  charges.push({
    id: `charge-${ctx.story.id}-${key}-${state.turn}`,
    storyId: ctx.story.id,
    templateId: ctx.story.templateId,
    key,
    goals,
    acceptedTurn: state.turn,
    dueTurn: opts.withinSeasons ? state.turn + opts.withinSeasons : undefined,
    progress: {},
  });
  ctx.remember(`sworn:${key}`, 1);
  pushToast(state, storyText(`${ctx.story.templateId}.charge.${key}.sworn`), 'milestone');
}

// ── Goal evaluation ─────────────────────────────────────────────────────────

function ownedLands(state: GameState) {
  return state.lands.filter((land) => land.ownerId === PLAYER_KINGDOM_ID);
}

/**
 * Whether one goal is met right now.
 *
 * Deliberately a pure read of live state with one exception — `hold`, which is about duration and
 * therefore needs the counter carried on the charge. Everything else is a predicate over fields
 * the engine already keeps, which is what stops this from becoming a second progress system with
 * its own bookkeeping to drift out of step.
 */
function goalMet(state: GameState, goal: StoryGoal, charge: StoryCharge, index: number): boolean {
  switch (goal.kind) {
    case 'build': {
      const land = state.lands.find((candidate) => candidate.id === goal.landId);
      if (!land || land.ownerId !== PLAYER_KINGDOM_ID) return false;
      return land.buildings.some((building) => building.type === goal.building);
    }

    case 'relations': {
      const kingdom = state.kingdoms.find((candidate) => candidate.id === goal.kingdomId);
      if (!kingdom || kingdom.isDefeated) return false;
      const relations = kingdom.relations ?? 50;
      if (goal.atLeast !== undefined && relations < goal.atLeast) return false;
      if (goal.atMost !== undefined && relations > goal.atMost) return false;
      return true;
    }

    // Two different empires warm at once. The Trưng sisters' charge, and the only goal that reads
    // the whole board rather than one named subject.
    case 'relationsAny': {
      const warm = state.kingdoms.filter(
        (kingdom) => kingdom.id !== PLAYER_KINGDOM_ID
          && !kingdom.isDefeated
          && (kingdom.relations ?? 50) >= (goal.atLeast ?? 60),
      ).length;
      return warm >= (goal.count ?? 2);
    }

    case 'lands':
      return ownedLands(state).length >= (goal.count ?? 1);

    case 'wave':
      return (state.ascent?.wavesSurvived ?? 0) >= (goal.count ?? 1);

    case 'host': {
      const need = goal.soldiers ?? 1;
      const hosts = state.armies.filter((army) => army.kingdomId === PLAYER_KINGDOM_ID && !army.isLevy);
      if (goal.count && goal.count > 1) {
        // "Three hosts, each with a general" — the Hịch Tướng Sĩ charge.
        const qualifying = hosts.filter((army) => {
          const size = army.units.spearmen + army.units.archers + army.units.heavyInfantry;
          return size >= need && (!goal.generaled || Boolean(army.generalHeroId));
        });
        return qualifying.length >= goal.count;
      }
      return hosts.some((army) => army.units.spearmen + army.units.archers + army.units.heavyInfantry >= need);
    }

    case 'hold': {
      const land = state.lands.find((candidate) => candidate.id === goal.landId);
      const key = `hold${index}`;
      if (!land || land.ownerId !== PLAYER_KINGDOM_ID) {
        // Losing the ground resets the count. A charge to hold something is not satisfied by
        // holding it, losing it, and holding it again — that is two halves of nothing.
        charge.progress[key] = 0;
        return false;
      }
      charge.progress[key] = (charge.progress[key] ?? 0) + 1;
      return charge.progress[key] >= (goal.seasons ?? 1);
    }

    case 'treasury':
      return state.resources.gold >= (goal.gold ?? 0);

    // Nobody at war with us and nobody cold enough to be about to be. Khúc Thừa Dụ's charge.
    case 'peace':
      return state.kingdoms
        .filter((kingdom) => kingdom.id !== PLAYER_KINGDOM_ID && !kingdom.isDefeated)
        .every((kingdom) => (kingdom.relations ?? 50) >= (goal.atLeast ?? 45));

    case 'buildings': {
      const built = ownedLands(state).reduce((sum, land) => sum + land.buildings.length, 0);
      return built >= (goal.count ?? 1);
    }

    // Measured from the season the oath was sworn, and reset by any loss — a realm that holds
    // everything for twelve seasons has done something a realm that merely ends up level has not.
    case 'noLandLost': {
      const key = `intact${index}`;
      const now = ownedLands(state).length;
      const peak = charge.progress[`${key}peak`] ?? (charge.progress[`${key}peak`] = now);
      if (now < peak) {
        charge.progress[key] = 0;
        charge.progress[`${key}peak`] = now;
        return false;
      }
      charge.progress[`${key}peak`] = Math.max(peak, now);
      charge.progress[key] = (charge.progress[key] ?? 0) + 1;
      return charge.progress[key] >= (goal.seasons ?? 1);
    }

    case 'seat': {
      const heroId = goal.position ? state.court.seats[goal.position] : undefined;
      const hero = state.heroes.find((candidate) => candidate.id === heroId);
      if (!hero) return false;
      if (!goal.rarity) return true;
      const ladder = ['Common', 'Rare', 'Epic', 'Legendary'];
      return ladder.indexOf(hero.rarity) >= ladder.indexOf(goal.rarity);
    }

    case 'battle': {
      const history = state.ascent?.battleHistory ?? [];
      const wins = history.filter(
        (record) => record.outcome === 'they-rout' && (!goal.great || record.role === 'defence'),
      ).length;
      // Counted from the season the charge was sworn, so an old victory cannot pay a new oath.
      const before = charge.progress.battleBase ?? (charge.progress.battleBase = wins);
      return wins - before >= (goal.count ?? 1);
    }

    default:
      return false;
  }
}

/**
 * Advances every outstanding charge one season.
 *
 * Kept and broken both write to the story's memory and heat it rather than firing an effect here:
 * the *story* says what its own oath was worth, in its own voice, through the fragment pool. This
 * function only ever decides that the moment has come.
 */
export function tickStoryCharges(state: GameState): void {
  const charges = state.storyCharges;
  if (!charges || charges.length === 0) return;

  const stillOpen: StoryCharge[] = [];

  for (const charge of charges) {
    const story = (state.stories ?? []).find((candidate) => candidate.id === charge.storyId);
    // The story ended without resolving its own oath — drop the charge rather than leaving it to
    // count down against a subject that no longer exists.
    if (!story) continue;

    // Evaluated in full every season, not short-circuited: `hold` counts its seasons as a side
    // effect, and `&&` would stop counting the moment an earlier goal happened to be unmet.
    const met = charge.goals.map((goal, index) => goalMet(state, goal, charge, index));
    const allMet = met.every(Boolean);

    if (allMet) {
      story.memory[keptKey(charge.key)] = 1;
      story.temperature += 3;
      pushToast(state, storyText(`${charge.templateId}.charge.${charge.key}.kept`), 'reward');
      continue;
    }

    if (charge.dueTurn !== undefined && state.turn >= charge.dueTurn) {
      story.memory[brokenKey(charge.key)] = 1;
      story.temperature += 2;
      pushToast(state, storyText(`${charge.templateId}.charge.${charge.key}.broken`), 'threat');
      continue;
    }

    stillOpen.push(charge);
  }

  state.storyCharges = stillOpen;
}

/** Drops a story's outstanding charge without judging it. Used when a story ends early. */
export function dropCharges(state: GameState, storyId: string): void {
  if (!state.storyCharges) return;
  state.storyCharges = state.storyCharges.filter((charge) => charge.storyId !== storyId);
}

/**
 * One line per outstanding charge, for the Chronicle lane's tracker.
 *
 * Phrased as the undertaking rather than as a task — "the shrine at Trường Yên still stands
 * unbuilt", not "0/1 objectives" — because the moment this reads as a quest log it has become the
 * thing the Chronicle was written to avoid.
 */
export function chargeTrackerLines(state: GameState): Array<{ text: string; seasonsLeft?: number }> {
  return activeCharges(state).map((charge) => ({
    text: storyText(`${charge.templateId}.charge.${charge.key}.watching`),
    seasonsLeft: charge.dueTurn === undefined ? undefined : Math.max(0, charge.dueTurn - state.turn),
  }));
}
