/**
 * InkStamp: live ink baked once, placed many times.
 *
 * The frame ledger measured where the game's frames go: Phaser 4 replays a live `Graphics`
 * object's whole command list every frame — an earcut triangulation per fill, a quad per stroke
 * segment, a `Point` allocation per vertex — so a screen holding hundreds of drawn figures pays
 * for all of their geometry sixty times a second to show pixels that never change. Baking a
 * drawing into a texture once and placing images of it turns that per-frame geometry cost into
 * per-frame quads, which is what a GPU is for.
 *
 * `bakeProp` (sprites.ts) proved the pattern on the buffalo herd; this module is the same idea
 * with a registry around it: physical keys carry the render scale, stamps carry refcounts so
 * idle textures can be evicted at scene boundaries, pools carry byte caps so a wardrobe of
 * figure variants cannot grow unbounded, and a context-loss hook re-stamps what the GPU forgot.
 *
 * Two backends:
 *  - **canvas** (default): `Graphics.generateTexture` — one texture per stamp, rasterised through
 *    the browser's Canvas API. Context-loss-safe for free (canvas sources re-upload themselves).
 *  - **atlas** (`?stamp=atlas`): shelf-packed DynamicTexture pages, so many stamps share one
 *    texture and stay in one draw-call batch. Pages die with the GL context and are re-stamped
 *    from the retained draw closures on RESTORE_WEBGL.
 *
 * `stampDesign` is the exception to the canvas route: it takes draws in *design units* and scales
 * the Graphics object, which `generateTexture`'s canvas rasteriser does not honour — so it always
 * renders through a (transform-respecting) DynamicTexture, one per stamp.
 */
import Phaser from 'phaser';
import { getGraphicsQuality, renderScaleNow, subscribeRenderScale } from '../../game/graphicsQuality';
import { whileRasterising } from './proportion';
import { ShelfPacker, type ShelfRect } from './shelfPacker';

type G = Phaser.GameObjects.Graphics;

export type StampRaster = 'super' | 'plain';
export type StampPool = 'figure' | 'prop' | 'ui' | 'world';

/** The box a stamp occupies around its anchor, in design units. Same contract as `PropBox`. */
export interface StampBox { left: number; right: number; top: number; bottom: number }

export interface StampOptions {
  /** Texels per design unit: 'super' = renderScale×2 (small things leaned into), 'plain' = renderScale×1 (large surfaces). */
  raster?: StampRaster;
  /** Which byte budget this stamp counts against, and which boundary evicts it. */
  pool?: StampPool;
  /** Extra design units of margin on every side, for ink wobble the box didn't count. */
  pad?: number;
}

export interface Stamp {
  /** Physical registry key (`logical@renderScale`). */
  key: string;
  /** Texture key to hand `setTexture` — the stamp's own under canvas, the page's under atlas. */
  texture: string;
  /** Frame within `texture`, set only under the atlas backend. */
  frame?: string;
  originX: number;
  originY: number;
  /** Scale that returns the raster to design units. */
  scale: number;
  /** Texture pixels. */
  width: number;
  height: number;
}

/**
 * The draw contract, inherited verbatim from `bakeProp`: the anchor position arrives already in
 * raster pixels and `raster` is the factor to multiply the drawing's own scale by — geometry is
 * handed over pre-scaled because the canvas rasteriser ignores object transforms.
 */
export type StampDraw = (g: G, x: number, y: number, raster: number) => void;

export interface StampStats {
  backend: 'canvas' | 'atlas';
  count: number;
  /** GPU bytes: 4 B/px per canvas stamp, 8 B/px per dynamic texture and atlas page (colour + the depth-stencil every DynamicTexture carries). */
  bytes: number;
  cpuBytes: number;
  pages: number;
  pools: Record<StampPool, number>;
  evictions: number;
  restamps: number;
  keys: () => string[];
}

/**
 * Data key carrying an object's own scale, so anything that flips it — facing, a walk —
 * multiplies by that rather than overwriting it. A stamp is drawn at raster size and scaled down
 * to design units; `setScale(-1, 1)` on one of those would show it several times the size, mirrored.
 */
export const BASE_SCALE_KEY = 'baseScale';

// ── Registry ────────────────────────────────────────────────────────────────

interface Entry {
  stamp: Stamp;
  box: StampBox;
  draw: StampDraw;
  raster: number;
  pool: StampPool;
  pad: number;
  refs: number;
  lastUse: number;
  bytes: number;
  backend: 'canvas' | 'atlas' | 'dynamic';
  page?: AtlasPage;
  rect?: ShelfRect;
}

interface AtlasPage {
  key: string;
  dt: Phaser.Textures.DynamicTexture;
  packer: ShelfPacker;
  keys: Set<string>;
}

const entries = new Map<string, Entry>();
const pages: AtlasPage[] = [];
const stats = { evictions: 0, restamps: 0, overCap: 0 };
let textures: Phaser.Textures.TextureManager | undefined;
let restoreHooked = false;

const PAGE_SIZE = 1024;
const PAGE_CAP: Record<ReturnType<typeof getGraphicsQuality>, number> = { low: 1, medium: 2, high: 3 };
/** MB per pool at low / medium / high. */
const POOL_CAPS: Record<StampPool, [number, number, number]> = {
  figure: [6, 12, 24], ui: [3, 6, 12], prop: [2, 4, 8], world: [2, 4, 8],
};

function query(name: string): string | undefined {
  try {
    return new URLSearchParams(window.location.search).get(name) ?? undefined;
  } catch {
    return undefined;
  }
}

let backendChoice: 'canvas' | 'atlas' | undefined;
function backend(): 'canvas' | 'atlas' {
  if (backendChoice === undefined) {
    const asked = query('stamp') ?? (() => {
      try { return localStorage.getItem('mandate:ink-stamp:v1') ?? undefined; } catch { return undefined; }
    })();
    backendChoice = asked === 'atlas' ? 'atlas' : 'canvas';
  }
  return backendChoice;
}

/** `?nostamp=1` — the rollback switch; consumers that can fall back to live ink consult this. */
export function stampsEnabled(): boolean {
  return query('nostamp') !== '1';
}

/** Texels per design unit for a raster tier, at the current render scale. */
export function rasterScale(raster: StampRaster = 'super'): number {
  const s = renderScaleNow();
  return raster === 'super' ? s * 2 : s;
}

function hookLifecycle(scene: Phaser.Scene): void {
  textures ??= scene.textures;
  if (restoreHooked) return;
  restoreHooked = true;
  // Canvas-backed textures survive a context loss (the browser re-uploads them); everything
  // rendered on the GPU — atlas pages, per-stamp dynamic textures — comes back black and must be
  // re-stamped from the retained draw closures.
  const renderer = scene.game.renderer as unknown as { on?: (ev: string, fn: () => void) => void };
  renderer.on?.(Phaser.Renderer.Events.RESTORE_WEBGL, restampGpuBacked);
}

function boxSize(box: StampBox, pad: number): { w: number; h: number } {
  return { w: box.right - box.left + pad * 2, h: box.bottom - box.top + pad * 2 };
}

function makeStamp(key: string, texture: string, frame: string | undefined, box: StampBox,
  pad: number, raster: number, width: number, height: number): Stamp {
  const { w, h } = boxSize(box, pad);
  return {
    key, texture, frame,
    originX: (-box.left + pad) / w,
    originY: (-box.top + pad) / h,
    scale: 1 / raster,
    width, height,
  };
}

function drawIntoGraphics(scene: Phaser.Scene, box: StampBox, pad: number,
  raster: number, draw: StampDraw): G {
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  whileRasterising(raster, () => draw(g, (-box.left + pad) * raster, (-box.top + pad) * raster, raster));
  return g;
}

// ── The core ────────────────────────────────────────────────────────────────

/**
 * Bakes one drawing into a texture, or returns the existing bake. The physical key carries the
 * render scale, so a live-scale change (M8's quality ladder) naturally re-stamps at the new
 * resolution and the old generation ages out through the idle eviction.
 */
export function stamp(
  scene: Phaser.Scene,
  key: string,
  box: StampBox,
  draw: StampDraw,
  opts: StampOptions = {},
): Stamp {
  hookLifecycle(scene);
  const raster = rasterScale(opts.raster ?? 'super');
  const pool = opts.pool ?? 'prop';
  const pad = opts.pad ?? 0;
  const physKey = `${key}@${renderScaleNow()}`;

  const existing = entries.get(physKey);
  if (existing) {
    existing.lastUse = Date.now();
    return existing.stamp;
  }

  const { w, h } = boxSize(box, pad);
  const width = Math.ceil(w * raster);
  const height = Math.ceil(h * raster);

  // A texture that exists without an entry (an HMR re-evaluation of this module, a bake from a
  // previous scene generation) is adopted rather than re-rasterised.
  if (scene.textures.exists(physKey)) {
    const st = makeStamp(physKey, physKey, undefined, box, pad, raster, width, height);
    entries.set(physKey, {
      stamp: st, box, draw, raster, pool, pad, refs: 0, lastUse: Date.now(),
      bytes: width * height * 4, backend: 'canvas',
    });
    return st;
  }

  if (backend() === 'atlas') {
    const placed = stampOntoPage(scene, physKey, box, pad, raster, width, height, draw, pool);
    if (placed) return placed;
    // Full pages and page cap reached — fall through to a plain canvas bake.
  }

  const g = drawIntoGraphics(scene, box, pad, raster, draw);
  g.generateTexture(physKey, width, height);
  g.destroy();
  const st = makeStamp(physKey, physKey, undefined, box, pad, raster, width, height);
  entries.set(physKey, {
    stamp: st, box, draw, raster, pool, pad, refs: 0, lastUse: Date.now(),
    bytes: width * height * 4, backend: 'canvas',
  });
  enforcePoolCap(pool);
  return st;
}

function stampOntoPage(scene: Phaser.Scene, physKey: string, box: StampBox, pad: number,
  raster: number, width: number, height: number, draw: StampDraw, pool: StampPool): Stamp | undefined {
  // 1-px gutters so linear filtering never bleeds a neighbour into the stamp's edge.
  const need = { w: width + 2, h: height + 2 };
  if (need.w > PAGE_SIZE || need.h > PAGE_SIZE) return undefined;
  let page: AtlasPage | undefined;
  let rect: ShelfRect | undefined;
  for (const p of pages) {
    const r = p.packer.allocate(need.w, need.h);
    if (r) { page = p; rect = r; break; }
  }
  if (!page) {
    if (pages.length >= PAGE_CAP[getGraphicsQuality()]) {
      // Reclaim: a page whose stamps are all idle can be rebuilt without them.
      const idle = pages.find((p) => [...p.keys].every((k) => (entries.get(k)?.refs ?? 0) === 0));
      if (idle) {
        for (const k of idle.keys) { entries.delete(k); stats.evictions += 1; }
        idle.keys.clear();
        idle.packer.reset();
        idle.dt.clear();
        rect = idle.packer.allocate(need.w, need.h) ?? undefined;
        if (rect) page = idle;
      }
      if (!page) return undefined;
    } else {
      // Probe for a free key rather than assuming `pages.length` names one: a second instance
      // of this module (vite HMR serves `?t=` URLs alongside the plain one) or a texture left
      // by a previous scene generation would otherwise collide - and Phaser's addDynamicTexture,
      // handed an existing string key, misreads it as a texture object and errors on key
      // `undefined` while returning null.
      let pageIndex = pages.length;
      while (scene.textures.exists(`ink-page-${pageIndex}`)) pageIndex += 1;
      const pageKey = `ink-page-${pageIndex}`;
      const dt = scene.textures.addDynamicTexture(pageKey, PAGE_SIZE, PAGE_SIZE);
      if (!dt) return undefined;
      page = { key: pageKey, dt, packer: new ShelfPacker(PAGE_SIZE, PAGE_SIZE), keys: new Set() };
      pages.push(page);
      rect = page.packer.allocate(need.w, need.h) ?? undefined;
      if (!rect) return undefined;
    }
  }
  if (!rect) return undefined;

  const g = drawIntoGraphics(scene, box, pad, raster, draw);
  page.dt.draw(g, rect.x + 1, rect.y + 1);
  // Phaser 4 buffers the draw; `render` executes it — before the source Graphics is destroyed.
  page.dt.render();
  g.destroy();
  page.dt.add(physKey, 0, rect.x + 1, rect.y + 1, width, height);
  page.keys.add(physKey);

  const st = makeStamp(physKey, page.key, physKey, box, pad, raster, width, height);
  entries.set(physKey, {
    stamp: st, box, draw, raster, pool, pad, refs: 0, lastUse: Date.now(),
    bytes: 0, // page bytes are accounted per page, not per stamp
    backend: 'atlas', page, rect,
  });
  return st;
}

/**
 * Design-unit variant for UI surfaces: `draw` works in design units around the anchor and this
 * module applies the raster by scaling the Graphics *object* — which only a transform-respecting
 * render target honours, so this always renders through a per-stamp DynamicTexture (re-stamped on
 * context restore). Never for props: the `unitScale` probe must see prop draws go through
 * `whileRasterising`, which this path does not.
 */
export function stampDesign(
  scene: Phaser.Scene,
  key: string,
  box: StampBox,
  draw: (g: G, x: number, y: number) => void,
  opts: Omit<StampOptions, 'raster'> & { raster?: StampRaster } = {},
): Stamp {
  hookLifecycle(scene);
  const raster = rasterScale(opts.raster ?? 'plain');
  const pool = opts.pool ?? 'ui';
  const pad = opts.pad ?? 0;
  const physKey = `${key}@${renderScaleNow()}`;

  const existing = entries.get(physKey);
  if (existing) {
    existing.lastUse = Date.now();
    return existing.stamp;
  }

  const { w, h } = boxSize(box, pad);
  const width = Math.ceil(w * raster);
  const height = Math.ceil(h * raster);

  let dt = scene.textures.exists(physKey)
    ? scene.textures.get(physKey) as unknown as Phaser.Textures.DynamicTexture
    : scene.textures.addDynamicTexture(physKey, width, height);
  if (!dt || !(dt as { isDrawing?: unknown; draw?: unknown }).draw) {
    // The key exists but is not a DynamicTexture (a stale canvas bake): replace it.
    scene.textures.remove(physKey);
    dt = scene.textures.addDynamicTexture(physKey, width, height)!;
  }
  renderDesign(scene, dt, box, pad, raster, draw);

  const st = makeStamp(physKey, physKey, undefined, box, pad, raster, width, height);
  entries.set(physKey, {
    stamp: st, box, draw: draw as unknown as StampDraw, raster, pool, pad, refs: 0, lastUse: Date.now(),
    bytes: width * height * 8, backend: 'dynamic',
  });
  enforcePoolCap(pool);
  return st;
}

function renderDesign(scene: Phaser.Scene, dt: Phaser.Textures.DynamicTexture,
  box: StampBox, pad: number, raster: number, draw: (g: G, x: number, y: number) => void): void {
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  draw(g, -box.left + pad, -box.top + pad);
  g.setScale(raster);
  dt.clear();
  dt.draw(g, 0, 0);
  dt.render();
  g.destroy();
}

/**
 * The stamp's texture, guaranteed live: if it was removed while a caller still held the `Stamp`
 * (an eviction racing a cached handle, a hot-reload generation), the retained draw closure
 * re-bakes it in place. The check is one Map lookup per placement; the heal almost never runs -
 * but the alternative is Phaser's green-crossed missing-texture box in the player's face.
 */
function ensureLive(scene: Phaser.Scene, st: Stamp): void {
  if (scene.textures.exists(st.texture)) return;
  const e = entries.get(st.key);
  if (!e) return;
  if (e.backend === 'dynamic') {
    const dt = scene.textures.addDynamicTexture(st.texture, st.width, st.height);
    if (dt) renderDesign(scene, dt, e.box, e.pad, e.raster, e.draw as unknown as (g: G, x: number, y: number) => void);
  } else {
    const g = drawIntoGraphics(scene, e.box, e.pad, e.raster, e.draw);
    g.generateTexture(st.texture, st.width, st.height);
    g.destroy();
  }
  stats.restamps += 1;
}

/**
 * One instance of a stamp, positioned by its anchor and sized back into design units. Refcounted:
 * the stamp stays resident while any placed image lives, and `evictIdleStamps` may reclaim it
 * after the last one is destroyed.
 */
export function placeStamp(
  scene: Phaser.Scene,
  st: Stamp,
  x: number,
  y: number,
  scale = 1,
): Phaser.GameObjects.Image {
  ensureLive(scene, st);
  const size = st.scale * scale;
  const image = scene.add.image(x, y, st.texture, st.frame)
    .setOrigin(st.originX, st.originY)
    .setScale(size)
    .setData(BASE_SCALE_KEY, size)
    // Provenance, so a missing-texture box on screen can name the stamp that let it down.
    .setData('stampKey', st.key);
  const entry = entries.get(st.key);
  if (entry) {
    entry.refs += 1;
    entry.lastUse = Date.now();
    // Decrement whatever stamp the image holds WHEN it dies, not the one it was born with:
    // `applyStamp` swaps the texture and moves the count with it.
    image.once(Phaser.GameObjects.Events.DESTROY, () => {
      const held = entries.get(image.getData('stampKey') as string) ?? entry;
      held.refs = Math.max(0, held.refs - 1);
      held.lastUse = Date.now();
    });
  }
  return image;
}

/**
 * Swaps an existing image onto a stamp (a wing beat, a pressed button, a meter frame) without
 * touching its position or its facing — the horizontal flip sign survives the scale write.
 */
export function applyStamp(image: Phaser.GameObjects.Image, st: Stamp, scale = 1): void {
  ensureLive(image.scene, st);
  // The refcount follows the swap. Without this, a mote turned to petals, a chip flipped to its
  // held face, a button to its pressed state - every swapped image DISPLAYED a texture whose
  // count still sat on the stamp it was born with, so the pool cap saw the visible one as idle
  // and evicted it mid-scene: Phaser's green-crossed missing-texture box, on screen, in a
  // player's founder pick. Only tracked images (placed via `placeStamp`) transfer.
  const prevKey = image.getData('stampKey') as string | undefined;
  if (prevKey !== undefined && prevKey !== st.key) {
    const prev = entries.get(prevKey);
    if (prev) {
      prev.refs = Math.max(0, prev.refs - 1);
      prev.lastUse = Date.now();
      const next = entries.get(st.key);
      if (next) next.refs += 1;
    }
  }
  if (image.texture.key !== st.texture || (st.frame !== undefined && image.frame.name !== st.frame)) {
    image.setTexture(st.texture, st.frame);
  }
  if (image.originX !== st.originX || image.originY !== st.originY) {
    image.setOrigin(st.originX, st.originY);
  }
  const base = st.scale * scale;
  const sign = image.scaleX < 0 ? -1 : 1;
  image.setScale(base * sign, base);
  image.setData(BASE_SCALE_KEY, base);
  image.setData('stampKey', st.key);
  const entry = entries.get(st.key);
  if (entry) entry.lastUse = Date.now();
}

/** Pre-bakes a stamp so its raster cost lands at a loading boundary, not under a finger. */
export function warmStamp(scene: Phaser.Scene, key: string, box: StampBox,
  draw: StampDraw, opts?: StampOptions): void {
  void stamp(scene, key, box, draw, opts);
}

// ── Budget and lifecycle ────────────────────────────────────────────────────

function qualityIndex(): 0 | 1 | 2 {
  const q = getGraphicsQuality();
  return q === 'low' ? 0 : q === 'medium' ? 1 : 2;
}

function poolBytes(pool: StampPool): number {
  let sum = 0;
  for (const e of entries.values()) {
    if (e.pool === pool) sum += e.bytes;
  }
  return sum;
}

function dropEntry(key: string, entry: Entry): void {
  entries.delete(key);
  stats.evictions += 1;
  if (entry.backend === 'atlas') {
    entry.page?.keys.delete(key);
    // The shelf space itself is reclaimed only when the whole page goes idle (see stampOntoPage);
    // freeing single rects would need a real allocator for no measured benefit.
    return;
  }
  textures?.remove(entry.stamp.texture);
}

/**
 * The pool cap is a boundary policy, never a mid-scene act.
 *
 * This used to evict refs-0 textures the moment a pool crossed its cap - and twice shipped
 * Phaser's green-crossed missing-texture box onto a live screen (a founder-page button, a fog
 * cloud), because "refs 0" and "not on screen" are only the same thing when every consumer's
 * count is perfect, and one imperfect count is all it takes. Mid-scene, nothing is reclaimed:
 * the overshoot is noted and the render-scale boundary sweep (`notifyRenderScale` ->
 * `evictIdleStamps`) - where scenes are being torn down anyway and `ensureLive` re-bakes any
 * survivor - is the one place textures die.
 */
function enforcePoolCap(pool: StampPool): void {
  const cap = POOL_CAPS[pool][qualityIndex()] * 1024 * 1024;
  if (poolBytes(pool) > cap) stats.overCap += 1;
}

/**
 * Reclaims every unreferenced stamp (optionally in one pool). Scene boundaries only — a stamp
 * evicted mid-frame while an image still shows it is a black square.
 */
export function evictIdleStamps(pool?: StampPool): number {
  let dropped = 0;
  for (const [key, e] of [...entries.entries()]) {
    if (e.refs === 0 && (pool === undefined || e.pool === pool)) {
      dropEntry(key, e);
      dropped += 1;
    }
  }
  // Pages whose stamps have all been dropped can hand their memory back too.
  for (const page of pages) {
    if (page.keys.size === 0) {
      page.packer.reset();
      page.dt.clear();
    }
  }
  return dropped;
}

function restampGpuBacked(): void {
  const scene = findScene();
  if (!scene) return;
  for (const page of pages) {
    page.dt.clear();
  }
  for (const e of entries.values()) {
    if (e.backend === 'canvas') continue;
    stats.restamps += 1;
    if (e.backend === 'dynamic') {
      const dt = scene.textures.get(e.stamp.texture) as unknown as Phaser.Textures.DynamicTexture;
      renderDesign(scene, dt, e.box, e.pad, e.raster, e.draw as unknown as (g: G, x: number, y: number) => void);
    } else if (e.backend === 'atlas' && e.page && e.rect) {
      const g = drawIntoGraphics(scene, e.box, e.pad, e.raster, e.draw);
      e.page.dt.draw(g, e.rect.x + 1, e.rect.y + 1);
      g.destroy();
    }
  }
  for (const page of pages) {
    page.dt.render();
  }
}

function findScene(): Phaser.Scene | undefined {
  const game = (window as { __phaserGame?: Phaser.Game }).__phaserGame;
  return game?.scene.getScenes(true)[0];
}

// ── Render-scale plumbing (armed fully in the quality-ladder milestone) ─────

// Stamps of the old generation carry the old scale in their physical keys: on a live scale
// change they go idle and are evicted here, and the next atlas stamp starts on fresh shelves.
// (The listener registry lives in graphicsQuality — this module already imports from it, and
// the other direction would be a cycle.)
subscribeRenderScale(() => {
  evictIdleStamps();
});

// ── Introspection ───────────────────────────────────────────────────────────

export function stampStats(): StampStats {
  let bytes = 0;
  let cpuBytes = 0;
  const pools: Record<StampPool, number> = { figure: 0, prop: 0, ui: 0, world: 0 };
  for (const e of entries.values()) {
    bytes += e.bytes;
    pools[e.pool] += e.bytes;
    if (e.backend === 'canvas') cpuBytes += e.bytes;
  }
  // A DynamicTexture page carries a depth-stencil attachment: 8 B/px, not 4.
  bytes += pages.length * PAGE_SIZE * PAGE_SIZE * 8;
  return {
    backend: backend(),
    count: entries.size,
    bytes,
    cpuBytes,
    pages: pages.length,
    pools,
    evictions: stats.evictions,
    restamps: stats.restamps,
    keys: () => [...entries.keys()],
  };
}
