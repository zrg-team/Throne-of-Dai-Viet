import type { Army, ArmyComposition, AscentBattle, FieldStance } from '../../state/types';
import type { BattleFormation } from './formations';

/**
 * The questions a fight can ask.
 *
 * There used to be three, each of which fired at most once, so every engagement in a run asked the
 * same three questions in roughly the same order — and by the second fight the player was not
 * making a decision, they were dismissing a card they had already read. That is the whole of the
 * "same questions again and again" complaint, and no amount of tuning the three would have fixed
 * it: the problem was the size of the deck.
 *
 * So: thirty, each with its own trigger, drawn at random from whichever are true right now. A fight
 * still raises at most `BATTLE_MOMENTS_PER_FIGHT`, and still never in the opening beats — this is
 * not a reflex test and the mode already offers to fight without you. What changes is that two
 * fights in a row do not ask the same thing.
 *
 * Every trigger reads state `fightRound` already computes. No new bookkeeping, no new events: the
 * fight was always producing these situations, and only three of them were ever listened for.
 */

/**
 * The shared sentence an answer writes into the fight log.
 *
 * Per-outcome rather than per-question on purpose. Thirty questions with two bespoke result lines
 * each is sixty sentences that say twelve things, and the log is read at a glance mid-fight — what
 * it has to carry is *what happened to the line*, not a second helping of flavour. The question
 * itself is where the writing lives.
 */
export type MomentOutcome =
  | 'pressed' | 'held' | 'charged' | 'braced' | 'focused' | 'spread'
  | 'reserveIn' | 'rallied' | 'gaveGround' | 'pursued' | 'burned' | 'waited';

/**
 * What an answer does, from a deliberately small vocabulary.
 *
 * Small because every one of these is a real lever on `fightRound`, and a Moment that could do
 * anything would be a Moment nobody could predict. Between them they cover the whole of what a
 * commander can actually change mid-engagement: what the line deals and takes, its heart, where it
 * stands, what it is aimed at, and what it spends.
 */
export interface MomentEffect {
  /** Which shared sentence this writes into the log. */
  says: MomentOutcome;
  /** Multiplier on what we deal, for `BATTLE_MOMENT_BONUS_BEATS`. */
  dealt?: number;
  /** Multiplier on what we take, same window. Below 1 is protection. */
  taken?: number;
  /** Heart into our line, at once. */
  morale?: number;
  /** Heart out of theirs, at once. */
  theirMorale?: number;
  /**
   * TEMPO — sets the stance, the same way the dock does.
   *
   * With `stanceNow` it also ignores the four-beat lock, which is the one thing a Moment can do
   * that the dock cannot: the fight offering you a way out of a commitment you have made.
   */
  stance?: FieldStance;
  stanceNow?: boolean;
  /** SHAPE — the next change of shape costs zero beats. The counter without the bill. */
  freeReform?: boolean;
  /** SHAPE — freezes their formation for this many beats. You know what you are answering. */
  lockTheirShape?: number;
  /** EDGE — the tilt runs at `BATTLE_FORMATION_TILT_SHARP` for `BATTLE_MOMENT_BONUS_BEATS`. */
  sharpen?: boolean;
  /** EDGE — the tilt cannot be turned *against* us for the same window. A floor, not a ceiling. */
  guard?: boolean;
  /** Sends the reserve in now — the same commitment the dock's own button makes. */
  reserve?: boolean;
  /** Spends the general's one steadying moment. */
  rally?: boolean;
  /** Ground given or taken, as a share of the field. */
  advance?: number;
  /** Exchanges bought or spent. Negative shortens the fight. */
  rounds?: number;
  /** Men lost outright, as a share of the line still standing. A cost, paid on the spot. */
  loss?: number;
  /** The same, to them. */
  theirLoss?: number;
}

/** Everything a trigger is allowed to look at. All of it is written every beat already. */
export interface MomentContext {
  battle: AscentBattle;
  ours: Army[];
  theirs: Army[];
  round: number;
  /**
   * Beats since the fight opened, the approach included.
   *
   * `round` is the *exchange* count and deliberately does not move during the approach, so a
   * trigger that wants "a little way into the fight" has to read this one or it will never be
   * true before contact.
   */
  beat: number;
  /** Exchanges left in the budget. */
  left: number;
  phase: 'approach' | 'clash';
  ourMorale: number;
  theirMorale: number;
  ourNow: number;
  theirNow: number;
  /** Theirs over ours. Above 1 is being outnumbered. */
  odds: number;
  /** Share of the line we have already lost. */
  ourSpent: number;
  theirSpent: number;
  reserveMen: number;
  /** An enemy column within reach of breaking, if there is one. */
  wavering?: Army;
  /** One of ours in the same state. */
  failing?: Army;
  terrainEdge: number;
  /** The province is river, marsh or paddy — from the land's own terrain summary. */
  wetGround: boolean;
  /** The province is forest, hill or mountain. */
  brokenGround: boolean;
  isGreat: boolean;
  role: 'defence' | 'offence';
  /** The shapes on the board, so a question can be about the very thing the player is looking at. */
  ourFormation: BattleFormation;
  theirFormation: BattleFormation;
  /** How our arms meet theirs, from `compositionMatchup`. Above 1 is favourable. */
  arms: number;
}

export interface BattleMomentDef {
  /** Stem of its i18n keys, and its identity in `momentIds`. */
  id: string;
  /** Relative chance of being drawn when several are true. */
  weight?: number;
  /**
   * This question belongs to the approach, and a fight asks at most one of them.
   *
   * A weight alone could not do this job. Five of the thirty are about closing the ground, the
   * approach is the first third of a fight, and a fight only asks three questions — so however
   * low the weights went, some fights spent two of their three before the lines even met and
   * never got to ask about the melee at all.
   */
  opening?: boolean;
  /**
   * Only ask this while we are holding one of these shapes.
   *
   * What turns the deck from a hand of cards into the fight talking to you about the board: an
   * answer that says "you are in Thế Quy, the shields will hold this — stand" is only offered when
   * you actually are.
   */
  requiresFormation?: BattleFormation[];
  /** Is this question worth asking right now? */
  when: (ctx: MomentContext) => boolean;
  /** The name the question is about. */
  subject?: (ctx: MomentContext) => string | undefined;
  /** The enemy column it concerns, when it concerns one. */
  hostId?: (ctx: MomentContext) => string | undefined;
  commit: MomentEffect;
  steady: MomentEffect;
}

const enemy = (ctx: MomentContext): string => ctx.battle.kingdomName;
const place = (ctx: MomentContext): string => ctx.battle.landName;

/**
 * The deck.
 *
 * Ordered loosely from the most common situation to the rarest, which is only for reading: the
 * draw is weighted, not ordered. Weights are low for the ones that would otherwise crowd out the
 * rest — `wavering` and `charge-coming` are true in most fights, and at equal weight the other
 * twenty-eight would almost never be seen, which is the old problem wearing a bigger table.
 */
export const BATTLE_MOMENTS: BattleMomentDef[] = [
  {
    id: 'wavering',
    weight: 0.7,
    when: (c) => Boolean(c.wavering),
    subject: (c) => c.wavering?.name,
    hostId: (c) => c.wavering?.id,
    commit: { says: 'focused', sharpen: true, dealt: 1.4, taken: 1.12 },
    steady: { says: 'held', guard: true, morale: 5, taken: 0.92 },
  },
  {
    id: 'charge-coming',
    weight: 0.7,
    // Not "and we are not braced": the dock opens on Hold and an unattended fight never leaves
     // it, so the second clause made this unreachable in exactly the runs where it matters most.
     // The question is whether to meet a charge, and it is a question either way.
    when: (c) => c.battle.theirStance === 'press' || c.theirFormation === 'xung',
    subject: enemy,
    commit: { says: 'charged', sharpen: true, dealt: 1.3, taken: 1.15, advance: 0.05 },
    steady: { says: 'braced', lockTheirShape: 3, taken: 0.74, morale: 4 },
  },
  {
    id: 'last-rounds',
    weight: 0.8,
    when: (c) => c.left <= 5 && c.left > 0 && c.phase === 'clash',
    subject: place,
    commit: { says: 'pressed', dealt: 1.45, loss: 0.04, rounds: -1 },
    steady: { says: 'held', morale: 7, rounds: 2, taken: 0.88 },
  },
  {
    id: 'arrow-storm',
    opening: true,
    // The approach is the first third of a fight and holds five of the thirty questions. At even
    // weight it took two of every three a fight allows, and the questions about the melee — the
    // clock running out, terms offered, a line half gone — became unreachable in their turn.
    weight: 0.5,
    when: (c) => c.phase === 'approach' && c.beat >= 2,
    subject: enemy,
    commit: { says: 'charged', stance: 'press', stanceNow: true, advance: 0.1, taken: 1.2, dealt: 1.25 },
    steady: { says: 'braced', taken: 0.7, rounds: -1 },
  },
  {
    id: 'reserve-called',
    when: (c) => c.reserveMen > 0 && !c.battle.reserveSpent && c.ourMorale <= 62,
    commit: { says: 'reserveIn', reserve: true, morale: 6 },
    steady: { says: 'waited', dealt: 1.15, morale: 3 },
  },
  {
    // The general's one steadying moment, which used to be a button on the dock. With that button
    // gone the deck is the *only* way to spend a rally, so this question has to be reachable in
    // every fight that has a commander and a line that has started to sag.
    id: 'the-general-speaks',
    when: (c) => !c.battle.rallySpent && c.battle.rallyPower > 0 && c.ourMorale <= 58,
    subject: (c) => c.battle.generalName,
    commit: { says: 'rallied', rally: true, morale: 4 },
    steady: { says: 'held', guard: true, dealt: 1.12 },
  },
  {
    // Only ever asked of a host actually standing in the tortoise — the fight reading the board
    // back to the player rather than dealing them a card.
    id: 'shields-will-hold',
    requiresFormation: ['quy'],
    weight: 0.6,
    when: (c) => c.phase === 'clash' && c.ourSpent >= 0.2,
    subject: enemy,
    commit: { says: 'pressed', freeReform: true, dealt: 1.2 },
    steady: { says: 'braced', guard: true, taken: 0.78, morale: 5 },
  },
  {
    id: 'their-line-thins',
    when: (c) => c.theirSpent >= 0.4 && c.phase === 'clash',
    subject: enemy,
    commit: { says: 'pursued', theirLoss: 0.07, theirMorale: -8, taken: 1.18 },
    steady: { says: 'held', morale: 6, taken: 0.85 },
  },
  {
    id: 'wounded-carried',
    when: (c) => c.ourSpent >= 0.3 && c.phase === 'clash',
    commit: { says: 'pressed', dealt: 1.25, morale: -5 },
    steady: { says: 'gaveGround', morale: 11, dealt: 0.9, advance: -0.04 },
  },
  {
    id: 'banner-down',
    when: (c) => c.ourMorale <= 50 && !c.battle.rallySpent && c.battle.rallyPower > 0,
    commit: { says: 'rallied', rally: true, morale: 5 },
    steady: { says: 'braced', taken: 0.78, morale: 4 },
  },
  {
    id: 'night-falls',
    when: (c) => c.round >= 10 && c.phase === 'clash',
    subject: place,
    commit: { says: 'pressed', dealt: 1.3, taken: 1.2 },
    steady: { says: 'waited', rounds: 2, morale: 8, taken: 0.9 },
  },
  {
    id: 'their-general-exposed',
    when: (c) => c.theirMorale <= 58 && c.phase === 'clash',
    subject: enemy,
    commit: { says: 'focused', theirMorale: -13, loss: 0.05 },
    steady: { says: 'held', morale: 5, dealt: 1.1 },
  },
  {
    id: 'outnumbered',
    when: (c) => c.odds >= 1.35,
    subject: enemy,
    commit: { says: 'charged', stance: 'press', stanceNow: true, dealt: 1.35, taken: 1.1 },
    steady: { says: 'braced', stance: 'defend', taken: 0.72, advance: -0.05 },
  },
  {
    id: 'we-outnumber',
    when: (c) => c.odds <= 0.72,
    commit: { says: 'spread', dealt: 1.28, taken: 1.08, theirMorale: -6 },
    steady: { says: 'held', taken: 0.85, morale: 5 },
  },
  {
    id: 'river-crossing',
    opening: true,
    weight: 0.5,
    when: (c) => c.wetGround && c.phase === 'approach' && c.role === 'defence',
    subject: enemy,
    commit: { says: 'charged', theirLoss: 0.06, loss: 0.03, advance: 0.08 },
    steady: { says: 'braced', taken: 0.76, morale: 6 },
  },
  {
    id: 'stakes-in-the-river',
    weight: 0.6,
    when: (c) => c.wetGround && c.role === 'defence' && c.round <= 8,
    commit: { says: 'burned', theirLoss: 0.05, theirMorale: -9, rounds: -1 },
    steady: { says: 'waited', taken: 0.82, rounds: 1 },
  },
  {
    id: 'dyke-gate',
    when: (c) => c.wetGround && c.phase === 'clash',
    subject: place,
    commit: { says: 'burned', theirLoss: 0.09, loss: 0.04, rounds: -2 },
    steady: { says: 'held', taken: 0.8, morale: 4 },
  },
  {
    id: 'mud',
    when: (c) => c.wetGround && c.round >= 4,
    commit: { says: 'charged', dealt: 1.3, loss: 0.03 },
    steady: { says: 'waited', taken: 0.78, dealt: 0.92 },
  },
  {
    id: 'narrow-pass',
    when: (c) => c.brokenGround && c.terrainEdge >= 1.15,
    subject: place,
    commit: { says: 'braced', taken: 0.62, dealt: 0.85, advance: -0.03 },
    steady: { says: 'gaveGround', advance: -0.08, theirLoss: 0.05, rounds: 1 },
  },
  {
    id: 'take-the-rise',
    opening: true,
    weight: 0.5,
    when: (c) => c.brokenGround && c.phase === 'approach' && c.beat >= 2,
    commit: { says: 'charged', advance: 0.09, dealt: 1.2, loss: 0.02 },
    steady: { says: 'held', taken: 0.86, morale: 4 },
  },
  {
    id: 'forest-flank',
    when: (c) => c.brokenGround && c.phase === 'clash' && c.round >= 5,
    subject: enemy,
    commit: { says: 'focused', dealt: 1.35, theirMorale: -7, taken: 1.14 },
    steady: { says: 'spread', taken: 0.84, morale: 3 },
  },
  {
    id: 'fire-arrows',
    opening: true,
    weight: 0.5,
    when: (c) => c.phase === 'approach' && !c.wetGround,
    subject: enemy,
    commit: { says: 'burned', theirMorale: -10, theirLoss: 0.03, rounds: -1 },
    steady: { says: 'waited', dealt: 1.22 },
  },
  {
    id: 'their-relief-seen',
    when: (c) => c.theirs.length >= 2 && c.phase === 'clash',
    subject: enemy,
    commit: { says: 'focused', sharpen: true, dealt: 1.4, taken: 1.2, rounds: -1 },
    steady: { says: 'spread', taken: 0.8, dealt: 0.9, morale: 4 },
  },
  {
    id: 'our-relief-near',
    when: (c) => c.ours.length >= 2 && c.round >= 4,
    commit: { says: 'pressed', dealt: 1.25, taken: 1.1 },
    steady: { says: 'waited', rounds: 2, morale: 7, taken: 0.88 },
  },
  {
    id: 'they-offer-terms',
    weight: 0.8,
    when: (c) => c.round >= 9 && c.odds >= 0.8 && c.odds <= 1.25 && c.phase === 'clash',
    subject: enemy,
    commit: { says: 'pressed', morale: 9, dealt: 1.2, theirMorale: -5 },
    steady: { says: 'waited', rounds: -1, taken: 0.7, morale: 4 },
  },
  {
    id: 'captured-scout',
    when: (c) => c.round >= 4 && c.round <= 11,
    subject: enemy,
    commit: { says: 'focused', dealt: 1.3, theirMorale: -4 },
    steady: { says: 'spread', theirMorale: -9, taken: 0.9 },
  },
  {
    id: 'arms-favour-us',
    when: (c) => c.arms >= 1.05,
    commit: { says: 'pressed', dealt: 1.32, taken: 1.06 },
    steady: { says: 'held', taken: 0.84, rounds: 1 },
  },
  {
    id: 'arms-favour-them',
    when: (c) => c.arms <= 0.96,
    subject: enemy,
    commit: { says: 'charged', stance: 'press', stanceNow: true, dealt: 1.28, loss: 0.04 },
    steady: { says: 'braced', freeReform: true, taken: 0.72, advance: -0.05 },
  },
  {
    id: 'sworn-oath',
    when: (c) => c.isGreat && c.round >= 5,
    subject: place,
    commit: { says: 'rallied', morale: 14, taken: 1.12 },
    steady: { says: 'held', dealt: 1.18, morale: 4 },
  },
  {
    id: 'village-behind',
    when: (c) => c.role === 'defence' && c.round >= 6 && c.ourMorale <= 70,
    subject: place,
    commit: { says: 'braced', taken: 0.7, morale: 8, advance: -0.02 },
    steady: { says: 'gaveGround', advance: -0.1, rounds: 2, morale: -4 },
  },
  {
    id: 'the-drum',
    weight: 0.6,
    when: (c) => c.round >= 4,
    commit: { says: 'charged', morale: 7, dealt: 1.18 },
    steady: { says: 'braced', taken: 0.82, morale: 3 },
  },
  {
    id: 'dawn-attack',
    opening: true,
    weight: 0.6,
    when: (c) => c.phase === 'approach' && c.beat <= 8 && c.role === 'offence',
    subject: enemy,
    commit: { says: 'charged', dealt: 1.45, advance: 0.12, loss: 0.04 },
    steady: { says: 'waited', taken: 0.8, rounds: 1, morale: 5 },
  },
];

/**
 * The questions that are true right now and have not been asked yet in this fight.
 *
 * Exported so a harness can ask the deck what it would offer without running a battle — the old
 * three were untestable except by playing, which is how two of them came to be so narrow that one
 * trigger took every Moment in forty fights.
 */
export function eligibleMoments(ctx: MomentContext, asked: readonly string[]): BattleMomentDef[] {
  return BATTLE_MOMENTS.filter((def) => !asked.includes(def.id)
    // A question about the shape we are holding is only worth asking while we are holding it.
    && (!def.requiresFormation || def.requiresFormation.includes(ctx.ourFormation))
    && def.when(ctx));
}
