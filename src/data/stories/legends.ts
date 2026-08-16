import { PLAYER_KINGDOM_ID } from '../../game/constants';
import { livingRivals, pick, playerLands } from '../../systems/story/StorySystem';
import {
  announce,
  captureHero,
  debt,
  disperseIncoming,
  freeBuilding,
  grantDraft,
  grantEdictPoints,
  grantHost,
  grantPowerCard,
  grantStoryHero,
  joinBloodlessly,
  killEnemyGeneral,
  killHero,
  loyaltyFloor,
  ourHosts,
  population,
  raze,
  reinforceHosts,
  revolt,
  shiftWaveClock,
  spoilGranary,
  spoilRations,
  standing,
  stipend,
  temper,
  terrainWork,
  tiltDraft,
  windfall,
  withholdTax,
} from '../../systems/story/effects';
import { storyText } from '../../i18n/story';
import type { StoryTemplate } from '../../systems/story/types';

/**
 * The third batch: the legends, and the parts of the world that had no story attached to them
 * yet — plague, flood, a road nobody is watching, a hero taken alive.
 *
 * Written with a deliberately high proportion of whispers. The design's pacing claim is that
 * roughly seven in ten fragments cost nothing, and the first two batches came in under that
 * because almost every fragment worth writing wanted to be a card. Ambient lines are what make a
 * realm feel inhabited between the decisions, and they are the cheapest thing in the file.
 */

// ── Quang Trung, Tết 1789 ───────────────────────────────────────────────────

/**
 * Năm Ngày — Five Days.
 *
 * Crowned himself, marched a hundred thousand men north in five corps, and broke the Qing across
 * five days of the new year.
 *
 * The **only** story permitted to be urgent. Everywhere else in the Chronicle time is a phrase
 * rather than a number, because a number invites optimisation; here the clock *is* the drama, so
 * it gets the one exemption and says exactly how long is left.
 */
export const fiveDays: StoryTemplate = {
  id: 'five-days',
  seedWeight: 2,
  minTurn: 30,
  seed: (state) => {
    const ascent = state.ascent;
    if (!ascent || ascent.wavesSurvived < 3) return undefined;
    const rival = pick(livingRivals(state).sort((a, b) => (b.power ?? 50) - (a.power ?? 50)).slice(0, 2));
    const capital = state.lands.find((land) => land.id === ascent.capitalLandId);
    if (!rival || !capital) return undefined;
    return { kingdomId: rival.id, landId: capital.id };
  },

  fragments: [
    {
      id: 'they-are-keeping-the-new-year',
      volume: 'whisper',
      weight: 5,
      quiet: 2,
      salience: (ctx) => (ctx.age >= 2 ? 5 : -20),
      heat: 2,
    },
    {
      id: 'nobody-marches-at-tet',
      volume: 'whisper',
      weight: 4,
      quiet: 5,
      when: (ctx) => ctx.said('they-are-keeping-the-new-year'),
      heat: 2,
    },
    {
      id: 'crown-yourself-and-go',
      volume: 'card',
      band: 'march',
      weight: 8,
      quiet: 3,
      when: (ctx) => ctx.said('nobody-marches-at-tet'),
      salience: () => 9,
      options: [
        {
          id: 'march-tonight',
          cost: { food: 300, gold: 200 },
          apply: (ctx) => {
            ctx.remember('marching', 1);
            ctx.remember('echoTurn', ctx.state.turn);
            const host = grantHost(ctx, 900);
            if (host) host.morale = 100;
            // The one place a number is allowed: five seasons, and it says so.
            shiftWaveClock(ctx, -4);
          },
        },
        {
          id: 'after-the-festival',
          apply: (ctx) => {
            ctx.remember('waited', 1);
            ctx.heat(-4);
          },
        },
      ],
    },
    {
      id: 'the-men-are-carried-in-hammocks',
      volume: 'whisper',
      weight: 5,
      quiet: 1,
      tone: 'info',
      when: (ctx) => ctx.recall('marching') === 1,
      salience: () => 7,
      effect: (ctx) => { ctx.bump('leagues'); },
    },
    {
      id: 'they-do-not-stop-to-cook',
      volume: 'whisper',
      weight: 4,
      quiet: 1,
      tone: 'info',
      when: (ctx) => ctx.recall('marching') === 1 && ctx.recall('leagues') >= 1,
      salience: () => 6,
      effect: (ctx) => {
        ctx.bump('leagues');
        spoilRations(ctx);
      },
    },
    {
      id: 'ngoc-hoi',
      volume: 'blow',
      band: 'fire',
      weight: 9,
      terminal: true,
      tone: 'reward',
      when: (ctx) => ctx.recall('marching') === 1 && ctx.recall('leagues') >= 2,
      salience: () => 13,
      effect: (ctx) => {
        const scattered = disperseIncoming(ctx, 0.7);
        killEnemyGeneral(ctx);
        reinforceHosts(ctx, 400);
        grantPowerCard(ctx, 'bronze-drums');
        announce(ctx, storyText('five-days.ngoc-hoi.toast', { count: scattered }), 'reward');
      },
    },
    {
      id: 'the-festival-passes',
      volume: 'whisper',
      weight: 3,
      terminal: true,
      tone: 'info',
      when: (ctx) => ctx.recall('waited') === 1,
      quiet: 5,
      effect: (ctx) => { shiftWaveClock(ctx, -2); },
    },
  ],
};

// ── Trần Bình Trọng, 1285 ───────────────────────────────────────────────────

/**
 * Làm Quỷ Nước Nam — A Ghost in the South.
 *
 * Captured and offered a princedom in the north, he answered that he would rather be a ghost in
 * the South than a king in the North.
 *
 * Three branches with genuinely different shapes: ransom him and the enemy learns exactly how
 * deep your treasury is; storm the camp and risk the host; leave him and he dies well, and every
 * hero you have left is harder to lose afterwards.
 */
export const ghostInTheSouth: StoryTemplate = {
  id: 'ghost-south',
  seedWeight: 3,
  minTurn: 20,
  seed: (state) => {
    const hero = pick(state.heroes.filter(
      (candidate) => candidate.id !== 'king' && candidate.stats.loyalty >= 45,
    ));
    return hero ? { heroId: hero.id } : undefined;
  },

  fragments: [
    {
      id: 'he-did-not-come-back-with-the-scouts',
      volume: 'whisper',
      weight: 5,
      quiet: 2,
      tone: 'threat',
      when: (ctx) => Boolean(ctx.hero()),
      salience: (ctx) => (ctx.world.lostLand || ctx.age >= 4 ? 6 : -10),
      effect: (ctx) => {
        captureHero(ctx);
        ctx.remember('taken', 1);
      },
      heat: 3,
    },
    {
      id: 'they-have-offered-him-a-title',
      volume: 'whisper',
      weight: 4,
      quiet: 4,
      tone: 'info',
      when: (ctx) => ctx.recall('taken') === 1,
      heat: 2,
    },
    {
      id: 'what-is-he-worth',
      volume: 'card',
      band: 'border',
      weight: 7,
      quiet: 3,
      when: (ctx) => ctx.recall('taken') === 1 && ctx.said('they-have-offered-him-a-title'),
      salience: () => 8,
      options: [
        {
          id: 'pay-the-ransom',
          cost: { gold: 280 },
          apply: (ctx) => {
            const hero = ctx.hero();
            if (hero) hero.traits = (hero.traits ?? []).filter((trait) => trait !== 'Captive');
            temper(ctx, 'loyalty', 20);
            // They counted the coin on the way out, and now they know the number.
            debt(ctx, 6, 14);
            ctx.remember('ransomed', 1);
          },
        },
        {
          id: 'storm-the-camp',
          enabled: (ctx) => ourHosts(ctx).length > 0,
          blockedKey: 'noHost',
          apply: (ctx) => {
            const host = ourHosts(ctx)[0];
            const won = Math.random() < 0.55;
            if (host) {
              host.units.spearmen = Math.floor(host.units.spearmen * (won ? 0.75 : 0.4));
              host.units.archers = Math.floor(host.units.archers * (won ? 0.75 : 0.4));
              host.morale = Math.max(15, host.morale - (won ? 10 : 35));
            }
            if (won) {
              const hero = ctx.hero();
              if (hero) {
                hero.traits = (hero.traits ?? []).filter((trait) => trait !== 'Captive');
                hero.stats.loyalty = 100;
              }
              ctx.remember('rescued', 1);
            } else {
              ctx.remember('failedRescue', 1);
            }
          },
        },
        {
          id: 'leave-him',
          apply: (ctx) => { ctx.remember('left', 1); },
        },
      ],
    },
    {
      id: 'rather-a-ghost-in-the-south',
      volume: 'blow',
      band: 'night',
      weight: 9,
      terminal: true,
      tone: 'threat',
      when: (ctx) => ctx.recall('left') === 1 || ctx.recall('failedRescue') === 1,
      salience: () => 11,
      effect: (ctx) => {
        const fallen = killHero(ctx);
        // He said it where their whole camp could hear, and it travelled.
        for (const hero of ctx.state.heroes) {
          hero.stats.loyalty = Math.min(100, hero.stats.loyalty + 18);
        }
        loyaltyFloor(ctx, 70);
        standing(ctx, 5);
        if (fallen) announce(ctx, storyText('ghost-south.rather-a-ghost-in-the-south.toast', { hero: fallen.name }), 'threat');
      },
    },
    {
      id: 'he-comes-back-thinner',
      volume: 'whisper',
      weight: 5,
      terminal: true,
      tone: 'reward',
      when: (ctx) => ctx.recall('ransomed') === 1 || ctx.recall('rescued') === 1,
      quiet: 4,
      effect: (ctx) => { temper(ctx, 'martial', 6); },
    },
  ],
};

// ── Nguyễn Trãi, 1427 ───────────────────────────────────────────────────────

/**
 * Bình Ngô Đại Cáo — Victory Without Slaughter.
 *
 * The Ming garrison was beaten by letters as much as by siege, and Wang Tong was allowed an
 * orderly withdrawal under oath.
 *
 * An alternative win branch: spend diplomacy and standing instead of soldiers, take the province
 * intact and at full population, and gain with every *other* rival who was watching.
 */
export const withoutSlaughter: StoryTemplate = {
  id: 'without-slaughter',
  seedWeight: 3,
  minTurn: 18,
  seed: (state) => {
    const scholar = pick(state.heroes.filter(
      (hero) => hero.id !== 'king' && hero.stats.diplomacy >= 45,
    ));
    const rival = pick(livingRivals(state));
    if (!scholar || !rival) return undefined;
    return { heroId: scholar.id, kingdomId: rival.id };
  },

  fragments: [
    {
      id: 'he-writes-letters-instead-of-orders',
      volume: 'whisper',
      weight: 5,
      quiet: 2,
      when: (ctx) => Boolean(ctx.hero()),
      salience: (ctx) => (ctx.age >= 2 ? 5 : -20),
    },
    {
      id: 'the-garrison-has-written-back',
      volume: 'whisper',
      weight: 4,
      quiet: 5,
      when: (ctx) => ctx.said('he-writes-letters-instead-of-orders') && Boolean(ctx.hero()),
      heat: 2,
    },
    {
      id: 'an-orderly-withdrawal',
      volume: 'card',
      band: 'border',
      weight: 7,
      quiet: 4,
      when: (ctx) => ctx.said('the-garrison-has-written-back'),
      salience: () => 7,
      options: [
        {
          id: 'let-them-go',
          apply: (ctx) => {
            const taken = joinBloodlessly(ctx);
            if (taken) {
              // Intact: nobody burned anything, so it arrives worth having.
              taken.loyalty = Math.max(taken.loyalty, 80);
              freeBuilding(ctx, 'communalHall', taken);
            }
            standing(ctx, 10);
            grantEdictPoints(ctx, 1);
            ctx.remember('spared', 1);
            temper(ctx, 'renown', 10);
          },
        },
        {
          id: 'no-terms',
          apply: (ctx) => {
            const taken = joinBloodlessly(ctx);
            if (taken) raze(ctx, taken);
            standing(ctx, -12);
            ctx.remember('stormed', 1);
          },
        },
      ],
    },
    {
      id: 'the-proclamation',
      volume: 'card',
      band: 'shrine',
      weight: 7,
      quiet: 6,
      tone: 'reward',
      terminal: true,
      when: (ctx) => ctx.recall('spared') === 1,
      salience: () => 8,
      options: [
        {
          id: 'have-it-read-everywhere',
          apply: (ctx) => {
            loyaltyFloor(ctx, 75);
            grantPowerCard(ctx, 'village-muster');
            temper(ctx, 'administration', 8);
          },
        },
        {
          id: 'a-quieter-notice',
          apply: (ctx) => {
            standing(ctx, 4);
            grantEdictPoints(ctx, 1);
          },
        },
      ],
    },
    {
      id: 'the-word-travels-badly',
      volume: 'whisper',
      weight: 4,
      terminal: true,
      tone: 'threat',
      when: (ctx) => ctx.recall('stormed') === 1,
      quiet: 5,
      effect: (ctx) => { standing(ctx, -6); },
    },
  ],
};

// ── Fabius Maximus, 217 BC ──────────────────────────────────────────────────

/**
 * Kẻ Trì Hoãn — The Delayer.
 *
 * A year of refusing battle while Italy burned, and the nickname was an insult.
 *
 * The one story that reads **inaction** as the input. Correct and unpopular at the same time:
 * every season you decline to march, the court likes you less and the enemy wears thinner.
 */
export const theDelayer: StoryTemplate = {
  id: 'delayer',
  seedWeight: 2,
  minTurn: 26,
  seed: (state) => {
    const ascent = state.ascent;
    if (!ascent || ascent.threat <= ascent.defensePower) return undefined;
    const rival = pick(livingRivals(state));
    return rival ? { kingdomId: rival.id } : undefined;
  },

  fragments: [
    {
      id: 'do-not-give-them-a-battle',
      volume: 'card',
      band: 'mountain',
      weight: 7,
      quiet: 2,
      salience: (ctx) => (ctx.age >= 2 ? 7 : -20),
      options: [
        {
          id: 'refuse-battle',
          apply: (ctx) => {
            ctx.remember('delaying', 1);
            ctx.remember('echoTurn', ctx.state.turn);
          },
        },
        {
          id: 'meet-them-in-the-field',
          apply: (ctx) => {
            ctx.remember('gaveBattle', 1);
            reinforceHosts(ctx, 200);
          },
        },
      ],
    },
    {
      id: 'they-are-calling-you-the-delayer',
      volume: 'whisper',
      weight: 5,
      repeatable: true,
      quiet: 6,
      tone: 'threat',
      when: (ctx) => ctx.recall('delaying') === 1 && ctx.recall('seasonsDelayed') < 4,
      effect: (ctx) => {
        ctx.bump('seasonsDelayed');
        ctx.state.court.stability = Math.max(0, ctx.state.court.stability - 5);
        withholdTax(ctx, 4);
      },
    },
    {
      id: 'their-supply-is-thinner-than-ours',
      volume: 'whisper',
      weight: 4,
      quiet: 7,
      tone: 'info',
      when: (ctx) => ctx.recall('seasonsDelayed') >= 2,
      effect: (ctx) => { ctx.bump('seasonsDelayed'); },
    },
    {
      id: 'the-delayer-was-right',
      volume: 'blow',
      band: 'field',
      weight: 8,
      terminal: true,
      tone: 'reward',
      when: (ctx) => ctx.recall('seasonsDelayed') >= 4,
      salience: () => 11,
      effect: (ctx) => {
        const gone = disperseIncoming(ctx, 0.85);
        loyaltyFloor(ctx, 70);
        ctx.state.court.stability = Math.min(100, ctx.state.court.stability + 25);
        grantPowerCard(ctx, 'mountain-pass');
        announce(ctx, storyText('delayer.the-delayer-was-right.toast', { count: gone }), 'reward');
      },
    },
    {
      id: 'the-field-was-the-wrong-place',
      volume: 'whisper',
      weight: 4,
      terminal: true,
      tone: 'threat',
      when: (ctx) => ctx.recall('gaveBattle') === 1,
      quiet: 5,
      effect: (ctx) => {
        for (const army of ourHosts(ctx)) army.morale = Math.max(15, army.morale - 20);
      },
    },
  ],
};

// ── The plague ──────────────────────────────────────────────────────────────

/**
 * Dịch — The Sickness.
 *
 * No villain, no decision that caused it, and no way to be clever about it. Some stories should
 * simply be weather, so that the ones with an author behind them read differently.
 */
export const theSickness: StoryTemplate = {
  id: 'sickness',
  seedWeight: 2,
  minTurn: 22,
  seed: (state) => {
    const dense = playerLands(state).sort((a, b) => b.population - a.population)[0];
    return dense ? { landId: dense.id } : undefined;
  },

  fragments: [
    {
      id: 'a-fever-in-the-market',
      volume: 'whisper',
      weight: 5,
      quiet: 2,
      tone: 'threat',
      salience: (ctx) => (ctx.age >= 2 ? 5 : -20),
      heat: 2,
    },
    {
      id: 'the-market-is-closed',
      volume: 'whisper',
      weight: 4,
      quiet: 4,
      tone: 'threat',
      when: (ctx) => ctx.said('a-fever-in-the-market'),
      heat: 2,
      effect: (ctx) => { population(ctx, 0.96, ctx.land()); },
    },
    {
      id: 'shut-the-gates',
      volume: 'card',
      band: 'granary',
      weight: 7,
      quiet: 3,
      when: (ctx) => ctx.said('the-market-is-closed'),
      salience: (ctx) => 4 + ctx.story.temperature,
      options: [
        {
          id: 'shut-them',
          apply: (ctx) => {
            // Contains it, and the province pays for the containment.
            const land = ctx.land();
            if (land) {
              land.loyalty = Math.max(0, land.loyalty - 20);
              population(ctx, 0.92, land);
            }
            ctx.remember('contained', 1);
            ctx.heat(-8);
          },
        },
        {
          id: 'send-physicians',
          cost: { gold: 200, supplies: 80 },
          apply: (ctx) => {
            ctx.remember('treated', 1);
            ctx.heat(-6);
          },
        },
        {
          id: 'it-will-burn-itself-out',
          apply: (ctx) => {
            ctx.remember('ignored', 1);
            ctx.heat(4);
          },
        },
      ],
    },
    {
      id: 'it-is-in-the-army-now',
      volume: 'blow',
      band: 'night',
      weight: 8,
      terminal: true,
      tone: 'threat',
      when: (ctx) => ctx.recall('ignored') === 1 && ctx.story.temperature >= 7,
      salience: () => 11,
      effect: (ctx) => {
        population(ctx, 0.82);
        spoilGranary(ctx, 0.3);
        for (const army of ourHosts(ctx)) {
          army.units.spearmen = Math.floor(army.units.spearmen * 0.8);
          army.morale = Math.max(10, army.morale - 25);
        }
      },
    },
    {
      id: 'it-passes',
      volume: 'whisper',
      weight: 4,
      terminal: true,
      tone: 'info',
      when: (ctx) => ctx.recall('contained') === 1 || ctx.recall('treated') === 1,
      quiet: 6,
      effect: (ctx) => {
        if (ctx.recall('treated') === 1) loyaltyFloor(ctx, 66);
      },
    },
  ],
};

// ── Sơn Tinh and Thủy Tinh ──────────────────────────────────────────────────

/**
 * Sơn Tinh Thủy Tinh — The Mountain and the Water.
 *
 * The water spirit lost the contest and comes back every year to try again. The one story with a
 * genuinely permanent physical outcome: a dyke changes what the land *is*, and survives every
 * later change of focus.
 */
export const mountainAndWater: StoryTemplate = {
  id: 'mountain-water',
  seedWeight: 3,
  minTurn: 12,
  seed: (state) => {
    const low = pick(playerLands(state).filter((land) => (land.terrainSummary?.water ?? 0) > 0))
      ?? pick(playerLands(state));
    return low ? { landId: low.id } : undefined;
  },

  fragments: [
    {
      id: 'the-water-comes-up-every-year',
      volume: 'whisper',
      weight: 5,
      quiet: 2,
      salience: (ctx) => (ctx.age >= 2 ? 5 : -20),
      heat: 1.5,
    },
    {
      id: 'higher-than-last-year',
      volume: 'whisper',
      weight: 4,
      repeatable: true,
      quiet: 9,
      tone: 'threat',
      when: (ctx) => ctx.said('the-water-comes-up-every-year') && ctx.recall('dyke') === 0,
      heat: 2,
      effect: (ctx) => { ctx.bump('floods'); },
    },
    {
      id: 'raise-the-dyke',
      volume: 'card',
      weight: 6,
      quiet: 4,
      when: (ctx) => ctx.said('the-water-comes-up-every-year') && ctx.recall('dyke') === 0,
      salience: (ctx) => 3 + ctx.recall('floods') * 2,
      opening: { on: 'land', actionKey: 'raiseTheDyke' },
      options: [
        {
          id: 'raise-it',
          cost: { supplies: 160, humans: 200 },
          apply: (ctx) => {
            ctx.remember('dyke', 1);
            ctx.remember('echoTurn', ctx.state.turn);
            terrainWork(ctx, { defense: 6, food: 3 });
            ctx.heat(-10);
          },
        },
      ],
    },
    {
      id: 'the-dyke-holds',
      volume: 'whisper',
      weight: 4,
      repeatable: true,
      tone: 'reward',
      quiet: 14,
      when: (ctx) => ctx.recall('dyke') === 1,
      effect: (ctx) => { windfall(ctx, { food: 30 }); },
    },
    {
      id: 'the-year-it-does-not-hold',
      volume: 'blow',
      band: 'river',
      weight: 8,
      terminal: true,
      tone: 'threat',
      when: (ctx) => ctx.recall('dyke') === 0 && ctx.recall('floods') >= 3,
      salience: () => 11,
      effect: (ctx) => {
        const land = ctx.land();
        if (land) {
          raze(ctx, land);
          population(ctx, 0.8, land);
        }
        spoilGranary(ctx, 0.4);
      },
    },
    {
      id: 'nothing-came-up-that-year',
      volume: 'whisper',
      weight: 2,
      terminal: true,
      tone: 'info',
      when: (ctx) => ctx.recall('dyke') === 1 && ctx.age >= 60,
    },
  ],
};

// ── Thánh Gióng ─────────────────────────────────────────────────────────────

/**
 * Thánh Gióng — The Boy Who Would Not Speak.
 *
 * He said nothing for three years, then asked for an iron horse and grew until his armour split.
 *
 * The one wholly mythic story in the set, and the only one that hands over a hero who cannot be
 * drafted at all. Its ending is deliberately not a reward you keep: he rides up the mountain and
 * does not come back, and what he leaves behind is a rule rather than a person.
 */
export const thanhGiong: StoryTemplate = {
  id: 'thanh-giong',
  seedWeight: 2,
  minTurn: 24,
  seed: (state) => {
    const ascent = state.ascent;
    if (!ascent || ascent.threat <= ascent.defensePower * 1.1) return undefined;
    const village = pick(playerLands(state).filter((land) => land.hasVillage));
    return village ? { landId: village.id } : undefined;
  },

  fragments: [
    {
      id: 'a-child-who-has-never-spoken',
      volume: 'whisper',
      weight: 5,
      quiet: 2,
      salience: (ctx) => (ctx.age >= 2 ? 5 : -20),
    },
    {
      id: 'he-asked-for-an-iron-horse',
      volume: 'card',
      band: 'shrine',
      weight: 7,
      quiet: 4,
      when: (ctx) => ctx.said('a-child-who-has-never-spoken'),
      salience: () => 8,
      options: [
        {
          id: 'make-it',
          cost: { supplies: 220, gold: 180 },
          apply: (ctx) => {
            ctx.remember('forged', 1);
            ctx.remember('echoTurn', ctx.state.turn);
          },
        },
        {
          id: 'a-child-is-a-child',
          apply: (ctx) => { ctx.remember('refused', 1); },
        },
      ],
    },
    {
      id: 'he-eats-everything-the-village-has',
      volume: 'whisper',
      weight: 5,
      quiet: 3,
      when: (ctx) => ctx.recall('forged') === 1 && ctx.recall('grown') < 2,
      effect: (ctx) => {
        ctx.bump('grown');
        windfall(ctx, { food: -60 });
      },
    },
    {
      id: 'his-armour-splits',
      volume: 'whisper',
      weight: 5,
      quiet: 3,
      tone: 'reward',
      when: (ctx) => ctx.recall('grown') >= 1,
      effect: (ctx) => { ctx.bump('grown'); },
    },
    {
      id: 'he-rides',
      volume: 'blow',
      band: 'fire',
      weight: 9,
      terminal: true,
      tone: 'reward',
      when: (ctx) => ctx.recall('grown') >= 2,
      salience: () => 12,
      effect: (ctx) => {
        const scattered = disperseIncoming(ctx, 0.9);
        // He does not come back, and what is left is a rule rather than a man.
        grantPowerCard(ctx, 'village-muster');
        tiltDraft(ctx, 'gold', 0.4);
        loyaltyFloor(ctx, 78);
        announce(ctx, storyText('thanh-giong.he-rides.toast', { count: scattered }), 'reward');
      },
    },
    {
      id: 'the-village-forgets-him',
      volume: 'whisper',
      weight: 3,
      terminal: true,
      tone: 'info',
      when: (ctx) => ctx.recall('refused') === 1,
      quiet: 6,
    },
  ],
};

// ── The salt road ───────────────────────────────────────────────────────────

/**
 * Đường Muối — The Salt Road.
 *
 * "Salt has not come up the coast road since spring. Nobody has said why, and nobody has gone to
 * look." It is either bandits or an army, and the only way to learn which is to go.
 */
export const saltRoad: StoryTemplate = {
  id: 'salt-road',
  seedWeight: 3,
  minTurn: 14,
  seed: (state) => {
    const border = pick(playerLands(state).filter(
      (land) => land.neighbors.some((id) => {
        const other = state.lands.find((candidate) => candidate.id === id);
        return other && other.ownerId !== PLAYER_KINGDOM_ID;
      }),
    )) ?? pick(playerLands(state));
    return border ? { landId: border.id } : undefined;
  },

  fragments: [
    {
      id: 'no-salt-since-spring',
      volume: 'whisper',
      weight: 5,
      quiet: 2,
      salience: (ctx) => (ctx.age >= 2 ? 5 : -20),
      heat: 2,
    },
    {
      id: 'nobody-has-gone-to-look',
      volume: 'whisper',
      weight: 4,
      quiet: 5,
      when: (ctx) => ctx.said('no-salt-since-spring'),
      heat: 2.5,
    },
    {
      id: 'send-someone-up-the-road',
      volume: 'card',
      band: 'coast',
      weight: 6,
      quiet: 3,
      when: (ctx) => ctx.said('nobody-has-gone-to-look'),
      salience: (ctx) => 3 + ctx.story.temperature,
      opening: { on: 'land', actionKey: 'sendSomeone' },
      options: [
        {
          id: 'send-someone',
          cost: { gold: 60 },
          apply: (ctx) => {
            // Bandits most of the time. An army the rest, and that is worth knowing early.
            if (Math.random() < 0.65) {
              ctx.remember('bandits', 1);
              windfall(ctx, { supplies: 90 });
              const freed = grantStoryHero(ctx, { trait: 'Ransomed', loyalty: 82 });
              announce(ctx, storyText('salt-road.send-someone-up-the-road.bandits', { hero: freed.name }), 'reward');
            } else {
              ctx.remember('camp', 1);
              ctx.heat(4);
            }
          },
        },
      ],
    },
    {
      id: 'a-camp-nine-seasons-old',
      volume: 'blow',
      band: 'march',
      weight: 8,
      terminal: true,
      tone: 'threat',
      when: (ctx) => ctx.recall('camp') === 1,
      quiet: 2,
      salience: () => 10,
      effect: (ctx) => {
        // It has been building for as long as nobody looked.
        launchHostFromCamp(ctx);
      },
    },
    {
      id: 'the-road-runs-again',
      volume: 'whisper',
      weight: 4,
      terminal: true,
      tone: 'reward',
      when: (ctx) => ctx.recall('bandits') === 1,
      quiet: 5,
      effect: (ctx) => { stipend(ctx, { gold: 8 }, 22, 'Đường muối'); },
    },
    {
      id: 'the-road-is-still-shut',
      volume: 'blow',
      band: 'border',
      weight: 7,
      terminal: true,
      tone: 'threat',
      when: (ctx) => ctx.recall('bandits') === 0 && ctx.recall('camp') === 0 && ctx.age >= 30,
      salience: (ctx) => (ctx.age - 30) * 0.4,
      effect: (ctx) => {
        const land = ctx.land();
        if (land) withholdTax(ctx, 12, land);
        revolt(ctx, ctx.land());
      },
    },
  ],
};

/** A host that has been quietly assembling for as long as nobody went to look. */
function launchHostFromCamp(ctx: Parameters<NonNullable<StoryTemplate['fragments'][number]['effect']>>[0]): void {
  const rival = ctx.state.kingdoms.find((k) => k.id !== PLAYER_KINGDOM_ID && !k.isDefeated);
  const land = ctx.land();
  if (!rival || !land) return;
  ctx.state.armies.push({
    id: `salt-camp-${ctx.state.turn}`,
    kingdomId: rival.id,
    name: land.name,
    landId: land.neighbors[0] ?? land.id,
    units: { spearmen: 1100, archers: 480, heavyInfantry: 220 },
    morale: 92,
    supply: 80,
    rations: 420,
    provisions: 300,
    level: 2,
    experience: 0,
    experienceToNextLevel: 180,
  });
  announce(ctx, storyText('salt-road.a-camp-nine-seasons-old.toast', {}), 'threat');
}

// ── The second secession ────────────────────────────────────────────────────

/**
 * Sứ Quân Thứ Mười Ba — The Thirteenth Warlord.
 *
 * Seeds only in a realm that is already large and already thin: many provinces, low average
 * loyalty. Success is what summons it, and the way out is to *give something away* — which is
 * the one move a player who has been winning will not want to make.
 */
export const thirteenthWarlord: StoryTemplate = {
  id: 'thirteenth',
  seedWeight: 2,
  minTurn: 40,
  seed: (state) => {
    const lands = playerLands(state);
    if (lands.length < 7) return undefined;
    const avg = lands.reduce((sum, land) => sum + land.loyalty, 0) / lands.length;
    if (avg > 72) return undefined;
    const weakest = lands.sort((a, b) => a.loyalty - b.loyalty)[0];
    return { landId: weakest.id };
  },

  fragments: [
    {
      id: 'the-realm-is-wider-than-the-roads',
      volume: 'whisper',
      weight: 5,
      quiet: 2,
      heat: 2,
      salience: (ctx) => (ctx.age >= 2 ? 5 : -20),
    },
    {
      id: 'orders-take-a-season-to-arrive',
      volume: 'whisper',
      weight: 4,
      quiet: 6,
      when: (ctx) => ctx.said('the-realm-is-wider-than-the-roads'),
      heat: 2.5,
      tone: 'threat',
    },
    {
      id: 'they-have-stopped-waiting-for-them',
      volume: 'whisper',
      weight: 4,
      quiet: 6,
      when: (ctx) => ctx.said('orders-take-a-season-to-arrive'),
      heat: 3,
      tone: 'threat',
    },
    {
      id: 'give-them-a-governor-of-their-own',
      volume: 'card',
      band: 'court',
      weight: 7,
      quiet: 4,
      when: (ctx) => ctx.said('they-have-stopped-waiting-for-them'),
      salience: (ctx) => 4 + ctx.story.temperature,
      options: [
        {
          id: 'let-them-rule-themselves',
          apply: (ctx) => {
            // Give up the taxes and keep the province. The move a winning player hates.
            const land = ctx.land();
            if (land) {
              land.loyalty = Math.min(100, land.loyalty + 30);
              withholdTax(ctx, 30, land);
            }
            loyaltyFloor(ctx, 62);
            ctx.remember('devolved', 1);
            ctx.heat(-14);
          },
        },
        {
          id: 'send-a-garrison',
          cost: { humans: 400, gold: 140 },
          apply: (ctx) => {
            const land = ctx.land();
            if (land) land.defense += 14;
            ctx.remember('garrisoned', 1);
            ctx.heat(-4);
          },
        },
        {
          id: 'they-will-remember-who-rules',
          apply: (ctx) => {
            ctx.remember('hardLine', 1);
            const land = ctx.land();
            if (land) land.loyalty = Math.max(0, land.loyalty - 15);
            ctx.heat(5);
          },
        },
      ],
    },
    {
      id: 'the-thirteenth',
      volume: 'blow',
      band: 'crowd',
      weight: 9,
      terminal: true,
      tone: 'threat',
      when: (ctx) => ctx.story.temperature >= 10 && ctx.recall('devolved') === 0,
      salience: () => 14,
      effect: (ctx) => {
        const land = ctx.land();
        if (land) revolt(ctx, land);
        for (const neighbour of ctx.state.lands) {
          if (!land?.neighbors.includes(neighbour.id)) continue;
          if (neighbour.ownerId !== PLAYER_KINGDOM_ID) continue;
          neighbour.loyalty = Math.max(0, neighbour.loyalty - 25);
        }
        announce(ctx, storyText('thirteenth.the-thirteenth.toast', { land: land?.name ?? '' }), 'threat');
      },
    },
    {
      id: 'they-send-the-tax-anyway',
      volume: 'whisper',
      weight: 4,
      terminal: true,
      tone: 'reward',
      when: (ctx) => ctx.recall('devolved') === 1 && ctx.age >= 22,
      effect: (ctx) => { grantDraft(ctx, 1); },
    },
  ],
};
