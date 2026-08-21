// Close-zoom art shots: the one test the proportion and render-order work is actually judged by.
//
// The complaints these answer are all *comparisons* — grass against a person, a person against a
// buffalo, a soldier against a farmer, a flag against the shadow it should stand on — and none of
// them can be read at map zoom, which is why they survived several passes. Every shot here is
// framed on two things that have to agree with each other.
//
// Usage: node test_scripts/shot/shot-art.mjs [seed]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const SEED = Number(process.argv[2] ?? 1337);
const OUT = 'test_scripts/shots';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto('http://127.0.0.1:5173', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof window.__startBenchGame === 'function'
  && window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });
await page.evaluate((s) => window.__startBenchGame(s), SEED);
await page.waitForFunction(() => window.__phaserGame.scene.isActive('MapScene'), null, { timeout: 30000 });
await page.waitForTimeout(800);
// The HUD is not what is being judged here, and its zoom column sits exactly where a subject
// centred in the canvas lands.
await page.evaluate(() => window.__phaserGame.scene.getScene('UIScene')?.scene.setVisible(false));

const CROP = 460;

/**
 * Parks the camera on a world point at max zoom, holds the clock, then crops to where the subject
 * actually landed.
 *
 * The crop is not cosmetic. `centerOn` does not survive the scene's own camera handling, so a
 * subject near the map edge ends up in the corner of the frame behind the zoom buttons — which is
 * how the first run of this produced five screenshots of scenery. Reading the camera back and
 * clipping to the real position is immune to whatever the scene does to the scroll.
 */
async function frame(label, locate) {
  const found = await page.evaluate((src) => {
    const scene = window.__phaserGame.scene.getScene('MapScene');
    const st = scene.state;
    st.isPaused = true;
    // eslint-disable-next-line no-new-func
    const at = new Function('scene', 'st', src)(scene, st);
    if (!at) return null;
    scene.cameras.main.removeBounds();
    scene.cameras.main.setZoom(1.65);
    scene.cameras.main.centerOn(at.x, at.y);
    return { what: at.what ?? 'ok', x: at.x, y: at.y };
  }, locate);
  if (!found) {
    console.log(`[${label}] nothing to frame`);
    return;
  }

  await page.waitForTimeout(500);
  const box = await page.evaluate(({ x, y }) => {
    const game = window.__phaserGame;
    const cam = game.scene.getScene('MapScene').cameras.main;
    const canvas = game.canvas.getBoundingClientRect();
    // `scrollX/Y`, NOT `worldView`. Phaser only recomputes `worldView` during the camera's
    // preRender, so reading it straight after `setZoom`/`centerOn` returns the previous frame's
    // rect — it reported the un-zoomed size here and threw the crop ~200 px off in both axes.
    const scaleX = canvas.width / game.scale.width;
    const scaleY = canvas.height / game.scale.height;
    return {
      x: canvas.left + (x - cam.scrollX) * cam.zoom * scaleX,
      y: canvas.top + (y - cam.scrollY) * cam.zoom * scaleY,
    };
  }, found);

  // Clamped to the canvas, not the window: the game letterboxes inside a 900x900 viewport, and a
  // crop clamped to the window edge captures black bars instead of map.
  const canvas = await page.evaluate(() => {
    const r = window.__phaserGame.canvas.getBoundingClientRect();
    return { l: r.left, t: r.top, w: r.width, h: r.height };
  });
  await page.screenshot({
    path: `${OUT}/art-${label}.png`,
    clip: {
      x: Math.max(canvas.l, Math.min(canvas.l + canvas.w - CROP, box.x - CROP / 2)),
      y: Math.max(canvas.t, Math.min(canvas.t + canvas.h - CROP, box.y - CROP / 2)),
      width: CROP,
      height: CROP,
    },
  });
  console.log(`[${label}] ${found.what}`);
}

// A settlement the generator gave NO fortress/shrine terrain — the case that used to get scatter
// trees planted through its roofs, because only fortress/shrine cells kept the scatter clear.
// `scene.landNodes` is the live container per land — its own x/y, rather than a recomputed anchor,
// is the only position guaranteed to be where the settlement was actually drawn.
const NODE_AT = `
  const node = scene.landNodes.get(land.id);
  if (!node) return null;
  return { x: node.x, y: node.y + 20, what: what };
`;

// A settlement the generator gave NO fortress/shrine terrain, so it renders through
// `addResourceCluster` on ordinary ground — the case that used to get scatter trees planted through
// its roofs, because only fortress/shrine cells kept the scatter clear. Fog hides every one of
// these at turn 1, so the map is revealed first: this is a drawing check, not a gameplay one.
await frame('village-open', `
  st.lands.forEach(l => { l.isVisible = true; l.isExplored = true; });
  scene.refresh();
  const withSeat = new Set(st.hexTiles.filter(t => t.terrain === 'fortress' || t.terrain === 'shrine').map(t => t.landId));
  const land = st.lands.find(l => l.hasVillage && !withSeat.has(l.id)) ?? st.lands.find(l => l.hasVillage);
  if (!land) return null;
  const what = land.name + ' (' + land.type + ') seatTerrain=' + withSeat.has(land.id);
  ${NODE_AT}
`);

// The player's own seat: citadel, hamlets, grove, herd, name plate and building glyphs together.
await frame('capital', `
  const land = st.lands.find(l => l.ownerId === 'dai-viet' && l.type === 'castle') ?? st.lands[0];
  const what = land.name + ' buildings=' + land.buildings.length;
  ${NODE_AT}
`);

// Open country. The shot the whole proportion phase is judged by: grass, a farmer, a tree and a
// roof in one frame, because every one of these complaints is a comparison between two of them.
// Taken inside owned land — a plains tile picked anywhere lands on the fog edge.
await frame('plains', `
  const mine = new Set(st.lands.filter(l => l.ownerId === 'dai-viet' && l.isVisible).map(l => l.id));
  const tiles = st.hexTiles.filter(t => mine.has(t.landId) && (t.terrain === 'plains' || t.terrain === 'fields'));
  const tile = tiles[Math.floor(tiles.length / 2)];
  if (!tile) return null;
  const c = scene.landscapeGeometry().centreOf(tile);
  return { x: c.x, y: c.y, what: tile.terrain + ' in owned land (' + tiles.length + ' candidates)' };
`);

// A host, at two sizes. The flag/shadow mismatch is size-INDEPENDENT in the old algebra, so a fix
// that looks right at one size and wrong at the other was a magic number rather than a fix.
for (const [label, men] of [['host-small', 3000], ['host-large', 12000]]) {
  await frame(label, `
    const mid = st.lands.filter(l => l.isVisible).sort((a, b) => a.y - b.y);
    const land = mid[Math.floor(mid.length / 2)] ?? st.lands[0];
    st.armies = [{
      id: 'shot-host', kingdomId: 'dai-viet', landId: land.id,
      units: { spearmen: ${men}, archers: 0, heavyInfantry: 0 },
      morale: 100, supplies: 100,
    }];
    scene.drawArmies();
    // Read the marker's own position rather than recomputing its anchor — the renderer applies its
    // own MARKER_OFFSET, and guessing it put the subject in the corner behind the zoom buttons.
    const marker = scene.children.list.find(o => o.depth === 70 && o.type === 'Container');
    if (!marker) return null;
    // Nudged so the block sits clear of the HUD strip and the zoom column.
    return { x: marker.x + 90, y: marker.y - 40, what: '${men} men' };
  `);
}

console.log(`console errors: ${errors.length}`);
errors.slice(0, 5).forEach((e) => console.log('  ', e));
console.log(`shots written to ${OUT}/`);
await browser.close();
