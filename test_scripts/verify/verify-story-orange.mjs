// Quả Cam, driven deliberately down both branches.
//
// The seeded runs in `verify-chronicle` prove the catalogue holds together; they cannot prove that
// *this* story's machinery engages, because a run may never reach it. This plants the story at the
// card the whole design fits in, answers it both ways, and checks what the player is actually
// promised: a hero and a wing if he is admitted, a banner you cannot command if he is refused, a
// door that visibly grows it, and a shrine that knows his name.
//
// Modelled on `verify-story-wager.mjs`, which does the same for Thánh Gióng.
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE: ${m.text()}`); });

await page.goto((process.env.DEV_URL ?? 'http://127.0.0.1:5179') + '/?capture=1', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__phaserGame && window.__phaserGame.scene.isActive('MenuScene'),
  null, { timeout: 30000 });

const out = await page.evaluate(async () => {
  const { createAscentGameState } = await import('/src/state/GameState.ts');
  const { advanceAscentTick } = await import('/src/systems/ascent/AscentTick.ts');
  const { resolveStoryBeat, takeOpening, storyOpening } = await import('/src/systems/story/StorySystem.ts');
  const { defaultMusterPlan } = await import('/src/systems/ascent/MusterSystem.ts');

  /** A realm thirty seasons in, rich enough that nothing below is refused for price alone. */
  const realm = () => {
    let s = 20260808 >>> 0;
    Math.random = () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const st = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
    st.ascent.autoResolveBattles = true;
    for (let i = 0; i < 30; i += 1) advanceAscentTick(st);
    st.resources.gold = 5000; st.resources.supplies = 5000; st.resources.food = 5000;
    // Deliberately NOT lavish: `recruitSoldiers` is `clamp((humans - 80) * 0.8, 320, 2200)`, so at
    // five thousand able men the 2200 cap binds and no offering could ever move the muster. The
    // wager only has teeth in a realm that is short of men, which is the realm it seeds in.
    st.resources.humans = 900;
    return st;
  };

  const plant = (st, node) => {
    const land = st.lands.find((l) => l.ownerId === 'dai-viet');
    const story = {
      id: 'probe-orange', templateId: 'orange', cast: { landId: land.id }, memory: {},
      temperature: 0, seededTurn: st.turn, lastSpokeTurn: st.turn - 9, spoken: [],
      node, path: ['binh-than', node], nodeSince: st.turn, names: {},
    };
    st.stories = [story];
    return story;
  };
  const banner = (st) => st.armies.find((a) => a.id === 'patron-orange' || a.id === 'orange-wing');
  const men = (a) => (a ? a.units.spearmen + a.units.archers + a.units.heavyInfantry : 0);

  const r = {};

  // ── Admitted: a general history never gave you, and a wing that takes orders ──
  {
    const st = realm();
    const story = plant(st, 'qua-cam');
    const humansBefore = st.resources.humans;
    resolveStoryBeat(st, 'probe-orange', 'juice-on-his-wrist', 'admit-him');
    const wing = st.armies.find((a) => a.id === 'orange-wing');
    r.admit = {
      node: story.node,
      named: story.names.hero,
      onRoster: st.heroes.some((h) => h.name === story.names.hero),
      wing: Boolean(wing),
      wingOrders: wing?.orders?.kind ?? null,
      wingIsPatron: Boolean(wing?.patron),
      generaled: Boolean(wing?.generalHeroId),
      paid: humansBefore - st.resources.humans,
      reported: (st.lastStoryOutcome?.outcome ?? []).map((o) => o.kind),
    };
  }

  // ── Refused: the record. A banner on your map that is not yours ──
  {
    const st = realm();
    const story = plant(st, 'qua-cam');
    resolveStoryBeat(st, 'probe-orange', 'juice-on-li-his-wrist'.replace('li-', ''), 'he-is-a-child');
    r.refuse = { node: story.node, named: story.names.hero, onRoster: st.heroes.some((h) => h.name === story.names.hero) };

    resolveStoryBeat(st, 'probe-orange', 'he-raises-his-banner', 'ok');
    resolveStoryBeat(st, 'probe-orange', 'cong-nhan-hay-khong', 'de-tu-lo');
    const host = banner(st);
    r.refuse.banner = { raised: Boolean(host), patron: host?.patron ?? null, autoDefend: Boolean(host?.autoDefend), men: men(host) };

    // The muster the gift competes with, before and after four offerings.
    const musterBefore = defaultMusterPlan(st).soldiers;
    const growth = [];
    for (let k = 0; k < 4; k += 1) {
      story.offer = 'lang-gui-gao';
      story.offerUntil = st.turn + 26;
      const op = storyOpening(st, story);
      if (!op) break;
      st.lastStoryOutcome = undefined;
      takeOpening(st, 'probe-orange', op.fragmentId);
      const h = banner(st);
      growth.push({ men: men(h), level: h?.level ?? 0, elite: h?.elite ?? 0,
                    reported: (st.lastStoryOutcome?.outcome ?? []).map((o) => o.kind) });
    }
    r.refuse.growth = growth;
    r.refuse.musterBefore = musterBefore;
    r.refuse.musterAfter = defaultMusterPlan(st).soldiers;

    // It eats nothing of the realm's, and the autopilot may not take it.
    const { ascentArmyUpkeep } = await import('/src/systems/ResourceSystem.ts');
    const { isAutoHost, commandableHosts } = await import('/src/systems/ascent/armyOrders.ts');
    const host2 = banner(st);
    r.refuse.upkeepCountsIt = ascentArmyUpkeep(st).food > 0
      && st.armies.filter((a) => a.kingdomId === 'dai-viet' && !a.patron).length === 0;
    r.refuse.autoHost = isAutoHost(host2);
    r.refuse.commandable = commandableHosts(st).some((a) => a.id === host2.id);

    // Starved, it wastes away rather than living free.
    //
    // `tickStoryPatrons` directly rather than a whole `advanceAscentTick`: the assertion is about
    // one rule — an unfed auxiliary thins — and a full tick moves armies, opens fights and
    // re-provisions hosts, which put rations back in the baggage train faster than the emptied
    // larder could be observed. The season loop is exercised for real by `verify-chronicle`.
    const { tickStoryPatrons } = await import('/src/systems/story/patrons.ts');
    host2.rations = 0;
    const beforeWaste = men(host2);
    for (let i = 0; i < 3; i += 1) { banner(st).rations = 0; tickStoryPatrons(st); }
    const afterWaste = men(banner(st));
    r.refuse.waste = { before: beforeWaste, after: afterWaste };
    r.refuse.wastedWhenUnfed = afterWaste > 0 && afterWaste < beforeWaste;

    // The ending: the shrine, the card, and the name.
    story.node = 'nga-xuong';
    st.ascent.wavesSurvived += 3;
    resolveStoryBeat(st, 'probe-orange', 'the-banner-falls', 'ok');
    r.refuse.memorial = (st.memorials ?? [])[0] ?? null;
    r.refuse.bannerGone = !banner(st);
    r.refuse.card = Boolean(st.ascent.cardStacks['pha-cuong-dich']);
  }

  // ── Forbidden, and he goes anyway ──
  {
    const st = realm();
    const story = plant(st, 'giao-quan');
    story.memory['chose_giu-lai'] = 1;
    const { storyTemplate } = await import('/src/data/stories/index.ts');
    const tpl = storyTemplate('orange');
    const gated = tpl.fragments.find((f) => f.id === 'di-khong-xin-phep');
    r.forbidden = {
      exists: Boolean(gated),
      terminal: Boolean(gated?.terminal),
      // The older terminal must stay ungated, or the ignore-path deadlocks.
      fallbackUngated: !tpl.fragments.find((f) => f.id === 'mat-o-tien-phong-that')?.when,
    };
  }

  return r;
});
await browser.close();

let pass = 0, fail = 0;
const check = (name, ok, note = '') => {
  console.log(`${ok ? ' ok  ' : 'FAIL '} ${name}${note ? '  — ' + note : ''}`);
  ok ? pass++ : fail++;
};

const a = out.admit, f = out.refuse;
console.log('── Admitted at fifteen ──');
check('the answer opens the divergence', a.node === 'vao-hoi', a.node);
check('he is on the roster, by name', a.onRoster && a.named === 'Trần Quốc Toản', a.named);
check('a wing arrives with him', a.wing && a.paid === 180, `${a.paid} able men`);
check('the wing takes your orders', a.wingOrders === 'defend' && !a.wingIsPatron && a.generaled);
check('the answer reports what it did', a.reported.includes('hero') && a.reported.includes('humans'), a.reported.join(', '));

console.log('\n── Refused: the record ──');
check('the record keeps his name without a roster seat', f.named === 'Trần Quốc Toản' && !f.onRoster);
check('the banner rises as an auxiliary', f.banner.raised && f.banner.patron === 'orange' && f.banner.autoDefend);
check('feeding it visibly grows it', f.growth.length === 4
  && f.growth.every((g, i) => i === 0 || g.men > f.growth[i - 1].men), f.growth.map((g) => g.men).join(' → '));
check('it takes veterans at two gifts and a guard at four',
  f.growth[1]?.level === 2 && f.growth[3]?.elite >= 1);
check('every gift reports the price and the total', f.growth.every((g) => g.reported.includes('patron')));
check('the gift competes with your own muster', f.musterAfter < f.musterBefore,
  `${f.musterBefore} → ${f.musterAfter} soldiers`);
check('it is nobody\'s to command', !f.autoHost && !f.commandable);
check('unfed, it wastes away', f.wastedWhenUnfed, `${f.waste.before} → ${f.waste.after}`);
check('the ending enshrines him by name', f.memorial?.name === 'Trần Quốc Toản', JSON.stringify(f.memorial));
check('the shrine is built to what he did', (f.memorial?.deeds ?? 0) > 0 && (f.memorial?.loyaltyFloor ?? 0) > 60);
check('the banner goes with him', f.bannerGone);
check('the record pays in a rule', f.card);

console.log('\n── Forbidden, and he goes anyway ──');
check('the gated terminal exists', out.forbidden.exists && out.forbidden.terminal);
check('the ignore-path still has an ungated terminal', out.forbidden.fallbackUngated);

console.log('\n── Console ──');
check('no page errors', errors.length === 0, errors.slice(0, 2).join(' | '));

console.log(`\n${pass}/${pass + fail} checks passed`);
console.log(fail === 0
  ? 'PASS: the boy has a name, the banner grows on what it is given, and the record remembers him'
  : 'FAIL: Quả Cam is not delivering what its cards promise');
process.exit(fail === 0 ? 0 : 1);
