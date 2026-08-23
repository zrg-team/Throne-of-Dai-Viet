import { applyResourceDelta } from '../../systems/ResourceSystem';
import { pick } from '../../systems/story/StorySystem';
import type { StoryTemplate } from '../../systems/story/types';

/**
 * Chín Trăm Lượng — Nine Hundred Gold, Sitting Still.
 *
 * The shortest story in the set and the one that most reliably surprises, because it fires on
 * *prosperity*. Nothing has gone wrong. The player is doing well, the treasury is deep, and
 * somebody in it has begun writing the figure down each month.
 *
 * Spend below the line in time and nothing happens at all — and the player never learns what
 * would have. That silence is the design: an outcome the player avoided without ever being told
 * there was one is worth more than a warning they were allowed to read.
 */
export const countingHouse: StoryTemplate = {
  id: 'counting-house',
  record: 'ngoai-truyen',
  pressure: (ctx) => {
    if (ctx.recall('spentInPublic') >= 2) return 'da-voi';
    if (ctx.state.resources.gold >= 900) return 'day-len';
    if (ctx.state.resources.gold >= 620) return 'van-ngoi-day';
    return undefined;
  },
  seedWeight: 2,
  minTurn: 16,
  seed: (state) => {
    if (state.resources.gold < 620) return undefined;
    const clerk = pick(state.heroes.filter(
      (hero) => hero.id !== 'king' && hero.stats.loyalty < 55,
    ));
    return { heroId: clerk?.id };
  },

  fragments: [
    {
      id: 'so-van-de-o-gian-ngoai',
      volume: 'whisper',
      weight: 4,
      quiet: 4,
      when: (ctx) => ctx.recall('chose_the-treasury-is-mine') === 1,
      salience: (ctx) => (ctx.age >= 5 ? 5 : -20),
    },
    {
      id: 'chua-ay-xay-them-gian',
      volume: 'whisper',
      weight: 4,
      quiet: 4,
      when: (ctx) => ctx.recall('chose_let-them-hold-it') === 1,
      salience: (ctx) => (ctx.age >= 5 ? 5 : -20),
    },
    {
      /**
       * Spend it, and be seen to.
       *
       * The story fires on a deep treasury and somebody quietly writing the figure down each
       * month. Until now the only answers were on one card, and the obvious third — put the money
       * to work where everybody can see it go — did not exist. Repeatable, because the hoard
       * builds back up and so does the counting.
       */
      id: 'tieu-cho-ai-cung-thay',
      volume: 'whisper',
      weight: 6,
      quiet: 3,
      repeatable: true,
      maxTimes: 4,
      when: (ctx) => ctx.state.resources.gold >= 400,
      opening: { on: 'treasury', actionKey: 'tieuBot' },
      options: [
        {
          id: 'tieu-bot-di',
          cost: { gold: 200 },
          apply: (ctx) => {
            ctx.bump('spentInPublic');
            const seat = ctx.land();
            if (seat) {
              seat.defense += 4;
              ctx.note('landDefense', 4, seat.name);
            }
            ctx.state.court.stability = Math.min(100, ctx.state.court.stability + 4);
            ctx.note('stability', 4);
            // The man doing the counting has less to count, and less to say about it.
            ctx.heat(-4);
          },
        },
      ],
    },
    {
      id: 'somebody-is-counting',
      volume: 'whisper',
      weight: 6,
      quiet: 1,
      when: (ctx) => ctx.state.resources.gold >= 620,
      salience: (ctx) => (ctx.age >= 2 ? 6 : -20),
      heat: 2,
      tone: 'info',
    },
    {
      id: 'the-ledger-is-copied',
      volume: 'whisper',
      weight: 3,
      when: (ctx) => ctx.said('somebody-is-counting') && ctx.state.resources.gold >= 620,
      quiet: 6,
      salience: (ctx) => ctx.story.temperature,
      heat: 2.5,
      tone: 'threat',
    },
    {
      id: 'the-temple-offers',
      volume: 'card',
      band: 'shrine',
      weight: 5,
      quiet: 4,
      when: (ctx) => ctx.said('somebody-is-counting') && ctx.state.resources.gold >= 400,
      salience: (ctx) => 3 + ctx.story.temperature * 0.5,
      options: [
        {
          id: 'let-them-hold-it',
          cost: { gold: 300 },
          apply: (ctx) => {
            // Safe, and it earns nothing. The abbot is a careful man.
            ctx.remember('sheltered', 300);
            // Cost-only before this: three hundred gold went out and the card said nothing back.
            // What it buys is a ledger anybody may come and read, which is worth something in a
            // court that has been counting the treasury behind your back.
            ctx.state.court.stability = Math.min(100, ctx.state.court.stability + 5);
            ctx.note('stability', 5);
            ctx.heat(-6);
          },
        },
        {
          id: 'the-treasury-is-mine',
          apply: (ctx) => {
            ctx.remember('refusedShelter', 1);
            // R1. Where it is, is your business — and the man who has been counting it hears
            // exactly that.
            const clerk = ctx.hero();
            if (clerk) clerk.stats.loyalty = Math.max(0, clerk.stats.loyalty - 8);
            ctx.note('stability', 0);
            ctx.heat(2);
          },
        },
      ],
    },

    // Spend it and the story quietly evaporates. The player never learns what almost happened.
    {
      id: 'the-coffers-are-light-again',
      volume: 'whisper',
      weight: 4,
      terminal: true,
      tone: 'info',
      when: (ctx) => ctx.state.resources.gold < 300 && ctx.recall('sheltered') === 0,
      salience: () => 8,
    },
    {
      id: 'returned-with-interest',
      volume: 'whisper',
      weight: 4,
      terminal: true,
      tone: 'reward',
      when: (ctx) => ctx.recall('sheltered') > 0 && ctx.age >= 26,
      salience: () => 6,
      effect: (ctx) => {
        applyResourceDelta(ctx.state, { gold: ctx.recall('sheltered') });
      },
    },

    // The blow. Two whispers came first, and they are in the Chronicle.
    {
      id: 'gone-in-the-night',
      volume: 'blow',
      band: 'night',
      weight: 9,
      terminal: true,
      tone: 'threat',
      when: (ctx) => ctx.story.temperature >= 7
        && ctx.said('the-ledger-is-copied')
        && ctx.state.resources.gold >= 500
        && ctx.recall('sheltered') === 0,
      salience: () => 12,
      effect: (ctx) => {
        applyResourceDelta(ctx.state, { gold: -ctx.state.resources.gold });
        const hero = ctx.hero();
        if (hero) {
          ctx.state.heroes = ctx.state.heroes.filter((candidate) => candidate.id !== hero.id);
          for (const seat of Object.keys(ctx.state.court.seats)) {
            const key = seat as keyof typeof ctx.state.court.seats;
            if (ctx.state.court.seats[key] === hero.id) ctx.state.court.seats[key] = undefined;
          }
        }
      },
    },
  ],
};
