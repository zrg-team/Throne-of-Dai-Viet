import { PLAYER_KINGDOM_ID } from '../../game/constants';
import { isEngagedHost } from '../ascent/armyOrders';
import { pushToast } from '../empire/notifications';
import { storyText } from '../../i18n/story';
import type { Army, GameState, Land } from '../../state/types';
import type { StoryCtx } from './types';

/**
 * Hosts a story raised, that the realm did not.
 *
 * A leaf sibling of `charges.ts`, and held to the same discipline: no callbacks, nothing on the
 * state that cannot be serialised, one tick function called from `AscentTick`.
 *
 * ## Why this is not just `grantHost`
 *
 * `grantHost` pushes a plain player army with no orders, so the autopilot marches it to the front,
 * `autoDisbandRemnants` dissolves it below 144 men, the granary feeds it, and its id
 * (`story-host-<storyId>-<turn>`) collides outright if a story grants twice in one season. None of
 * that is what a household turning out under its own banner looks like.
 *
 * An auxiliary is marked with `Army.patron`, and the flag is honoured in a dozen places so that it:
 *
 * - **fights invasions on its own** — `autoDefend` is re-set here every season, and `tickAutoDefend`
 *   marches it at whichever invader is nearest, which is not always the one you needed it at;
 * - **grows when it is fed and thins when it is not** — it burns its own rations, and nothing else
 *   feeds it, so a gift is the difference between a host that lasts and one that wastes away;
 * - **costs the realm no wage and no grain** — the gift is the price, paid once, at the door;
 * - **counts in both battle paths** — the watched fight enrols it like any player host, and
 *   `defenderPower` was taught to see it in the hidden roll;
 * - **cannot be commanded** — no standing orders, no seat for one of your generals, no spearhead
 *   duty in the conquer lane. It is help, not an army.
 */

/** Rations burned per hundred men per season. Its only source is what it was given. */
const RATION_PER_100 = 1;
/** The share it loses in a season with an empty baggage train. A banner nobody feeds thins out. */
const WASTE = 0.07;
/** Below this it is no longer a host, and the story is told so. */
const GONE = 40;

function headcount(army: Army): number {
  return army.units.spearmen + army.units.archers + army.units.heavyInfantry;
}

/** The host a story raised, if it still stands. Every patron verb goes through this one lookup. */
export function patronHost(state: GameState, templateId: string): Army | undefined {
  return state.armies.find((army) => army.patron === templateId);
}

/** How many stand under that banner right now. Zero when there is no banner. */
export function patronStrength(state: GameState, templateId: string): number {
  const host = patronHost(state, templateId);
  return host ? headcount(host) : 0;
}

/**
 * A host raised in somebody else's name.
 *
 * One per story, by construction: the id is `patron-<templateId>`, so a second call finds the
 * first and reinforces it rather than putting two banners on the map.
 */
export function raisePatronHost(
  ctx: StoryCtx,
  opts: { soldiers: number; name: string; at?: Land; rations?: number },
): Army | undefined {
  const templateId = ctx.story.templateId;
  const existing = patronHost(ctx.state, templateId);
  if (existing) {
    reinforcePatron(ctx, { soldiers: opts.soldiers, rations: opts.rations });
    return existing;
  }
  const home = opts.at ?? ctx.land() ?? ctx.state.lands.find((land) => land.ownerId === PLAYER_KINGDOM_ID);
  if (!home) return undefined;
  const army: Army = {
    id: `patron-${templateId}`,
    kingdomId: PLAYER_KINGDOM_ID,
    name: opts.name,
    landId: home.id,
    units: {
      spearmen: Math.round(opts.soldiers * 0.6),
      archers: Math.round(opts.soldiers * 0.28),
      heavyInfantry: Math.round(opts.soldiers * 0.12),
    },
    morale: 96,
    supply: 60,
    // Its whole larder. Nothing refills this but the player.
    rations: opts.rations ?? Math.round(opts.soldiers * 0.5),
    provisions: Math.round(opts.soldiers * 0.2),
    level: 1,
    experience: 0,
    experienceToNextLevel: 140,
    autoDefend: true,
    patron: templateId,
  };
  ctx.state.armies.push(army);
  ctx.remember('patron:men', headcount(army));
  ctx.note('patron', headcount(army));
  return army;
}

/**
 * What a gift does. Returns the men added, so a fragment can speak the figure.
 *
 * Growth is not only headcount: two gifts make veterans of them and four make a guard, because a
 * host that merely got wider would be a number going up rather than a thing getting better.
 */
export function reinforcePatron(
  ctx: StoryCtx,
  gift: { soldiers?: number; rations?: number; provisions?: number; morale?: number },
): number {
  const host = patronHost(ctx.state, ctx.story.templateId);
  if (!host) return 0;
  const soldiers = gift.soldiers ?? 0;
  host.units.spearmen += Math.round(soldiers * 0.6);
  host.units.archers += Math.round(soldiers * 0.28);
  host.units.heavyInfantry += Math.round(soldiers * 0.12);
  host.rations += gift.rations ?? 0;
  host.provisions += gift.provisions ?? 0;
  host.morale = Math.min(100, host.morale + (gift.morale ?? 4));

  const fed = ctx.bump('patron:fed');
  if (fed >= 2) host.level = Math.max(host.level, 2);
  if (fed >= 4) host.elite = Math.min(2, (host.elite ?? 0) + 1);

  const now = headcount(host);
  ctx.remember('patron:men', now);
  // The figure the player is owed: not what was sent, but how many stand there now.
  ctx.note('patron', now);
  return soldiers;
}

/**
 * One season for every auxiliary on the map.
 *
 * Called from `AscentTick` immediately before `tickStoryCharges`, so a banner that broke or was
 * fed this season can be spoken of in the same season by the story that owns it.
 */
export function tickStoryPatrons(state: GameState): void {
  if (state.gameMode !== 'ascent' || !state.ascent) return;
  const stories = state.stories ?? [];

  // A shrine holds its province up for the rest of the reign. Enforced here rather than in a tick
  // of its own: it is one loop over a list that is almost always empty, and the alternative is a
  // second entry in AscentTick for two lines of work.
  for (const memorial of state.memorials ?? []) {
    if (!memorial.loyaltyFloor || !memorial.landId) continue;
    const land = state.lands.find((candidate) => candidate.id === memorial.landId);
    if (land?.ownerId === PLAYER_KINGDOM_ID) land.loyalty = Math.max(land.loyalty, memorial.loyaltyFloor);
  }

  for (const army of [...state.armies]) {
    if (!army.patron) continue;
    const story = stories.find((candidate) => candidate.templateId === army.patron);

    // Its own larder, and nothing else fills it. This is the whole of "give him goods and he
    // lasts longer" — expressed as a store that runs down rather than as a counter.
    const men = headcount(army);
    army.rations = Math.max(0, army.rations - Math.ceil(men / 100) * RATION_PER_100);
    if (army.rations <= 0) {
      army.units.spearmen = Math.floor(army.units.spearmen * (1 - WASTE));
      army.units.archers = Math.floor(army.units.archers * (1 - WASTE));
      army.units.heavyInfantry = Math.floor(army.units.heavyInfantry * (1 - WASTE));
      army.morale = Math.max(15, army.morale - 4);
    }

    // Re-set every season rather than once at creation: `autoDefend` is rewritten by the
    // autopilot's own pass, and one future edit there would quietly strand the banner at home.
    army.autoDefend = true;

    if (!story) continue;
    story.memory['patron:men'] = headcount(army);
    story.memory['patron:seasons'] = (story.memory['patron:seasons'] ?? 0) + 1;
    if (isEngagedHost(state, army.id)) {
      story.memory['patron:fought'] = (story.memory['patron:fought'] ?? 0) + 1;
    }

    if (headcount(army) < GONE) {
      state.armies = state.armies.filter((candidate) => candidate.id !== army.id);
      story.memory['patron:fell'] = 1;
      story.memory['patron:fellTurn'] = state.turn;
      // Heat, not a toast queued from here: the story is the one that gets to say what this
      // meant, and the temperature is what makes it say it next.
      story.temperature += 4;
      const key = `${story.templateId}.patron.fell`;
      const line = storyText(key, { land: state.lands.find((l) => l.id === army.landId)?.name ?? '' });
      if (line !== key) {
        pushToast(state, line, 'threat', {
          storyId: story.id,
          templateId: story.templateId,
          fragmentId: story.spoken[story.spoken.length - 1] ?? '',
        });
      }
    }
  }
}
