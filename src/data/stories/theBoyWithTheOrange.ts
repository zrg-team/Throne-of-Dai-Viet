import { PLAYER_KINGDOM_ID } from '../../game/constants';
import { applyResourceDelta } from '../../systems/ResourceSystem';
import { pick, playerLands } from '../../systems/story/StorySystem';
import { generateHero } from '../heroFactory';
import type { StoryTemplate } from '../../systems/story/types';

/**
 * Quả Cam — The Boy With the Orange.
 *
 * Trần Quốc Toản was too young to be admitted to the war council. He stood outside it and
 * crushed an orange in his fist without noticing, then raised his own banner and died in the
 * fighting at sixteen.
 *
 * The mechanic this yields is the one the first draft of the design could not express:
 * **refusal is not a null input.** Send him away and he acts anyway — a host you do not control,
 * cannot recall, and cannot give orders to, which throws itself at the strongest enemy on the
 * map. Usually he dies. Occasionally he wins, and the run remembers it.
 */
export const theBoyWithTheOrange: StoryTemplate = {
  id: 'orange',
  seedWeight: 2,
  minTurn: 18,
  seed: (state) => {
    const ascent = state.ascent;
    if (!ascent || ascent.wavesSurvived < 1) return undefined;
    const home = pick(playerLands(state));
    if (!home) return undefined;
    return { landId: home.id };
  },

  fragments: [
    {
      id: 'juice-on-his-wrist',
      volume: 'card',
      band: 'court',
      weight: 7,
      quiet: 2,
      salience: (ctx) => (ctx.age >= 2 ? 7 : -20),
      options: [
        {
          id: 'admit-him',
          apply: (ctx) => {
            const boy = generateHero(ctx.state.turn * 5471, {
              id: `orange-${ctx.state.turn}`,
              type: 'general',
              sex: 'man',
            });
            boy.stats.martial = 44;
            boy.stats.loyalty = 92;
            boy.stats.renown = 12;
            ctx.state.heroes.push(boy);
            ctx.story.cast.heroId = boy.id;
            ctx.remember('admitted', 1);
            ctx.remember('echoTurn', ctx.state.turn);
          },
        },
        {
          id: 'he-is-a-child',
          apply: (ctx) => {
            ctx.remember('refused', 1);
            ctx.state.court.stability = Math.min(100, ctx.state.court.stability + 4);
            ctx.heat(4);
          },
        },
      ],
    },

    // Admitted: he is worth something, and it costs nothing but a seat at the table.
    {
      id: 'six-hundred-of-his-household',
      volume: 'whisper',
      weight: 4,
      tone: 'reward',
      when: (ctx) => ctx.recall('admitted') === 1,
      quiet: 4,
      salience: () => 5,
      effect: (ctx) => {
        applyResourceDelta(ctx.state, { humans: 600 });
        const boy = ctx.hero();
        if (boy) boy.stats.renown = Math.min(100, boy.stats.renown + 15);
        ctx.remember('brought', 1);
      },
    },
    {
      id: 'he-grows-into-it',
      volume: 'whisper',
      weight: 2,
      terminal: true,
      tone: 'reward',
      when: (ctx) => ctx.recall('brought') === 1 && ctx.age >= 30,
      salience: () => 5,
      effect: (ctx) => {
        const boy = ctx.hero();
        if (boy) {
          boy.stats.martial = Math.min(100, boy.stats.martial + 14);
          boy.traits = [...(boy.traits ?? []), 'Young Marquis'];
        }
      },
    },

    // Refused: he raises his banner anyway, and it is out of the player's hands entirely.
    {
      id: 'he-raises-his-banner',
      volume: 'blow',
      band: 'march',
      weight: 8,
      tone: 'threat',
      when: (ctx) => ctx.recall('refused') === 1,
      quiet: 3,
      salience: () => 10,
      effect: (ctx) => {
        // A real host, on the map, under nobody's orders.
        const home = ctx.land();
        if (!home) return;
        ctx.state.armies.push({
          id: `orange-host-${ctx.state.turn}`,
          kingdomId: PLAYER_KINGDOM_ID,
          name: 'Cờ Riêng',
          landId: home.id,
          units: { spearmen: 420, archers: 140, heavyInfantry: 40 },
          morale: 100,
          supply: 60,
          rations: 120,
          provisions: 90,
          level: 1,
          experience: 0,
          experienceToNextLevel: 120,
        });
        ctx.remember('banner', 1);
      },
    },
    {
      id: 'he-does-not-wait-for-orders',
      volume: 'whisper',
      weight: 4,
      when: (ctx) => ctx.recall('banner') === 1,
      quiet: 4,
      tone: 'threat',
      effect: (ctx) => {
        // He throws himself at whatever is largest. This is not a controllable host.
        const host = ctx.state.armies.find((army) => army.id.startsWith('orange-host-'));
        const enemy = ctx.state.armies
          .filter((army) => army.kingdomId !== PLAYER_KINGDOM_ID)
          .sort((a, b) => (b.units.spearmen + b.units.archers) - (a.units.spearmen + a.units.archers))[0];
        if (host && enemy) host.landId = enemy.landId;
        ctx.bump('charges');
      },
    },
    {
      id: 'the-banner-falls',
      volume: 'blow',
      band: 'fire',
      weight: 7,
      terminal: true,
      tone: 'threat',
      when: (ctx) => ctx.recall('charges') >= 1,
      salience: (ctx) => 4 + ctx.recall('charges') * 3,
      effect: (ctx) => {
        ctx.state.armies = ctx.state.armies.filter((army) => !army.id.startsWith('orange-host-'));
        // Every hero who watched a sixteen-year-old do that is a little harder to lose.
        for (const hero of ctx.state.heroes) {
          hero.stats.loyalty = Math.min(100, hero.stats.loyalty + 6);
        }
        for (const land of playerLands(ctx.state)) {
          land.loyalty = Math.min(100, land.loyalty + 5);
        }
      },
    },
  ],
};
