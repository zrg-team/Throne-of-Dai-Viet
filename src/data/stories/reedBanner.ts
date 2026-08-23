import { PLAYER_KINGDOM_ID } from '../../game/constants';
import { applyResourceDelta } from '../../systems/ResourceSystem';
import { pick, playerLands } from '../../systems/story/StorySystem';
import { pushToast } from '../../systems/empire/notifications';
import { storyText } from '../../i18n/story';
import type { StoryTemplate } from '../../systems/story/types';
import type { GameState, Land } from '../../state/types';

/**
 * Ngọn Cờ Lau — The Reed Banner.
 *
 * A buffalo herder's son who played at war with reed banners grows up to end the anarchy of the
 * twelve warlords, or to become the thirteenth. Đinh Bộ Lĩnh, 968.
 *
 * This is the flagship, and the shape of it is the whole argument for the salience model: the
 * same twenty-two fragments produce a founding, a rebellion, or a man who quietly leaves and
 * turns up thirty-eight seasons later commanding somebody else's army. Nothing in the pool is a
 * "path"; the story simply keeps reading how he is being treated.
 *
 * The disaster branch is reachable without the player ever missing an objective. Seating a
 * Marshal is a perfectly good decision. The story just notices that it was not him.
 */

function unposted(state: GameState, heroId?: string): boolean {
  const hero = state.heroes.find((candidate) => candidate.id === heroId);
  if (!hero) return false;
  return !hero.assignedTo && !state.armies.some((army) => army.generalHeroId === hero.id);
}

function commanding(state: GameState, heroId?: string): boolean {
  return state.armies.some((army) => army.generalHeroId === heroId);
}

/** Provinces that would follow him, poorest-loyalty first — the ones with least to lose. */
function looseLands(state: GameState): Land[] {
  return playerLands(state)
    .filter((land) => land.loyalty < 70)
    .sort((a, b) => a.loyalty - b.loyalty);
}

export const reedBanner: StoryTemplate = {
  id: 'reed-banner',
  seedWeight: 3,
  minTurn: 6,
  seed: (state) => {
    // Any unremarkable hero. The story is about what he becomes, so he must start as nobody.
    const candidates = state.heroes.filter(
      (hero) => hero.id !== 'king' && hero.stats.renown < 34,
    );
    const hero = pick(candidates);
    if (!hero) return undefined;
    const home = pick(playerLands(state));
    return { heroId: hero.id, landId: home?.id };
  },

  /**
   * How the boy currently stands with the throne — the page's one-line relationship.
   * Words, never a number, and it moves only when the player actually did something.
   */
  regard: (ctx) => {
    if (ctx.recall('humiliated') >= 1) return 'humiliated';
    if (ctx.recall('trusted') >= 1 || ctx.recall('gaveHost') >= 1) return 'trusted';
    if (ctx.recall('coldness') >= 2) return 'cold';
    if (ctx.recall('heHasAsked') >= 1) return 'waiting';
    return 'hopeful';
  },

  fragments: [
    /**
     * Act I, as a scene rather than a mood: the buffalo, the courtyard, the boy who does not
     * kneel. The old opener ("a boy drills children with reed banners") was one line of
     * atmosphere with no one in it — the exact defect the whole depth pass exists to fix. The
     * whisper stays in the pool as a follow-up; this card is now the front door.
     */
    {
      id: 'the-buffalo-feast',
      volume: 'card',
      band: 'field',
      weight: 8,
      quiet: 0,
      salience: (ctx) => (ctx.age >= 1 ? 9 : -20),
      options: [
        {
          id: 'take-him-in',
          cost: { gold: 40 },
          apply: (ctx) => {
            ctx.remember('tookIn', 1);
            ctx.remember('echoTurn', ctx.state.turn);
            // Forty gold, and the card said nothing back. He is fifteen and somebody fed him.
            const taken = ctx.hero();
            if (taken) taken.stats.loyalty = Math.min(100, taken.stats.loyalty + 12);
            ctx.heat(-1);
          },
        },
        {
          id: 'send-with-rice',
          cost: { food: 60 },
          apply: (ctx) => {
            ctx.remember('sentBack', 1);
            const land = ctx.land();
            if (land) land.loyalty = Math.min(100, land.loyalty + 4);
          },
        },
        {
          id: 'make-him-repay',
          apply: (ctx) => {
            ctx.remember('punished', 1);
            const hero = ctx.hero();
            if (hero) hero.stats.loyalty = Math.max(0, hero.stats.loyalty - 10);
            ctx.heat(2);
          },
        },
      ],
    },

    // The dyke: what he does with the years nobody is watching him. Pure characterisation,
    // and the seed of the ending — the forty men are the garrison that opens the gates.
    {
      id: 'forty-men-mended-the-dyke',
      volume: 'whisper',
      weight: 4,
      quiet: 4,
      when: (ctx) => ctx.said('the-buffalo-feast'),
      salience: (ctx) => (ctx.age >= 5 ? 4 : 0),
      effect: (ctx) => {
        ctx.remember('dykeMended', 1);
        const land = ctx.land();
        if (land) land.loyalty = Math.min(100, land.loyalty + 3);
      },
    },

    // ── The opening line every run gets ──────────────────────────────────────
    {
      id: 'reed-children',
      volume: 'whisper',
      weight: 6,
      quiet: 0,
      salience: (ctx) => (ctx.age >= 2 ? 4 : -10),
      heat: 0.5,
    },

    // ── He is being used ─────────────────────────────────────────────────────
    {
      id: 'no-man-lost',
      volume: 'whisper',
      weight: 3,
      when: (ctx) => commanding(ctx.state, ctx.story.cast.heroId),
      salience: (ctx) => (ctx.world.wonBattle ? 6 : 0),
      effect: (ctx) => {
        ctx.bump('wonUnderHim');
        const hero = ctx.hero();
        if (hero) hero.stats.renown = Math.min(100, hero.stats.renown + 3);
      },
      tone: 'reward',
    },
    {
      id: 'given-a-host',
      volume: 'whisper',
      weight: 2,
      when: (ctx) => commanding(ctx.state, ctx.story.cast.heroId) && ctx.recall('noticedCommand') === 0,
      effect: (ctx) => {
        ctx.remember('noticedCommand', 1);
        ctx.remember('echoTurn', ctx.state.turn);
        ctx.heat(-1);
      },
    },
    {
      id: 'villages-raise-his-banner',
      volume: 'whisper',
      weight: 2,
      when: (ctx) => ctx.recall('wonUnderHim') >= 2,
      salience: (ctx) => ctx.recall('wonUnderHim'),
      heat: 1,
    },

    // ── The card that only exists when he has outgrown the throne ────────────
    {
      id: 'an-office-that-does-not-exist',
      volume: 'card',
      band: 'court',
      weight: 4,
      quiet: 5,
      when: (ctx) => {
        const hero = ctx.hero();
        const king = ctx.state.heroes.find((candidate) => candidate.id === 'king');
        return Boolean(hero) && ctx.recall('wonUnderHim') >= 2
          && hero!.stats.renown > (king?.stats.renown ?? 75);
      },
      salience: () => 5,
      tone: 'info',
      options: [
        {
          id: 'invent-it',
          apply: (ctx) => {
            ctx.remember('trusted', 1);
            const hero = ctx.hero();
            if (hero) hero.stats.loyalty = Math.min(100, hero.stats.loyalty + 18);
            for (const land of playerLands(ctx.state)) {
              land.loyalty = Math.min(100, land.loyalty + 4);
            }
            ctx.heat(-3);
          },
        },
        {
          id: 'refuse',
          apply: (ctx) => {
            ctx.bump('passedOver');
            const hero = ctx.hero();
            if (hero) hero.stats.loyalty = Math.max(0, hero.stats.loyalty - 12);
            ctx.heat(2.5);
          },
        },
        {
          id: 'one-province',
          apply: (ctx) => {
            ctx.remember('halfTrusted', 1);
            const land = ctx.land();
            if (land) land.loyalty = Math.min(100, land.loyalty + 10);
            ctx.heat(0.5);
          },
        },
      ],
    },

    // ── He asks ──────────────────────────────────────────────────────────────
    {
      id: 'he-asks',
      volume: 'card',
      band: 'court',
      weight: 4,
      quiet: 4,
      when: (ctx) => unposted(ctx.state, ctx.story.cast.heroId) && ctx.age >= 8,
      salience: (ctx) => 2 + ctx.age * 0.05,
      options: [
        {
          id: 'give-him-one',
          cost: { humans: 400, gold: 60 },
          apply: (ctx) => {
            ctx.remember('gaveHost', 1);
            ctx.remember('echoTurn', ctx.state.turn);
            const hero = ctx.hero();
            if (hero) {
              hero.stats.loyalty = Math.min(100, hero.stats.loyalty + 12);
              hero.stats.martial = Math.min(100, hero.stats.martial + 4);
            }
            ctx.heat(-2);
          },
        },
        {
          id: 'not-yet',
          apply: (ctx) => {
            ctx.bump('heHasAsked');
            // R1. There will be other seasons, and he counts them.
            const asked = ctx.hero();
            if (asked) asked.stats.loyalty = Math.max(0, asked.stats.loyalty - 5);
            ctx.heat(1.5);
          },
        },
        {
          id: 'herdsman-son',
          apply: (ctx) => {
            // Real court stability, and it writes the flag that opens four fragments.
            ctx.state.court.stability = Math.min(100, ctx.state.court.stability + 8);
            ctx.remember('humiliated', 1);
            ctx.bump('heHasAsked');
            const hero = ctx.hero();
            if (hero) hero.stats.loyalty = Math.max(0, hero.stats.loyalty - 20);
            ctx.heat(4);
          },
        },
      ],
    },
    {
      id: 'he-remembers-the-spring',
      volume: 'whisper',
      weight: 3,
      // Echo: quotes a specific thing the player did, by year. This is the cheapest defence
      // against a salience pool reading as random noise — the player sees the game citing them.
      when: (ctx) => ctx.recall('gaveHost') === 1 && ctx.recall('echoTurn') > 0,
      quiet: 10,
      salience: (ctx) => (ctx.world.wonBattle ? 5 : 1),
      tone: 'info',
    },
    {
      id: 'he-asks-again',
      volume: 'card',
      band: 'court',
      weight: 4,
      quiet: 6,
      when: (ctx) => unposted(ctx.state, ctx.story.cast.heroId) && ctx.recall('heHasAsked') >= 1,
      salience: (ctx) => 3 + ctx.recall('passedOver') * 2 + (ctx.world.lostLand ? 3 : 0),
      options: [
        {
          id: 'give-him-one',
          cost: { humans: 400, gold: 60 },
          apply: (ctx) => {
            ctx.remember('gaveHost', 1);
            ctx.remember('echoTurn', ctx.state.turn);
            const hero = ctx.hero();
            if (hero) hero.stats.loyalty = Math.min(100, hero.stats.loyalty + 8);
            ctx.heat(-1.5);
          },
        },
        {
          id: 'not-yet',
          apply: (ctx) => {
            ctx.bump('heHasAsked');
            ctx.bump('coldness');
            // R1, and harder the second time: asking twice and being refused twice is a thing
            // his own province hears about.
            const twice = ctx.hero();
            if (twice) twice.stats.loyalty = Math.max(0, twice.stats.loyalty - 12);
            const home = ctx.land();
            if (home) home.loyalty = Math.max(0, home.loyalty - 6);
            ctx.heat(3);
          },
        },
      ],
    },

    // ── Being passed over ────────────────────────────────────────────────────
    {
      id: 'did-not-attend',
      volume: 'whisper',
      weight: 3,
      when: (ctx) => unposted(ctx.state, ctx.story.cast.heroId) && ctx.recall('heHasAsked') >= 1,
      salience: (ctx) => (ctx.world.seatEmptied ? 0 : 2) + ctx.recall('coldness') * 2,
      effect: (ctx) => { ctx.bump('passedOver'); },
      heat: 1.5,
      tone: 'info',
    },
    {
      id: 'drilling-elsewhere',
      volume: 'whisper',
      weight: 2,
      when: (ctx) => ctx.recall('passedOver') >= 1 && ctx.story.temperature >= 4,
      salience: (ctx) => ctx.story.temperature,
      heat: 1.5,
      tone: 'threat',
    },
    {
      id: 'no-tax-this-season',
      volume: 'whisper',
      weight: 2,
      when: (ctx) => ctx.story.temperature >= 6 && ctx.said('drilling-elsewhere'),
      salience: (ctx) => ctx.story.temperature,
      heat: 2,
      tone: 'threat',
      effect: (ctx) => {
        const land = ctx.land();
        if (land) land.loyalty = Math.max(0, land.loyalty - 12);
      },
    },

    // ── The blow ─────────────────────────────────────────────────────────────
    {
      id: 'three-banners',
      volume: 'blow',
      band: 'crowd',
      weight: 8,
      terminal: true,
      tone: 'threat',
      // Two whispers have already run, and they are in the Chronicle. A story may never act
      // without having first spoken — that is the difference between surprise and unfairness.
      when: (ctx) => ctx.story.temperature >= 9
        && ctx.said('drilling-elsewhere')
        && ctx.said('no-tax-this-season')
        && looseLands(ctx.state).length >= 2,
      salience: (ctx) => ctx.story.temperature * 2,
      effect: (ctx) => {
        const rebel = ctx.state.kingdoms.find((kingdom) => kingdom.id !== PLAYER_KINGDOM_ID && !kingdom.isDefeated);
        const taken = looseLands(ctx.state).slice(0, 3);
        for (const land of taken) {
          // He keeps the walls, the granaries and the roads. That is the whole sting.
          land.ownerId = rebel?.id ?? land.ownerId;
          land.loyalty = 55;
        }
        const hero = ctx.hero();
        if (hero) {
          ctx.state.heroes = ctx.state.heroes.filter((candidate) => candidate.id !== hero.id);
          for (const seat of Object.keys(ctx.state.court.seats)) {
            const key = seat as keyof typeof ctx.state.court.seats;
            if (ctx.state.court.seats[key] === hero.id) ctx.state.court.seats[key] = undefined;
          }
        }
        pushToast(ctx.state, storyText('reed-banner.three-banners.toast', { hero: hero?.name ?? '' }), 'threat');
      },
    },

    // ── The quiet ending, which is not the ending ────────────────────────────
    {
      id: 'leave-to-visit-a-grave',
      volume: 'whisper',
      weight: 2,
      when: (ctx) => ctx.recall('lostUnderHim') >= 1 && ctx.recall('tookItBack') >= 1,
      salience: () => 4,
      effect: (ctx) => { ctx.remember('leaving', 1); },
    },
    {
      id: 'he-does-not-come-back',
      volume: 'whisper',
      weight: 3,
      terminal: true,
      tone: 'info',
      when: (ctx) => ctx.recall('leaving') === 1,
      salience: () => 8,
      effect: (ctx) => {
        const hero = ctx.hero();
        if (!hero) return;
        // No penalty, no message, no roll. He is simply off the roster — and the Chronicle
        // keeps his name, which is what lets a later story bring him back.
        ctx.state.heroes = ctx.state.heroes.filter((candidate) => candidate.id !== hero.id);
        ctx.state.heroDeck.push(hero);
        // Nothing happens now. It collects in a later run — see `a-commander-you-know`.
        ctx.leaveEcho(hero.name);
      },
    },

    /**
     * The cross-run collection.
     *
     * Fires only if some *earlier* run ended with a man walking away, and only once an enemy host
     * is actually on the map. He is not a generic invader: the game says his name, and it is a
     * name the player chose to let go of in a run they have probably stopped thinking about.
     */
    {
      id: 'a-commander-you-know',
      volume: 'blow',
      band: 'march',
      weight: 6,
      terminal: true,
      tone: 'threat',
      when: (ctx) => Boolean(ctx.echoOf('reed-banner', 'he-does-not-come-back'))
        && ctx.age >= 6
        && ctx.state.armies.some((army) => army.kingdomId !== PLAYER_KINGDOM_ID),
      salience: () => 7,
      effect: (ctx) => {
        const name = ctx.echoOf('reed-banner', 'he-does-not-come-back') ?? '';
        ctx.remember('returnedName', 1);
        // He is better than he was, and he knows which province is thinnest.
        const host = ctx.state.armies
          .filter((army) => army.kingdomId !== PLAYER_KINGDOM_ID)
          .sort((a, b) => (b.units.spearmen + b.units.archers) - (a.units.spearmen + a.units.archers))[0];
        if (host) {
          host.name = name || host.name;
          host.morale = Math.min(100, host.morale + 20);
          host.level += 1;
          host.units.spearmen = Math.round(host.units.spearmen * 1.2);
        }
        const weakest = playerLands(ctx.state).sort((a, b) => a.defense - b.defense)[0];
        if (weakest) weakest.loyalty = Math.max(0, weakest.loyalty - 10);
      },
    },

    // ── Losing under him ─────────────────────────────────────────────────────
    {
      id: 'four-hundred-men',
      volume: 'card',
      band: 'march',
      weight: 3,
      quiet: 3,
      when: (ctx) => commanding(ctx.state, ctx.story.cast.heroId) && ctx.world.lostLand,
      salience: () => 6,
      options: [
        {
          id: 'take-it-back',
          apply: (ctx) => {
            ctx.bump('lostUnderHim');
            ctx.bump('tookItBack');
            for (const army of ctx.state.armies) {
              if (army.generalHeroId === ctx.story.cast.heroId) army.generalHeroId = undefined;
            }
            const hero = ctx.hero();
            if (hero) hero.stats.loyalty = Math.max(0, hero.stats.loyalty - 14);
            ctx.heat(2);
          },
        },
        {
          id: 'leave-it-with-him',
          apply: (ctx) => {
            ctx.bump('lostUnderHim');
            const hero = ctx.hero();
            if (hero) {
              hero.stats.loyalty = Math.min(100, hero.stats.loyalty + 16);
              hero.stats.martial = Math.min(100, hero.stats.martial + 3);
            }
            ctx.heat(-2);
          },
        },
        {
          id: 'ask-him-what-happened',
          apply: (ctx) => {
            ctx.bump('lostUnderHim');
            ctx.remember('listened', 1);
            const hero = ctx.hero();
            if (hero) hero.stats.loyalty = Math.min(100, hero.stats.loyalty + 8);
          },
        },
      ],
    },

    // ── The opening: an offer sitting where the player already is ────────────
    {
      id: 'his-men-would-build-it',
      volume: 'card',
      weight: 3,
      quiet: 4,
      repeatable: true,
      maxTimes: 3,
      when: (ctx) => Boolean(ctx.land()) && ctx.recall('builtForHim') < 3 && ctx.age >= 10,
      salience: (ctx) => (ctx.recall('trusted') ? 3 : 1),
      opening: { on: 'land', actionKey: 'letThemBuild' },
      options: [
        {
          id: 'let-them',
          apply: (ctx) => {
            ctx.bump('builtForHim');
            const land = ctx.land();
            if (land) {
              land.defense += 6;
              land.loyalty = Math.min(100, land.loyalty + 12);
              ctx.note('landDefense', 6, land.name);
            }
            const hero = ctx.hero();
            if (hero) {
              hero.stats.loyalty = Math.min(100, hero.stats.loyalty + 10);
              ctx.note('loyalty', 10, hero.name);
            }
            ctx.heat(-2);
          },
        },
      ],
    },

    // ── Terminals: the good ones ─────────────────────────────────────────────
    {
      id: 'dai-co-viet',
      volume: 'card',
      band: 'shrine',
      weight: 6,
      terminal: true,
      tone: 'reward',
      quiet: 6,
      when: (ctx) => ctx.recall('trusted') === 1 && ctx.recall('wonUnderHim') >= 3,
      salience: () => 9,
      options: [
        {
          id: 'accept',
          apply: (ctx) => {
            for (const land of playerLands(ctx.state)) {
              land.loyalty = Math.max(land.loyalty, 78);
            }
            const hero = ctx.hero();
            if (hero) {
              hero.stats.loyalty = 100;
              hero.stats.renown = Math.min(100, hero.stats.renown + 12);
              hero.traits = [...(hero.traits ?? []), 'Unifier'];
            }
            applyResourceDelta(ctx.state, { gold: 220, humans: 400 });
          },
        },
      ],
    },
    {
      id: 'the-loyal-death',
      volume: 'blow',
      band: 'fire',
      weight: 3,
      terminal: true,
      tone: 'threat',
      when: (ctx) => commanding(ctx.state, ctx.story.cast.heroId)
        && ctx.recall('wonUnderHim') >= 2
        && ctx.world.lostLand
        && ctx.recall('trusted') === 1,
      salience: () => 4,
      effect: (ctx) => {
        const hero = ctx.hero();
        if (!hero) return;
        ctx.state.heroes = ctx.state.heroes.filter((candidate) => candidate.id !== hero.id);
        // The province he died holding never falls below this again.
        const land = ctx.land();
        if (land) land.loyalty = Math.max(land.loyalty, 85);
        for (const other of ctx.state.heroes) {
          other.stats.loyalty = Math.min(100, other.stats.loyalty + 8);
        }
      },
    },

    // ── Cooling: the story can simply stop being interesting ─────────────────
    {
      id: 'nothing-came-of-it',
      volume: 'whisper',
      weight: 1,
      terminal: true,
      tone: 'info',
      when: (ctx) => ctx.age >= 70 && ctx.story.temperature < 2,
      salience: (ctx) => (ctx.age - 70) * 0.2,
    },
  ],
};
