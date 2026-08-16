import type {
  ActiveStory,
  GameState,
  Hero,
  Kingdom,
  Land,
  NotificationKind,
  ResourceBag,
  StoryBand,
  StoryCast,
  StoryVolume,
} from '../../state/types';

/**
 * Authoring types for the Chronicle. None of this is serialised — a save holds only the
 * `ActiveStory` instance (cast, memory, temperature, spoken ids) and rejoins it to the
 * template by id at load. That is why fragment ids are an append-only contract: rename one
 * and every save halfway through that story loads into a dangling reference.
 */

/** What changed in the world since last tick. Computed by diffing, so no other system has to push. */
export interface StoryWorldDelta {
  lostLand: boolean;
  gainedLand: boolean;
  lostHero: boolean;
  gainedHero: boolean;
  wonBattle: boolean;
  waveBroken: boolean;
  /** Granary is draining and within a few seasons of empty. */
  starving: boolean;
  /** Treasury sitting above the "somebody has started counting" line. */
  hoarding: boolean;
  seatEmptied: boolean;
}

/** Everything a fragment can read and do. Deliberately narrow — fragments are not systems. */
export interface StoryCtx {
  state: GameState;
  story: ActiveStory;
  world: StoryWorldDelta;
  /** Seasons since this story last said anything. */
  quietFor: number;
  /** Seasons since the story seeded. */
  age: number;

  hero(): Hero | undefined;
  otherHero(): Hero | undefined;
  land(): Land | undefined;
  rival(): Kingdom | undefined;

  /** Read a memory number. Absent reads as 0. */
  recall(key: string): number;
  /** Write a memory number. */
  remember(key: string, value: number): void;
  /** Add to a memory number and return the new value. */
  bump(key: string, by?: number): number;
  /** True when a fragment id has already fired for this story. */
  said(fragmentId: string): boolean;
  /** Push the story toward acting. Never shown; only its frequency of speech leaks it. */
  heat(by: number): void;

  /**
   * Other live stories that have bound one of the same subjects.
   *
   * Two stories about the same hero read each other: he can be a martyr in one and a traitor in
   * the other, and the game does not resolve the contradiction for you.
   */
  sharing(): number;

  /**
   * A moment from an *earlier run*, if one ever happened, with the name attached.
   *
   * This is what lets a commander who quietly left in run three be named as the man leading the
   * host that kills you in run five.
   */
  echoOf(templateId: string, fragmentId: string): string | undefined;

  /** Records a moment for later runs to mention. Only terminals should call this. */
  leaveEcho(name: string): void;
}

export interface StoryOption {
  id: string;
  /** Resources spent when taken. Shown exactly; an unaffordable option is closed, not hidden. */
  cost?: Partial<ResourceBag>;
  /** Extra gate beyond affordability — e.g. "needs a hero of martial 55 in that province". */
  enabled?: (ctx: StoryCtx) => boolean;
  /** Text key suffix explaining why it is closed. Rendered under the option. */
  blockedKey?: string;
  apply: (ctx: StoryCtx) => void;
}

export interface StoryFragment {
  /** Append-only. Never rename, never reuse — a live save holds this string. */
  id: string;
  volume: StoryVolume;
  band?: StoryBand;
  /** Hard gate. A fragment whose `when` is false is not in the running at all. */
  when?: (ctx: StoryCtx) => boolean;
  /** Base weight in the salience draw. */
  weight?: number;
  /** Added to the weight when the moment particularly suits this fragment. */
  salience?: (ctx: StoryCtx) => number;
  /** Seasons of silence required before this may speak. */
  quiet?: number;
  /** May fire more than once. Default is once per story. */
  repeatable?: boolean;
  /**
   * Hard ceiling on a repeatable fragment, and it is deliberately low.
   *
   * "Repeatable" must not mean "unlimited": measured, one ambient line fired six times in a
   * single run, which is precisely the visible repetition a salience pool is most exposed to and
   * worse than a chain, since a chain at least does not repeat itself.
   */
  maxTimes?: number;
  /** Ends the story. The Chronicle records it. */
  terminal?: boolean;
  /** Accent for the Chronicle entry. */
  tone?: NotificationKind;
  /** Cards only. A blow has none, which is what makes it a blow. */
  options?: StoryOption[];
  /** Whispers and blows act here; cards act through the option taken. */
  effect?: (ctx: StoryCtx) => void;
  /** Temperature change when this fires. */
  heat?: number;
  /**
   * Hangs an offer on a subject the player already visits, instead of speaking.
   * Openings are how a story creates something to do without ever issuing an order.
   */
  opening?: {
    /** Where the row appears. */
    on: 'land' | 'hero' | 'army' | 'rival' | 'treasury';
    actionKey: string;
  };
}

export interface StoryTemplate {
  id: string;
  /** Bind subjects from the world, or return undefined to decline seeding now. */
  seed: (state: GameState) => StoryCast | undefined;
  /**
   * What the bound character currently thinks of the player, as a text-key suffix
   * (`<templateId>.regard.<suffix>`), derived from the story's own memory.
   *
   * Words, never a number: "grateful", "waiting", "cold". This is the relationship the page
   * shows, and it moves only when the player actually does something — which is what makes a
   * salience pool legible as *reacting to you* rather than as weather.
   */
  regard?: (ctx: StoryCtx) => string | undefined;
  /** Relative chance of being the one considered on a seeding tick. */
  seedWeight: number;
  /** Earliest turn this may seed. */
  minTurn?: number;
  /** Only one instance of a template at a time unless this is set. */
  allowMultiple?: boolean;
  fragments: StoryFragment[];
}

/** Text parameters a fragment exposes for interpolation. */
export type StoryParams = Record<string, string | number>;
