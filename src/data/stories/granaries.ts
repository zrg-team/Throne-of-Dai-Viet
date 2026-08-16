import { applyResourceDelta } from '../../systems/ResourceSystem';
import { pick, playerLands } from '../../systems/story/StorySystem';
import type { StoryTemplate } from '../../systems/story/types';

/**
 * Kho Thóc Của Tể Tướng — The Chancellor's Granaries.
 *
 * Hồ Quý Ly's reforms were genuinely advanced — a national paper currency, land caps — and were
 * imposed with no popular consent. Counterfeiting, then famine, then the Ming. Seven years.
 *
 * The point of this story is **attribution**, and it is the cheapest drama in the whole design:
 * it does not cause the famine. The simulation produces famine on its own schedule and always
 * has. This story simply *claims* it, and now the shortage has an author, a signature and a name
 * the player can act against. One hook, eleven words, and the world stops feeling like a
 * spreadsheet with weather.
 *
 * Nothing stops the player taking every reform. The collapse fragment only exists if they did.
 */
export const granaries: StoryTemplate = {
  id: 'granaries',
  regard: (ctx) => {
    if (ctx.recall('dismissed') === 1) return 'dismissed';
    if (ctx.recall('stoodBy') === 1) return 'trusted';
    if (ctx.recall('reforms') >= 2) return 'reforming';
    return undefined;
  },
  seedWeight: 2,
  minTurn: 10,
  seed: (state) => {
    const chancellor = pick(state.heroes.filter(
      (hero) => hero.id !== 'king' && hero.stats.administration >= 40,
    ));
    const land = pick(playerLands(state));
    if (!chancellor || !land) return undefined;
    return { heroId: chancellor.id, landId: land.id };
  },

  fragments: [
    {
      id: 'a-proposal',
      volume: 'card',
      band: 'court',
      weight: 6,
      quiet: 2,
      salience: (ctx) => (ctx.age >= 2 ? 6 : -20),
      options: [
        {
          id: 'enact',
          apply: (ctx) => {
            ctx.bump('reforms');
            // Genuinely good. That is why it is taken, and why the story works.
            applyResourceDelta(ctx.state, { gold: 90 });
            for (const land of playerLands(ctx.state)) {
              land.loyalty = Math.max(0, land.loyalty - 4);
            }
            ctx.heat(1.5);
          },
        },
        {
          id: 'not-this-one',
          apply: (ctx) => {
            ctx.bump('refused');
            ctx.state.court.stability = Math.max(0, ctx.state.court.stability - 3);
            ctx.heat(-1);
          },
        },
      ],
    },
    {
      id: 'a-second-proposal',
      volume: 'card',
      band: 'court',
      weight: 4,
      quiet: 7,
      when: (ctx) => ctx.recall('reforms') >= 1,
      salience: (ctx) => 2 + ctx.recall('reforms'),
      options: [
        {
          id: 'enact',
          apply: (ctx) => {
            ctx.bump('reforms');
            applyResourceDelta(ctx.state, { gold: 110, supplies: 60 });
            for (const land of playerLands(ctx.state)) {
              land.loyalty = Math.max(0, land.loyalty - 7);
            }
            ctx.heat(2.5);
          },
        },
        {
          id: 'enough',
          apply: (ctx) => {
            ctx.remember('stopped', 1);
            ctx.heat(-4);
          },
        },
      ],
    },
    {
      id: 'paper-for-copper',
      volume: 'whisper',
      weight: 3,
      when: (ctx) => ctx.recall('reforms') >= 2,
      salience: (ctx) => ctx.recall('reforms'),
      heat: 1,
      tone: 'info',
    },
    {
      id: 'price-of-rice',
      volume: 'whisper',
      weight: 3,
      when: (ctx) => ctx.recall('reforms') >= 2 && ctx.said('paper-for-copper'),
      salience: (ctx) => (ctx.world.starving ? 8 : 1),
      heat: 1.5,
      tone: 'threat',
    },

    /**
     * The attribution fragment. Fires only when the simulation is *already* starving the realm —
     * it takes no food, changes no rate, and invents nothing. It gives the shortage a signature.
     */
    {
      id: 'the-granaries-were-sold',
      volume: 'blow',
      band: 'granary',
      weight: 8,
      tone: 'threat',
      when: (ctx) => ctx.world.starving && ctx.recall('reforms') >= 2,
      salience: () => 10,
      effect: (ctx) => {
        ctx.remember('blamed', 1);
        ctx.heat(3);
      },
    },
    {
      id: 'the-chancellor-answers',
      volume: 'card',
      band: 'court',
      weight: 6,
      quiet: 3,
      when: (ctx) => ctx.recall('blamed') === 1,
      salience: () => 8,
      options: [
        {
          id: 'dismiss-him',
          apply: (ctx) => {
            const hero = ctx.hero();
            if (hero) {
              hero.assignedTo = undefined;
              for (const seat of Object.keys(ctx.state.court.seats)) {
                const key = seat as keyof typeof ctx.state.court.seats;
                if (ctx.state.court.seats[key] === hero.id) ctx.state.court.seats[key] = undefined;
              }
            }
            for (const land of playerLands(ctx.state)) {
              land.loyalty = Math.min(100, land.loyalty + 8);
            }
            ctx.remember('dismissed', 1);
          },
        },
        {
          id: 'stand-by-him',
          apply: (ctx) => {
            ctx.state.court.stability = Math.min(100, ctx.state.court.stability + 10);
            for (const land of playerLands(ctx.state)) {
              land.loyalty = Math.max(0, land.loyalty - 10);
            }
            ctx.remember('stoodBy', 1);
            ctx.heat(3);
          },
        },
        {
          id: 'open-the-royal-stores',
          cost: { gold: 200 },
          apply: (ctx) => {
            applyResourceDelta(ctx.state, { food: 260 });
            for (const land of playerLands(ctx.state)) {
              land.loyalty = Math.min(100, land.loyalty + 5);
            }
            ctx.remember('paidForIt', 1);
            ctx.heat(-3);
          },
        },
      ],
    },

    // Terminals.
    {
      id: 'seven-years',
      volume: 'blow',
      band: 'fire',
      weight: 8,
      terminal: true,
      tone: 'threat',
      when: (ctx) => ctx.recall('stoodBy') === 1 && ctx.story.temperature >= 8,
      salience: () => 12,
      effect: (ctx) => {
        // The realm does not rise against the reforms. It simply stops holding together.
        for (const land of playerLands(ctx.state)) {
          land.loyalty = Math.max(0, land.loyalty - 18);
        }
        ctx.state.court.stability = Math.max(0, ctx.state.court.stability - 22);
      },
    },
    {
      id: 'the-reforms-hold',
      volume: 'whisper',
      weight: 4,
      terminal: true,
      tone: 'reward',
      when: (ctx) => ctx.recall('reforms') >= 2
        && (ctx.recall('paidForIt') === 1 || ctx.recall('stopped') === 1)
        && ctx.age >= 30,
      salience: () => 6,
      effect: (ctx) => {
        applyResourceDelta(ctx.state, { supplies: 90 });
        const hero = ctx.hero();
        if (hero) hero.stats.administration = Math.min(100, hero.stats.administration + 8);
      },
    },
    {
      id: 'nothing-was-enacted',
      volume: 'whisper',
      weight: 2,
      terminal: true,
      tone: 'info',
      when: (ctx) => ctx.recall('refused') >= 1 && ctx.recall('reforms') === 0 && ctx.age >= 24,
      salience: () => 4,
    },
  ],
};
