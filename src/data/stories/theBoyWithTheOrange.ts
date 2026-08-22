import { PLAYER_KINGDOM_ID } from '../../game/constants';
import { applyResourceDelta } from '../../systems/ResourceSystem';
import { pick, playerLands } from '../../systems/story/StorySystem';
import { leaveEcho, reinforceHosts, temper } from '../../systems/story/effects';
import { generateHero } from '../heroFactory';
import type { StoryTemplate } from '../../systems/story/types';

/**
 * Quả Cam — The Boy With the Orange. Trần Quốc Toản, 1282–85.
 *
 * ## The annals record two things, and not a third
 *
 * That he was kept out of the war council at Bình Than for being too young and crushed the orange
 * in his fist without noticing; and that he raised a banner embroidered with six characters,
 * **Phá cường địch, báo hoàng ân** — destroy the strong foe, repay the imperial favour. They do
 * not clearly record how he died. The "fell at sixteen" is tradition.
 *
 * That gap is not a problem to paper over. It is the best argument this feature has for carrying
 * three source classes instead of two: his orange is `chinh-su`, his death is `da-su`, and his
 * survival is `ngoai-truyen` — inside one story.
 *
 * ## One card carries the whole design
 *
 * He is about fifteen, he is outside the hall, and he asks to fight.
 *
 * - **No** — send him home. That is what happened. He raises a thousand of his own household and
 *   fights beside you in a host **you do not command and cannot recall**. Two more decisions, two
 *   endings.
 * - **Yes** — let him in. That is not what happened, and the story does not care: `vao-hoi` opens
 *   with two further decisions and four endings of its own. You get a general history never gave
 *   you, and every beat from there is stamped ngoại truyện.
 *
 * Answering yes gets you *more* story, not less, which is the only way a player ever risks leaving
 * the record twice. Neither answer is marked on the card; the class appears afterwards.
 *
 * Pre-trunk fragment ids are preserved — a live save holds the id of the beat it last spoke.
 */
export const theBoyWithTheOrange: StoryTemplate = {
  id: 'orange',
  seedWeight: 3,
  minTurn: 14,

  regard: (ctx) => {
    if (ctx.recall('banner') === 1) return 'risen';
    if (ctx.recall('admitted') === 1) return 'seated';
    if (ctx.recall('refused') === 1) return 'dismissed';
    return undefined;
  },

  seed: (state) => {
    const ascent = state.ascent;
    if (!ascent) return undefined;
    // Bình Than was called because an invasion was coming. So is this.
    if (ascent.wavesSurvived < 1 && !ascent.bossTelegraphed) return undefined;
    const home = pick(playerLands(state));
    return home ? { landId: home.id } : undefined;
  },

  entry: 'binh-than',

  nodes: [
    { id: 'binh-than', historicity: 'chinh-su', patience: 5, onIgnored: 'qua-cam' },
    { id: 'qua-cam', historicity: 'chinh-su', patience: 5, onIgnored: 'la-co' },

    // The record: he is turned away and goes anyway.
    { id: 'la-co', historicity: 'chinh-su', patience: 6, onIgnored: 'co-rieng' },
    { id: 'chinh-quy', historicity: 'chinh-su', patience: 5, onIgnored: 'ham-tu' },
    { id: 'co-rieng', historicity: 'chinh-su', patience: 5, onIgnored: 'ham-tu' },
    { id: 'ham-tu', historicity: 'chinh-su', patience: 4, onIgnored: 'nga-xuong' },
    { id: 'nga-xuong', historicity: 'da-su', terminal: true },
    // Not terminal: he lives, and a life is not an ending. INV-10 caught this as a funnel —
    // one different answer must not mean one predetermined outcome.
    { id: 'song-sot', historicity: 'ngoai-truyen', patience: 6, onIgnored: 've-que' },
    { id: 'tran-bien', historicity: 'ngoai-truyen', terminal: true },
    { id: 've-que', historicity: 'ngoai-truyen', terminal: true },

    // The divergence: admitted at fifteen.
    { id: 'vao-hoi', historicity: 'ngoai-truyen', patience: 6, onIgnored: 'giu-ben-canh' },
    { id: 'giao-quan', historicity: 'ngoai-truyen', patience: 5, onIgnored: 'mat-o-tien-phong' },
    { id: 'tuong-tre', historicity: 'ngoai-truyen', terminal: true },
    { id: 'mat-o-tien-phong', historicity: 'ngoai-truyen', terminal: true },
    { id: 'giu-ben-canh', historicity: 'ngoai-truyen', patience: 5, onIgnored: 'bi-lang-quen' },
    { id: 'mac-ao-tia', historicity: 'ngoai-truyen', terminal: true },
    { id: 'bi-lang-quen', historicity: 'ngoai-truyen', terminal: true },
  ],

  fragments: [
    // ══ binh-than ══════════════════════════════════════════════════════════
    {
      id: 'hoi-nghi-o-ben-song',
      volume: 'whisper',
      in: ['binh-than'],
      weight: 6,
      quiet: 0,
    },
    {
      id: 'ai-duoc-goi-ai-khong',
      volume: 'whisper',
      in: ['binh-than'],
      weight: 5,
      quiet: 2,
      leadsTo: ['qua-cam'],
      effect: (ctx) => { ctx.goTo('qua-cam'); },
    },

    // ══ qua-cam — the card the whole design fits in ════════════════════════
    {
      // Preserved from the pre-trunk version.
      id: 'juice-on-his-wrist',
      volume: 'card',
      band: 'court',
      in: ['qua-cam'],
      weight: 10,
      quiet: 1,
      salience: () => 12,
      options: [
        {
          id: 'he-is-a-child',
          historicity: 'annal',
          to: 'la-co',
          apply: (ctx) => {
            ctx.remember('refused', 1);
            ctx.state.court.stability = Math.min(100, ctx.state.court.stability + 4);
            ctx.heat(4);
          },
        },
        {
          id: 'admit-him',
          historicity: 'divergent',
          to: 'vao-hoi',
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
            ctx.story.names = { ...(ctx.story.names ?? {}), hero: boy.name };
            ctx.remember('admitted', 1);
            ctx.remember('echoTurn', ctx.state.turn);
          },
        },
      ],
    },

    // ══ la-co — the record ═════════════════════════════════════════════════
    {
      id: 'sau-chu-tren-la-co',
      volume: 'whisper',
      in: ['la-co'],
      weight: 7,
      quiet: 1,
      tone: 'reward',
    },
    {
      // Preserved: the host arrives, and it is not yours.
      id: 'he-raises-his-banner',
      volume: 'blow',
      band: 'march',
      in: ['la-co'],
      weight: 9,
      quiet: 2,
      tone: 'threat',
      salience: () => 9,
      effect: (ctx) => {
        const home = ctx.land();
        if (!home) return;
        ctx.state.armies.push({
          id: `orange-host-${ctx.state.turn}`,
          kingdomId: PLAYER_KINGDOM_ID,
          name: 'Cờ Riêng',
          landId: home.id,
          units: { spearmen: 700, archers: 220, heavyInfantry: 80 },
          morale: 100,
          supply: 60,
          rations: 120,
          provisions: 90,
          level: 1,
          experience: 0,
          experienceToNextLevel: 120,
        });
        applyResourceDelta(ctx.state, { humans: -300 });
        ctx.remember('banner', 1);
      },
    },
    {
      id: 'cong-nhan-hay-khong',
      volume: 'card',
      band: 'court',
      in: ['la-co'],
      weight: 9,
      quiet: 2,
      when: (ctx) => ctx.recall('banner') === 1,
      salience: () => 10,
      options: [
        {
          id: 'phong-chuc',
          cost: { gold: 90, supplies: 60 },
          historicity: 'annal',
          to: 'chinh-quy',
          apply: (ctx) => { ctx.remember('chinh-quy', 1); },
        },
        {
          id: 'de-tu-lo',
          historicity: 'annal',
          to: 'co-rieng',
          apply: (ctx) => { ctx.remember('tu-lo', 1); },
        },
      ],
    },

    {
      id: 'quan-cua-cau-ta-duoc-cap-luong',
      volume: 'whisper',
      in: ['chinh-quy'],
      weight: 6,
      quiet: 1,
      leadsTo: ['ham-tu'],
      effect: (ctx) => {
        reinforceHosts(ctx, 160);
        ctx.goTo('ham-tu');
      },
    },
    {
      id: 'khong-ai-cap-gi-ca',
      volume: 'whisper',
      in: ['co-rieng'],
      weight: 6,
      quiet: 1,
      leadsTo: ['ham-tu'],
      effect: (ctx) => { ctx.goTo('ham-tu'); },
    },

    // ══ ham-tu — and the honest split ══════════════════════════════════════
    {
      id: 'cau-ta-danh-o-cho-khong-ai-bao',
      volume: 'whisper',
      in: ['ham-tu'],
      weight: 6,
      quiet: 1,
      tone: 'reward',
    },
    {
      id: 'ham-tu-quan',
      volume: 'card',
      band: 'river',
      in: ['ham-tu'],
      weight: 10,
      quiet: 2,
      salience: () => 11,
      options: [
        {
          id: 'cho-cau-ta-di-dau',
          historicity: 'annal',
          to: 'nga-xuong',
          apply: (ctx) => { ctx.remember('dau', 1); },
        },
        {
          id: 'goi-cau-ta-ve',
          historicity: 'divergent',
          to: 'song-sot',
          apply: (ctx) => { ctx.remember('goi-ve', 1); },
        },
      ],
    },
    {
      id: 'the-banner-falls',
      volume: 'blow',
      band: 'fire',
      in: ['nga-xuong'],
      weight: 10,
      terminal: true,
      tone: 'threat',
      effect: (ctx) => {
        ctx.state.armies = ctx.state.armies.filter((army) => !army.id.startsWith('orange-host-'));
        // Everyone who watched a sixteen-year-old do that is a little harder to lose.
        for (const hero of ctx.state.heroes) {
          hero.stats.loyalty = Math.min(100, hero.stats.loyalty + 8);
        }
        for (const land of playerLands(ctx.state)) {
          land.loyalty = Math.min(100, land.loyalty + 6);
        }
        leaveEcho(ctx, ctx.story.names?.hero ?? '');
      },
    },
    {
      id: 'cau-ta-song',
      volume: 'blow',
      band: 'march',
      in: ['song-sot'],
      weight: 10,
      tone: 'reward',
      effect: (ctx) => {
        // The annals do not say he died, so keeping him is a variation rather than a contradiction.
        const boy = generateHero(ctx.state.turn * 7717, {
          id: `orange-grown-${ctx.state.turn}`,
          type: 'general',
          sex: 'man',
        });
        boy.stats.martial = 62;
        boy.stats.loyalty = 95;
        boy.stats.renown = 44;
        boy.traits = [...(boy.traits ?? []), 'Hoài Văn'];
        ctx.state.heroes.push(boy);
        ctx.story.cast.heroId = boy.id;
        ctx.story.names = { ...(ctx.story.names ?? {}), hero: boy.name };
        ctx.remember('song', 1);
      },
    },
    {
      id: 'mot-nguoi-song-sot-thi-lam-gi',
      volume: 'card',
      band: 'border',
      in: ['song-sot'],
      weight: 9,
      quiet: 2,
      when: (ctx) => ctx.recall('song') === 1,
      options: [
        {
          id: 'giao-bien-ai',
          historicity: 'divergent',
          to: 'tran-bien',
          apply: (ctx) => { ctx.remember('bien', 1); },
        },
        {
          id: 'cho-ve-que',
          historicity: 'divergent',
          to: 've-que',
          apply: (ctx) => { ctx.remember('que', 1); },
        },
      ],
    },
    {
      id: 'tran-bien-mot-doi',
      volume: 'whisper',
      in: ['tran-bien'],
      weight: 8,
      terminal: true,
      tone: 'reward',
      effect: (ctx) => {
        const boy = ctx.hero();
        if (boy) temper(ctx, 'martial', 14, boy);
        for (const land of playerLands(ctx.state)) {
          land.loyalty = Math.min(100, land.loyalty + 4);
        }
      },
    },
    {
      id: 've-que-trong-cam',
      volume: 'whisper',
      in: ['ve-que'],
      weight: 8,
      terminal: true,
      effect: (ctx) => {
        ctx.state.court.stability = Math.min(100, ctx.state.court.stability + 8);
        leaveEcho(ctx, ctx.story.names?.hero ?? '');
      },
    },

    // ══ vao-hoi — the divergence, two more decisions ═══════════════════════
    {
      id: 'tieng-noi-tre-nhat-trong-phong',
      volume: 'whisper',
      in: ['vao-hoi'],
      weight: 6,
      quiet: 1,
    },
    {
      id: 'lam-gi-voi-cau-ta',
      volume: 'card',
      band: 'court',
      in: ['vao-hoi'],
      weight: 9,
      quiet: 2,
      salience: () => 9,
      options: [
        {
          id: 'giao-mot-quan',
          historicity: 'divergent',
          to: 'giao-quan',
          apply: (ctx) => { ctx.remember('giao', 1); },
        },
        {
          id: 'giu-ben-canh',
          historicity: 'divergent',
          to: 'giu-ben-canh',
          apply: (ctx) => { ctx.remember('ben-canh', 1); },
        },
      ],
    },
    {
      id: 'cau-xin-tien-phong',
      volume: 'card',
      band: 'march',
      in: ['giao-quan'],
      weight: 9,
      quiet: 2,
      options: [
        {
          id: 'cho-di',
          historicity: 'divergent',
          to: 'tuong-tre',
          apply: (ctx) => { ctx.remember('cho-di', 1); },
        },
        {
          id: 'giu-lai',
          historicity: 'divergent',
          to: 'mat-o-tien-phong',
          apply: (ctx) => { ctx.heat(2); },
        },
      ],
    },
    {
      id: 'tuong-tre-lon-len',
      volume: 'whisper',
      in: ['tuong-tre'],
      weight: 8,
      terminal: true,
      tone: 'reward',
      effect: (ctx) => {
        const boy = ctx.hero();
        if (boy) {
          temper(ctx, 'martial', 22, boy);
          boy.traits = [...(boy.traits ?? []), 'Hoài Văn hầu'];
        }
      },
    },
    {
      id: 'mat-o-tien-phong-that',
      volume: 'blow',
      band: 'fire',
      in: ['mat-o-tien-phong'],
      weight: 10,
      terminal: true,
      tone: 'threat',
      effect: (ctx) => {
        const boy = ctx.hero();
        if (boy) ctx.state.heroes = ctx.state.heroes.filter((h) => h.id !== boy.id);
        ctx.state.court.stability = Math.max(0, ctx.state.court.stability - 12);
      },
    },
    {
      id: 'trieu-dinh-cuoi-cau-ta',
      volume: 'whisper',
      in: ['giu-ben-canh'],
      weight: 6,
      quiet: 1,
    },
    {
      id: 'ao-tia-hay-la-co',
      volume: 'card',
      band: 'court',
      in: ['giu-ben-canh'],
      weight: 9,
      quiet: 2,
      options: [
        {
          id: 'cho-cau-ta-mot-ghe',
          historicity: 'divergent',
          to: 'mac-ao-tia',
          apply: (ctx) => { ctx.remember('ghe', 1); },
        },
        {
          id: 'de-cau-ta-doi',
          historicity: 'divergent',
          to: 'bi-lang-quen',
          apply: (ctx) => { ctx.heat(1); },
        },
      ],
    },
    {
      id: 'mac-ao-tia-that',
      volume: 'whisper',
      in: ['mac-ao-tia'],
      weight: 8,
      terminal: true,
      effect: (ctx) => {
        ctx.state.court.stability = Math.min(100, ctx.state.court.stability + 12);
      },
    },
    {
      id: 'cau-ta-thoi-hoi',
      volume: 'whisper',
      in: ['bi-lang-quen'],
      weight: 8,
      terminal: true,
      effect: (ctx) => {
        const boy = ctx.hero();
        if (boy) boy.stats.loyalty = Math.max(0, boy.stats.loyalty - 25);
      },
    },
  ],
};
