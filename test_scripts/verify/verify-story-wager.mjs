// Verifies the Chronicle's decision trees and the wager contract, on the story that is one.
//
// The general harness drives whole runs and reports what happened to turn up; this one walks
// `thanh-giong` deliberately, because the things worth asserting about a wager — that refusing is
// survivable, that the tag is stamped, and above all that paying for it *costs* something the
// muster can feel — are invisible unless you go and take each branch on purpose.
//
// Run against a dev server.
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (err) => errors.push(`PAGEERROR: ${err.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE: ${m.text()}`); });

await page.goto((process.env.DEV_URL ?? 'http://127.0.0.1:5180') + '/?capture=1', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__phaserGame && window.__phaserGame.scene.isActive('MenuScene'),
  null, { timeout: 30000 });

const result = await page.evaluate(async () => {
  const { createAscentGameState } = await import('/src/state/GameState.ts');
  const { storyTemplate } = await import('/src/data/stories/index.ts');
  const { defaultMusterPlan } = await import('/src/systems/ascent/MusterSystem.ts');
  const {
    resolveStoryBeat, takeOpening, storyPath, storyDrift, storyParams,
  } = await import('/src/systems/story/StorySystem.ts');
  const { storyText } = await import('/src/i18n/story/index.ts');
  // Not 'player'. Filtering on the wrong id made a probe count a fake army while the verb
  // under test correctly removed a real one, and the check passed on both counts being 1.
  const { PLAYER_KINGDOM_ID: ME } = await import('/src/game/constants.ts');

  const out = {};
  const template = storyTemplate('thanh-giong');

  // A realm losing badly enough that the story will look at it, with a live story planted by hand
  // so the walk starts from a known node rather than from whatever the seed roll produced.
  const build = () => {
    let s = 4242 >>> 0;
    Math.random = () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const st = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
    st.resources.humans = 2000;
    st.resources.supplies = 900;
    st.resources.gold = 900;
    st.resources.food = 900;
    const land = st.lands.find((l) => l.ownerId === ME && l.hasVillage) ?? st.lands[0];
    st.stories = [{
      id: 'walk', templateId: 'thanh-giong', cast: { landId: land.id },
      memory: {}, temperature: 0, seededTurn: st.turn, lastSpokeTurn: st.turn, spoken: [],
      node: 'tin-giac', path: ['tin-giac'], nodeSince: st.turn,
      names: { land: land.name },
    }];
    return st;
  };

  const story = (st) => st.stories[0];
  const answer = (st, fragmentId, optionId) => resolveStoryBeat(st, 'walk', fragmentId, optionId);

  // ── The gate: only a realm that is losing is offered a miracle ────────────
  {
    const st = build();
    st.ascent.threat = 100; st.ascent.defensePower = 1000;
    out.gateWhenWinning = template.seed(st) === undefined;
    st.ascent.threat = 4000; st.ascent.defensePower = 1000;
    out.gateWhenLosing = template.seed(st) !== undefined;
  }

  // ── The record: herald → iron → fed → rides → Sóc Sơn ─────────────────────
  {
    const st = build();
    answer(st, 'loi-keu-goi', 'sai-su-gia');
    out.recordAfterHerald = story(st).node;
    answer(st, 'he-asked-for-an-iron-horse', 'make-it');
    out.recordAfterIron = story(st).node;
    out.driftOnRecord = storyDrift(story(st));

    // The offering, three times, through the door rather than through a card.
    const before = defaultMusterPlan(st).soldiers;
    const beforeHumans = st.resources.humans;
    for (let i = 0; i < 3; i += 1) {
      story(st).offer = 'bay-nong-com-ba-nong-ca';
      takeOpening(st, 'walk', 'bay-nong-com-ba-nong-ca');
    }
    const after = defaultMusterPlan(st).soldiers;
    out.wager = {
      fed: story(st).memory.nuoi,
      musterBefore: before,
      musterAfter: after,
      dropPct: Math.round((1 - after / Math.max(1, before)) * 100),
      humansSpent: beforeHumans - st.resources.humans,
    };

    // The muster horn decides on what was actually paid, then he rides.
    answer(st, 'ngua-sat-da-xong', 'ok');
    out.afterHorn = story(st).node;
    const armiesBefore = st.armies.length;
    answer(st, 'he-rides', 'ok');
    out.afterRide = story(st).node;
    out.hostGranted = st.armies.length - armiesBefore;
    answer(st, 'soc-son-khong-xuong-nua', 'ok');
    out.recordEnded = (st.stories ?? []).length === 0;
    out.recordEntry = (st.chronicle ?? []).map((e) => `${e.fragmentId}:${e.historicity}`);
  }

  // ── Underfed: the loss clause. Paid once, he never rides ──────────────────
  {
    const st = build();
    answer(st, 'loi-keu-goi', 'sai-su-gia');
    answer(st, 'he-asked-for-an-iron-horse', 'make-it');
    story(st).offer = 'bay-nong-com-ba-nong-ca';
    takeOpening(st, 'walk', 'bay-nong-com-ba-nong-ca');
    answer(st, 'ngua-sat-da-xong', 'ok');
    out.underfedNode = story(st).node;
  }

  // ── Divergence: answering differently keeps going, and is tagged ──────────
  {
    const st = build();
    answer(st, 'loi-keu-goi', 'ta-co-quan-roi');
    out.divergedNode = story(st).node;
    out.divergedDrift = storyDrift(story(st));
    answer(st, 'danh-the-nao', 'giu-ai');
    answer(st, 'dot-kho-hay-cat-duong', 'dot-kho-truoc-mat-chung');
    out.refusalNode = story(st).node;
    const landsBefore = st.lands.filter((l) => l.ownerId === ME).length;
    answer(st, 'tu-lo-lay-duoc', 'ok');
    out.refusalEnded = (st.stories ?? []).length === 0;
    out.refusalEntry = (st.chronicle ?? []).map((e) => `${e.fragmentId}:${e.historicity}`);
    out.refusalKeptLands = st.lands.filter((l) => l.ownerId === ME).length === landsBefore;
    out.refusalDecisions = 2;
  }

  // ── The confluence: rejoin the record, and the tag remembers ──────────────
  {
    const st = build();
    answer(st, 'loi-keu-goi', 'sai-su-gia');
    answer(st, 'he-asked-for-an-iron-horse', 'dua-ve-trieu');
    out.courtDrift = storyDrift(story(st));
    answer(st, 'lam-gi-voi-dua-be-o-trieu', 'tra-ve-lang');
    out.confluenceNode = story(st).node;
    out.confluenceDrift = storyDrift(story(st));
    out.confluencePath = storyPath(st, story(st)).map((p) => `${p.nodeId}${p.diverged ? '*' : ''}`);
  }

  // ── Every ending is reachable, and every one has prose ────────────────────
  {
    const st = build();
    const params = storyParams(st, story(st));
    out.endingsMissingProse = template.nodes
      .filter((n) => n.terminal)
      .map((n) => template.fragments.find((f) => f.terminal && f.in?.includes(n.id)))
      .filter(Boolean)
      .map((f) => `thanh-giong.${f.id}.chronicle`)
      .filter((key) => storyText(key, params) === key);
    out.endingCount = template.nodes.filter((n) => n.terminal).length;
  }

  // Tran Quoc Toan: the yes/no, and both sides going on.
  {
    const build2 = () => {
      let s = 909 >>> 0;
      Math.random = () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
      const st = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
      st.resources.gold = 900; st.resources.supplies = 900; st.resources.humans = 2000;
      const land = st.lands.find((l) => l.ownerId === ME) ?? st.lands[0];
      st.stories = [{
        id: 'walk', templateId: 'orange', cast: { landId: land.id },
        memory: {}, temperature: 0, seededTurn: st.turn, lastSpokeTurn: st.turn, spoken: [],
        node: 'qua-cam', path: ['binh-than', 'qua-cam'], nodeSince: st.turn,
        names: { land: land.name },
      }];
      return st;
    };
    const st = build2();
    const s = () => st.stories[0];
    resolveStoryBeat(st, 'walk', 'juice-on-his-wrist', 'he-is-a-child');
    out.orangeNo = { node: s().node, drift: storyDrift(s()) };
    const armiesBefore = st.armies.length;
    resolveStoryBeat(st, 'walk', 'he-raises-his-banner', 'ok');
    out.orangeHost = st.armies.length - armiesBefore;
    resolveStoryBeat(st, 'walk', 'cong-nhan-hay-khong', 'de-tu-lo');
    out.orangeAfterTwo = s().node;

    const st2 = build2();
    const s2 = () => st2.stories[0];
    resolveStoryBeat(st2, 'walk', 'juice-on-his-wrist', 'admit-him');
    out.orangeYes = { node: s2().node, drift: storyDrift(s2()), heroes: st2.heroes.length };
    resolveStoryBeat(st2, 'walk', 'lam-gi-voi-cau-ta', 'giao-mot-quan');
    resolveStoryBeat(st2, 'walk', 'cau-xin-tien-phong', 'cho-di');
    out.orangeYesEnd = s2().node;
    // A terminal whisper fires on the next story tick rather than on the answer, so the
    // chronicle is legitimately still empty. What matters here is that the branch arrived at a
    // divergent ending node with the tag stuck to it.
    out.orangeYesDrift = storyDrift(s2());
  }

  // Ly Thuong Kiet: the lever actually removes the army from the map.
  {
    let s = 5150 >>> 0;
    Math.random = () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const st = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
    st.resources.gold = 900; st.resources.supplies = 900;
    const land = st.lands.find((l) => l.ownerId === ME) ?? st.lands[0];
    st.armies.push({
      id: 'main-host', kingdomId: ME, name: 'Chu Luc', landId: land.id,
      units: { spearmen: 900, archers: 300, heavyInfantry: 120 },
      morale: 100, supply: 80, rations: 200, provisions: 150,
      level: 2, experience: 0, experienceToNextLevel: 200,
    });
    st.stories = [{
      id: 'walk', templateId: 'tien-phat',
      cast: { landId: land.id, kingdomId: st.kingdoms.find((k) => k.id !== ME)?.id },
      memory: {}, temperature: 0, seededTurn: st.turn, lastSpokeTurn: st.turn, spoken: [],
      node: 'tin-bien', path: ['tin-bien'], nodeSince: st.turn, names: { land: land.name },
    }];
    const before = st.armies.filter((a) => a.kingdomId === ME).length;
    resolveStoryBeat(st, 'walk', 'danh-truoc-hay-doi', 'danh-truoc');
    const during = st.armies.filter((a) => a.kingdomId === ME).length;
    resolveStoryBeat(st, 'walk', 'dot-kho-roi-rut', 'dot-kho-va-ve');
    const after = st.armies.filter((a) => a.kingdomId === ME).length;
    out.lever = {
      node: st.stories[0].node, hostsBefore: before,
      hostsWhileAbroad: during, hostsAfter: after, sent: st.stories[0].memory.sent,
    };
    const st3 = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
    st3.stories = [{
      id: 'walk', templateId: 'tien-phat', cast: { landId: st3.lands[0].id },
      memory: {}, temperature: 0, seededTurn: 0, lastSpokeTurn: 0, spoken: [],
      node: 'tin-bien', path: ['tin-bien'], nodeSince: 0, names: {},
    }];
    resolveStoryBeat(st3, 'walk', 'danh-truoc-hay-doi', 'doi-chung-toi');
    resolveStoryBeat(st3, 'walk', 'co-thu-hay-chan-bien', 'chan-o-bien');
    resolveStoryBeat(st3, 'walk', 'chan-duoc-hay-vo', 'danh-chan');
    out.leverWait = { node: st3.stories[0].node, drift: storyDrift(st3.stories[0]) };
  }

  return out;
});

await browser.close();

const checks = [];
const check = (label, pass, detail = '') => {
  checks.push({ label, pass });
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${label}${detail ? `  — ${detail}` : ''}`);
};

console.log('\n=== THE GATE ===');
check('a realm that is winning is not offered a miracle', result.gateWhenWinning);
check('a realm that is losing is', result.gateWhenLosing);

console.log('\n=== THE RECORD ===');
check('the herald leads to the child', result.recordAfterHerald === 'su-gia', result.recordAfterHerald);
check('forging the iron leads to the forge', result.recordAfterIron === 'ren-sat', result.recordAfterIron);
check('the record stays chính sử', result.driftOnRecord === 'chinh-su', result.driftOnRecord);
check('fed enough, he rides', result.afterHorn === 'ra-tran', result.afterHorn);
check('the ride grants a host', result.hostGranted === 1, `${result.hostGranted} host(s)`);
check('the ride ends at Sóc Sơn', result.afterRide === 'soc-son', result.afterRide);
check('the story retires when it ends', result.recordEnded);
check('the ending is stamped chính sử', result.recordEntry.some((e) => e.endsWith(':chinh-su')),
  result.recordEntry.join(' | '));

console.log('\n=== T6 · THE WAGER MUST MOVE THE MUSTER ===');
console.log(`     fed ${result.wager.fed}×, spent ${result.wager.humansSpent} humans`);
console.log(`     muster ${result.wager.musterBefore} → ${result.wager.musterAfter} soldiers`);
check('paying for the miracle costs the levy at least 15%', result.wager.dropPct >= 15,
  `${result.wager.dropPct}% smaller`);
check('the offering can be taken three times', result.wager.fed === 3, `${result.wager.fed}`);

console.log('\n=== THE LOSS ===');
check('underfed, he never rides', result.underfedNode === 'khong-du-an', result.underfedNode);

console.log('\n=== DIVERGENCE ===');
check('refusing the herald does not end the story', result.divergedNode === 'khong-goi', result.divergedNode);
check('leaving the record stamps ngoại truyện', result.divergedDrift === 'ngoai-truyen', result.divergedDrift);
check('the refusal branch carries two more decisions', result.refusalNode === 'tu-lo-lay', result.refusalNode);
check('the refusal branch has a real win in it', result.refusalKeptLands);
check('its ending is stamped ngoại truyện', result.refusalEntry.some((e) => e.endsWith(':ngoai-truyen')),
  result.refusalEntry.join(' | '));

console.log('\n=== THE CONFLUENCE ===');
check('going to court leaves the record', result.courtDrift === 'ngoai-truyen', result.courtDrift);
check('sending him home rejoins it', result.confluenceNode === 'ren-sat', result.confluenceNode);
check('but the tag remembers', result.confluenceDrift === 'ngoai-truyen', result.confluenceDrift);
console.log(`     path: ${result.confluencePath.join(' → ')}`);

console.log('\n=== PROSE ===');
check(`all ${result.endingCount} endings have an annal line`,
  result.endingsMissingProse.length === 0, result.endingsMissingProse.join(', '));

console.log('\n=== TRAN QUOC TOAN - THE YES/NO ===');
check('NO keeps the record and raises the banner', result.orangeNo.node === 'la-co', result.orangeNo.node);
check('the banner is a real host you did not ask for', result.orangeHost === 1, String(result.orangeHost));
check('the record carries two more decisions', result.orangeAfterTwo === 'co-rieng', result.orangeAfterTwo);
check('YES leaves the record', result.orangeYes.drift === 'ngoai-truyen', result.orangeYes.drift);
check('YES gives you a general history never gave you', result.orangeYes.heroes > 0, result.orangeYes.heroes + ' heroes');
check('and the branch keeps asking, twice more', result.orangeYesEnd === 'tuong-tre', result.orangeYesEnd);
check('and its ending node is divergent', result.orangeYesDrift === 'ngoai-truyen', result.orangeYesDrift);

console.log('\n=== LY THUONG KIET - THE LEVER SPENDS THE ARMY ===');
console.log('     hosts: ' + result.lever.hostsBefore + ' -> ' + result.lever.hostsWhileAbroad + ' while abroad -> ' + result.lever.hostsAfter + ' home');
check('striking first removes the host from the map', result.lever.hostsWhileAbroad < result.lever.hostsBefore, result.lever.sent + ' soldiers committed');
check('withdrawing brings it back', result.lever.hostsAfter > result.lever.hostsWhileAbroad);
check('the record reaches the river line', result.lever.node === 'nhu-nguyet', result.lever.node);
check('waiting is a full campaign, not a shrug', result.leverWait.node === 'chan-duoc', result.leverWait.node);


console.log('\n=== CONSOLE ===');
check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));

const failed = checks.filter((c) => !c.pass);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
console.log(failed.length === 0
  ? 'PASS: the tree branches, the tag sticks, and the wager costs what it claims to'
  : `FAIL: ${failed.map((c) => c.label).join('; ')}`);
process.exit(failed.length === 0 ? 0 : 1);
