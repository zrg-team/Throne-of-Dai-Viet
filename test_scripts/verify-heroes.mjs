// The champion roster, end to end: the deck's shape, the opening's variety, the portrait
// wardrobe, and the bio layer. Every failure this guards against compiles perfectly — a king
// whose face never changes, a founder card that opens on the same three names, a champion with
// no bio — so none of it shows up in `tsc`.
//
// Usage: DEV_URL=http://127.0.0.1:5179 node test_scripts/verify-heroes.mjs
import { chromium } from 'playwright';
const URL = process.env.DEV_URL ?? process.env.PLAYTEST_URL ?? 'http://127.0.0.1:5173';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`PAGEERROR ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE ${m.text()}`); });
await page.goto(`${URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof window.__startBenchGame === 'function' && window.__phaserGame.scene.isActive('MenuScene'), null, { timeout: 30000 });

const r = await page.evaluate(async () => {
  const { heroTemplates, generateKingHero, KINGS, FOUNDER_IDS } = await import('/src/data/heroes.ts');
  const { generateHero } = await import('/src/data/heroFactory.ts');
  const { REAL_FIGURES } = await import('/src/data/heroNames.ts');
  const { createAscentGameState } = await import('/src/state/GameState.ts');
  const { resolveAscentPrompt } = await import('/src/systems/ascent/AscentResolver.ts');
  const { resolveHeroLook } = await import('/src/ui/faces/heroLook.ts');
  const { FACE_PART_DEFS } = await import('/src/ui/faces/parts.generated.ts');
  const { heroBio, heroName, heroEffect, heroDescription } = await import('/src/i18n/index.ts');

  const known = new Set(FACE_PART_DEFS.map((p) => p.key));
  const out = { deck: heroTemplates.length, parts: known.size, kings: KINGS.length };

  // ── every part a wardrobe can ask for must exist, or it silently draws nothing ──
  const missing = new Set(), stacks = new Set();
  const sample = [...heroTemplates, ...Array.from({ length: 400 }, (_, i) => generateHero(i * 2654435761))];
  for (const hero of sample) {
    const look = resolveHeroLook(hero);
    for (const part of look.parts) if (!known.has(part.key)) missing.add(part.key);
    stacks.add(look.parts.map((p) => p.key).join(','));
  }
  out.missingParts = [...missing];
  out.distinctLooks = stacks.size;
  out.sampleSize = sample.length;

  // ── the throne: names, faces and lives must all vary with who is sitting on it ──
  const kingNames = new Set(), kingLooks = new Set(), kingBios = new Set();
  for (let i = 0; i < 400; i += 1) {
    const k = generateKingHero();
    kingNames.add(k.name);
    kingLooks.add(resolveHeroLook(k).parts.map((p) => p.key).join(','));
    kingBios.add(heroBio(k));
  }
  out.kingNames = kingNames.size; out.kingLooks = kingLooks.size; out.kingBios = kingBios.size;

  // ── every champion has a name, an effect, a description and a bio in the active language ──
  const blank = heroTemplates.filter((h) =>
    !heroName(h) || !heroEffect(h) || !heroDescription(h) || !heroBio(h)
    || heroBio(h).startsWith('heroes.') || heroName(h).startsWith('heroes.'));
  out.blankText = blank.map((h) => h.id);

  // ── names must read as names, not as offices ──
  // Only whole title words count. `Thái` alone is a real family name (Thái Tuyết Vy is a
  // person); `Thái Sư` and `Thái Úy` are offices. Matching the bare syllable flagged the one
  // and missed nothing the other did not already catch.
  const OFFICE = /^(Người |Nữ |Bà |Ông |Quan |Thầy |Lính |Dân |Cô |Chú |Thợ |Lái |Xã |Kẻ |Tướng Quân|Đô Đốc|Thái Sư|Thái Úy|Thái Y|Trấn Thủ|Huyện |An Phủ|Hành Nhân|Chánh Sứ|Mật Thám|Tuần |Kỵ |Đinh Trưởng|Thủy Thủ|Đại Tướng|Sử Gia|Sứ Giả|Hàn Lâm|Tế Tửu|Thị Lang|Thiền Sư|Đốc |Quản |Trấn )/;
  const HISTORICAL = new Set(REAL_FIGURES.map((f) => f.name));
  out.officeNamed = heroTemplates.filter((h) => OFFICE.test(h.name) && !HISTORICAL.has(h.name)).map((h) => h.name);

  // ── the opening is two cards: a ruler, then a founder ──
  const trios = new Set(); let dupRole = 0, dupRank = 0;
  const rulerSets = new Set(); let opensOnRuler = 0, chainsToFounder = 0, seated = 0;
  for (let i = 0; i < 60; i += 1) {
    const st = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
    const first = st.pendingAscentPrompt;
    if (first?.kind === 'founder') opensOnRuler += 1;
    const pairs = first?.options ?? [];
    rulerSets.add(pairs.map((o) => o.split(':')[0]).join('|'));
    // Every option must name a ruler and a champion, and choosing one must seat both.
    if (pairs.every((o) => o.split(':').length === 3)) chainsToFounder += 1;
    const probe = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
    const pick = probe.pendingAscentPrompt.options[pairs.length - 1] ?? probe.pendingAscentPrompt.options[0];
    resolveAscentPrompt(probe, pick);
    const [wantKing, wantTrait, wantHero] = pick.split(':');
    const king = probe.heroes.find((h) => h.id === 'king');
    const profile = KINGS.find((k) => k.slug === wantKing);
    // The card renders the ruler from the same slug and trait index; if the seated effect
    // differs from the rendered one, the card advertised something the player did not get.
    const advertised = generateKingHero(wantKing, Number(wantTrait));
    if (king && profile && king.name === profile.name
      && king.effect === advertised.effect && king.upkeepGold === advertised.upkeepGold
      && probe.heroes.some((h) => h.id === wantHero)) seated += 1;
    const ids = pairs.map((o) => o.split(':')[2]);
    trios.add(ids.join('|'));
    const roles = new Set(), ranks = new Set();
    for (const id of ids) {
      const h = st.heroDeck.find((c) => c.id === id); if (!h) continue;
      roles.add(h.type); ranks.add(h.rarity);
    }
    if (roles.size < ids.length) dupRole += 1;
    if (ranks.size < ids.length) dupRank += 1;
  }
  out.distinctTrios = trios.size; out.dupRole = dupRole; out.dupRank = dupRank;
  out.opensOnRuler = opensOnRuler; out.distinctRulerSets = rulerSets.size;
  out.chainsToFounder = chainsToFounder; out.rulerSeated = seated;

  // ── the generator must never mint someone the authored roster already names ──
  const authored = new Set(heroTemplates.map((h) => h.name));
  const clashes = new Set();
  for (let i = 0; i < 2000; i += 1) {
    const h = generateHero(i * 7919 + 13);
    if (authored.has(h.name)) clashes.add(h.name);
  }
  out.duplicatePeople = [...clashes];
  // The founding gift: each office must change the board, and differently.
  const gifts = {};
  for (let i = 0; i < 60; i += 1) {
    const st = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
    const before = { lands: st.lands.filter((l) => l.ownerId === 'dai-viet').length,
      gold: st.resources.gold, humans: st.resources.humans, influence: st.court.influence,
      host: Object.values(st.armies.find((a) => a.id === 'ascent-royal-host')?.units ?? {}).reduce((a, b) => a + b, 0) };
    out.startingLands = before.lands;
    const opt = st.pendingAscentPrompt.options[i % st.pendingAscentPrompt.options.length];
    const champion = st.heroDeck.find((h) => h.id === opt.split(':')[2]);
    resolveAscentPrompt(st, opt);
    const after = { lands: st.lands.filter((l) => l.ownerId === 'dai-viet').length,
      gold: st.resources.gold, humans: st.resources.humans, influence: st.court.influence,
      host: Object.values(st.armies.find((a) => a.id === 'ascent-royal-host')?.units ?? {}).reduce((a, b) => a + b, 0) };
    const moved = after.lands > before.lands || after.gold > before.gold
      || after.humans > before.humans || after.influence > before.influence || after.host > before.host;
    (gifts[champion.type] ??= { n: 0, moved: 0 }).n += 1;
    if (moved) gifts[champion.type].moved += 1;
  }
  out.gifts = gifts;
  out.realFigures = REAL_FIGURES.length;
  out.founderIds = [...FOUNDER_IDS];
  out.foundersExist = FOUNDER_IDS.every((id) => heroTemplates.some((h) => h.id === id));
  return out;
});

const checks = {
  'the deck is a hundred champions deep': r.deck >= 100,
  'the wardrobe ships every part it asks for': r.missingParts.length === 0,
  'portraits are not one face in many hats': r.distinctLooks > r.sampleSize * 0.9,
  'the throne draws from more than a handful of rulers': r.kingNames === r.kings && r.kings >= 20,
  'a new ruler is a new face': r.kingLooks >= r.kings,
  'a new ruler is a new life': r.kingBios >= r.kings,
  'every champion has name, effect, description and bio': r.blankText.length === 0,
  'names read as names, not as job titles': r.officeNamed.length === 0,
  'the run opens on the founding card': r.opensOnRuler === 60,
  'every option names a ruler and a champion': r.chainsToFounder === 60,
  'the rulers offered are not a fixed script': r.distinctRulerSets >= 50,
  'the founding seats the ruler, the trait shown, and the champion': r.rulerSeated === 60,
  'the founder card is not a fixed script': r.distinctTrios >= 50,
  'the founder card offers three distinct roles': r.dupRole === 0,
  'the founder card offers three distinct ranks': r.dupRank === 0,
  'no run can meet the same historical person twice': r.duplicatePeople.length === 0,
  'the realm opens on one province': r.startingLands === 1,
  'every office brings something to the founding': Object.keys(r.gifts).length === 4
    && Object.values(r.gifts).every((g) => g.moved === g.n),
  'the record is deep enough to matter': r.realFigures >= 100,
  'empire-mode founders all exist': r.foundersExist,
  'no console errors': errors.length === 0,
};
console.log(JSON.stringify(r, null, 2));
console.log('=== CHECKS ===');
let pass = true;
for (const [label, ok] of Object.entries(checks)) { if (!ok) pass = false; console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}`); }
if (errors.length) console.log(errors.slice(0, 5).join('\n'));
console.log(pass ? 'PASS: the champion roster holds' : 'CHECK: some expectations unmet');
await browser.close();
process.exit(pass ? 0 : 1);
