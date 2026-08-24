import type Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from './constants';

/**
 * How much resolution and detail the game spends on a frame.
 *
 * The reason this exists is a measurement, not a preference. Phaser lays the game out in 390-wide
 * design units and, left alone, sizes the drawing buffer to match — so on a phone reporting a
 * device pixel ratio of 3 the canvas is 390x844 and the browser blows it up to 1170x2532 on the
 * way to the glass. Every contour in the game arrives at the eye through a 3x upscale. That is the
 * whole of "the graphics look bad on mobile": the art is fine, it is being shown at a third of the
 * resolution the screen can display.
 *
 * The fix is to render into a buffer the size of the actual screen, which costs fill rate
 * quadratically — 2x the scale is 4x the pixels. So it is a setting, with an honest default picked
 * from what the device says about itself, and the player can move it either way.
 */

export type GraphicsQuality = 'low' | 'medium' | 'high';

const STORAGE_KEY = 'mandate:graphics:v1';

export const GRAPHICS_QUALITIES: GraphicsQuality[] = ['low', 'medium', 'high'];

interface QualityProfile {
  /** Multiplier on the drawing buffer, before the device's own pixel ratio caps it. */
  readonly renderScale: number;
  /** Whether the full-screen paper pass runs. It is a fragment shader over every pixel drawn. */
  readonly paperFX: boolean;
  /** Multiplier on how many trees, tufts and figures the landscape scatters. */
  readonly scatter: number;
  /**
   * Resolution of the cached map textures, as a fraction of world size.
   *
   * The map holds two of these — the static terrain composite and the fog tint — and at full scale
   * over a 2244x3030 world they are about 27 MB each. Halving the scale quarters that. It used to be
   * picked by a device sniff of its own inside `MapScene`, with different thresholds from this file's,
   * so a player who chose Low still paid for a full-resolution map. One tier system, one answer.
   */
  readonly bakeScale: number;
  /**
   * Below this map zoom, the small live detail is dropped: name plates, ox-carts and travellers,
   * weather motes. `undefined` means never — a device with the fill rate to spare keeps everything.
   */
  readonly lodZoomBelow?: number;
  /** Whether the province name plates are among the things a zoomed-out view drops. */
  readonly lodDropsLabels: boolean;
}

const PROFILES: Record<GraphicsQuality, QualityProfile> = {
  // 1:1 with the design surface — what the game did before this existed.
  low: { renderScale: 1, paperFX: false, scatter: 0.6, bakeScale: 0.5, lodZoomBelow: 0.85, lodDropsLabels: true },
  medium: { renderScale: 2, paperFX: true, scatter: 1, bakeScale: 0.75, lodZoomBelow: 0.85, lodDropsLabels: false },
  // 3 is not a typo: it is the ratio of every current flagship phone, and anything above it is
  // spending fill rate on detail the panel cannot resolve.
  high: { renderScale: 3, paperFX: true, scatter: 1.25, bakeScale: 1, lodDropsLabels: false },
};

function devicePixelRatioSafe(): number {
  if (typeof window === 'undefined') {
    return 1;
  }
  return Math.max(1, window.devicePixelRatio || 1);
}

/**
 * How many buffer pixels one design unit needs on THIS display, right now.
 *
 * The FIT scaler stretches the canvas past its design size whenever the window is larger than
 * the design sheet - most desktop windows - and the display's pixel ratio multiplies that again.
 * Clamping the render scale to `devicePixelRatio` alone starved exactly that case: a 434-CSS-px
 * canvas on a DPR-2 display draws 2.23 physical px per design unit, the clamp handed the buffer
 * 2, and the whole game - text included - was upscaled soft. "High" that ships fewer pixels
 * than the glass has is not high.
 */
function displayNeed(): number {
  const ratio = devicePixelRatioSafe();
  if (typeof window === 'undefined' || !window.innerWidth || !window.innerHeight) {
    return ratio;
  }
  const stretch = Math.min(window.innerWidth / GAME_WIDTH, window.innerHeight / GAME_HEIGHT);
  return Math.max(1, stretch) * ratio;
}

/**
 * What to start a device on before the player has said anything.
 *
 * Deliberately conservative about the top tier. A phone that reports a high pixel ratio has told
 * us its screen is dense; it has not told us its GPU can fill that many pixels sixty times a
 * second, and `deviceMemory`/`hardwareConcurrency` are the only hints available for that. A player
 * on a fast device who wants more can raise it in one tap; a player whose game stutters on first
 * launch generally does not go looking for a menu.
 */
export function defaultGraphicsQuality(): GraphicsQuality {
  // Medium is the floor for a first impression. A low pixel ratio used to mean 'low', which put
  // every ordinary desktop monitor on the muddiest tier by default - but a weak GPU is what the
  // quality ladder exists to catch, and it steps down in seconds. Starting soft on strong
  // hardware is a first impression nothing can step back up.
  const nav = typeof navigator === 'undefined' ? undefined : (navigator as Navigator & { deviceMemory?: number });
  const cores = nav?.hardwareConcurrency ?? 4;
  const memory = nav?.deviceMemory ?? 4;
  return cores >= 8 && memory >= 8 ? 'high' : 'medium';
}

/**
 * Cached: `profile()` sits under `scatterDensity()`/`lodZoomThreshold()`, which run per paint and
 * per frame, and each call was a synchronous localStorage read. `setGraphicsQuality` is the only
 * writer (and today it reloads the page anyway), so the cache cannot go stale in a session.
 */
let cachedQuality: GraphicsQuality | undefined;

export function getGraphicsQuality(): GraphicsQuality {
  if (cachedQuality !== undefined) {
    return cachedQuality;
  }
  if (typeof localStorage === 'undefined') {
    return defaultGraphicsQuality();
  }
  const stored = localStorage.getItem(STORAGE_KEY);
  cachedQuality = GRAPHICS_QUALITIES.includes(stored as GraphicsQuality)
    ? (stored as GraphicsQuality)
    : defaultGraphicsQuality();
  return cachedQuality;
}

export function setGraphicsQuality(quality: GraphicsQuality): void {
  cachedQuality = quality;
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, quality);
  }
}

/**
 * The quality ladder's current rung, when one is standing in for the tier. The ladder sets it
 * (qualityLadder.ts); everything that reads `profile()` — scatter, LOD, bake scale, the paper
 * gate — follows the rung without knowing the ladder exists.
 */
interface RungProfileOverride {
  renderScale: number;
  paperFX: boolean;
  scatter: number;
  bakeScale: number;
  lodZoomBelow?: number;
  lodDropsLabels: boolean;
}

let activeRungProfile: RungProfileOverride | undefined;

export function setActiveRung(rung: { scale: number; paper: boolean; scatter: number; bakeScale: number; lodZoomBelow?: number; lodDropsLabels: boolean } | undefined): void {
  activeRungProfile = rung === undefined ? undefined : {
    renderScale: rung.scale, paperFX: rung.paper, scatter: rung.scatter,
    bakeScale: rung.bakeScale, lodZoomBelow: rung.lodZoomBelow, lodDropsLabels: rung.lodDropsLabels,
  };
}

function profile(): QualityProfile {
  return activeRungProfile ?? PROFILES[getGraphicsQuality()];
}

/**
 * The factor between design units and drawing-buffer pixels.
 *
 * Capped by the device's own ratio, because rendering above it is invisible by definition — the
 * extra samples have nowhere to land.
 */
export function renderScale(): number {
  // Rounded up so the buffer always meets or beats the glass; see `displayNeed`.
  return Math.min(profile().renderScale, Math.ceil(displayNeed()));
}

/** Whether the paper post-pass should run. The URL escape hatch still overrides this. */
export function wantsPaperFX(): boolean {
  return profile().paperFX;
}

/** Multiplier on landscape scatter counts. */
export function scatterDensity(): number {
  return profile().scatter;
}

/**
 * Resolution of the cached map textures, as a fraction of world size.
 *
 * `?bakescale=N` still overrides it, because A/B-ing the map's memory against its sharpness is a
 * thing worth being able to do without changing a setting and reloading.
 */
/** The `?bakescale=` override, read once — the URL cannot change under a running page. */
const BAKESCALE_OVERRIDE: number | undefined = (() => {
  if (typeof window === 'undefined') return undefined;
  const override = /[?&]bakescale=([0-9.]+)/.exec(window.location.search);
  return override ? Math.min(1, Math.max(0.25, parseFloat(override[1]))) : undefined;
})();

export function bakeScale(): number {
  if (BAKESCALE_OVERRIDE !== undefined) {
    return BAKESCALE_OVERRIDE;
  }
  const chosen = profile().bakeScale;

  // An explicit choice is honoured as given: a player who picked Low asked for the cheap map and
  // should get the memory back.
  const explicit = typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY) !== null;
  if (explicit) {
    return chosen;
  }

  // Auto-tiering is a different question, and reading the tier straight would answer it wrongly.
  // `defaultGraphicsQuality` returns 'low' whenever the pixel ratio is <= 1.25 — which is every
  // ordinary desktop monitor — and that is a statement about resolution, not about memory. Half
  // scale is visibly soft, so nothing is blurred on a guess unless the device says it is short of
  // memory, which is the signal this scale actually trades against.
  const nav = typeof navigator === 'undefined' ? undefined : (navigator as Navigator & { deviceMemory?: number });
  const memoryGb = nav?.deviceMemory; // Chromium only; undefined on Safari/Firefox
  if (memoryGb !== undefined && memoryGb <= 2) {
    return 0.5;
  }
  return Math.max(chosen, 0.75);
}

/** The map zoom below which small live detail is dropped, or `undefined` if this tier keeps it all. */
export function lodZoomThreshold(): number | undefined {
  return profile().lodZoomBelow;
}

/** Whether a zoomed-out view on this tier also drops the province name plates. */
export function lodDropsLabels(): boolean {
  return profile().lodDropsLabels;
}

/**
 * The render scale actually applied to the drawing buffer right now.
 *
 * It starts at the profile's answer and changes ONLY at `applyPendingRenderScale`, which runs at
 * scene boundaries — the buffer is resized and every camera re-zoomed in the same breath, so no
 * frame ever sees two answers. (`renderScale()` above stays the profile's *wish*; this is what
 * the buffer is doing.)
 */
let appliedScale = renderScale();
let pendingScale: number | undefined;

export function renderScaleNow(): number {
  return appliedScale;
}

/** Asks for a new buffer scale; nothing changes until a scene boundary applies it. */
export function requestRenderScale(scale: number): void {
  const wanted = Math.min(scale, Math.ceil(displayNeed()));
  pendingScale = wanted === appliedScale ? undefined : wanted;
}

export function pendingRenderScale(): number | undefined {
  return pendingScale;
}

const scaleListeners: Array<(scale: number) => void> = [];

/** Registers for live scale changes (the stamp registry evicts its old generation on one). */
export function subscribeRenderScale(fn: (scale: number) => void): void {
  scaleListeners.push(fn);
}

/**
 * Applies a requested scale at a scene boundary: resizes the FIT-mode buffer, refreshes the
 * global curve-detail floor, and tells the listeners. Returns whether anything changed. Every
 * camera must be re-zoomed after this — which scene `create()` does via `applyRenderScale`.
 */
export function applyPendingRenderScale(game: Phaser.Game): boolean {
  if (pendingScale === undefined) {
    return false;
  }
  const designWidth = game.scale.width / appliedScale;
  const designHeight = game.scale.height / appliedScale;
  appliedScale = pendingScale;
  pendingScale = undefined;
  game.scale.setGameSize(designWidth * appliedScale, designHeight * appliedScale);
  const rendererConfig = (game.renderer as unknown as { config?: { pathDetailThreshold?: number } }).config;
  if (rendererConfig && typeof rendererConfig.pathDetailThreshold === 'number') {
    rendererConfig.pathDetailThreshold = 2 * appliedScale;
  }
  for (const fn of scaleListeners) fn(appliedScale);
  // EVERY live scene, not just the ones about to run create(): a run kept alive behind the menu
  // (exit -> settings -> continue) wakes with whatever zoom it fell asleep at, and a stale zoom
  // on a resized buffer shows a magnified corner of the sheet. Measured on a player's screen
  // before it was measured here.
  for (const scene of game.scene.getScenes(false)) {
    try {
      applyRenderScale(scene);
    } catch { /* a scene mid-teardown has no camera to fix */ }
  }

  return true;
}

/**
 * Puts a scene's camera into design units.
 *
 * The game's drawing buffer is `RENDER_SCALE` times the 390-wide design surface, so without this a
 * scene would lay itself out across the top-left corner of it. With it, one design unit is
 * `RENDER_SCALE` buffer pixels and every existing layout number means what it always meant.
 */
export function applyRenderScale(scene: Phaser.Scene): void {
  const camera = scene.cameras.main;
  if (!camera) {
    return;
  }
  // Origin first, and it matters. A Phaser camera zooms about its own centre, so a camera the size
  // of the buffer zoomed by the render scale shows the middle of the design surface and pushes the
  // left-hand third off the edge — which is what a half-done version of this looked like: the
  // action bar sliding leftwards off screen as the scale went up. With the origin at the top-left,
  // one design unit is RENDER_SCALE pixels measured from 0,0, which is also the convention every
  // scroll clamp in MapScene was already written against.
  camera.setOrigin(0, 0);
  camera.setZoom(renderScaleNow());
  makeTextCrisp(scene);
}

/**
 * Rasterises every label at the resolution it will actually be shown at.
 *
 * Phaser draws a `Text` by rendering the string into its own canvas texture at the font's size in
 * **design** units, and the camera above then magnifies that texture by `RENDER_SCALE`. So the one
 * setting that exists to make the game sharper was making the interface blurrier: at `low` the
 * camera is 1:1 and every label is pixel-crisp, while at `high` each one is a 1× bitmap blown up
 * three times. Text was the only thing on screen that got *worse* as quality went up — vectors,
 * being redrawn per frame, were unaffected, which is why it read as "the buttons look bad" rather
 * than as a resolution problem.
 *
 * `resolution` is per-`Text` and has to be set at construction — changing it afterwards re-renders
 * at the old size — so the factory is wrapped once per scene rather than the two hundred call sites
 * being edited, which is also the only way a call site added later cannot forget.
 */
function makeTextCrisp(scene: Phaser.Scene): void {
  const factory = scene.add as Phaser.GameObjects.GameObjectFactory & { __crispText?: boolean };
  if (factory.__crispText) {
    return;
  }
  factory.__crispText = true;

  const originalText = factory.text.bind(factory);
  // `renderScaleNow()` at CALL time, so a label built after a live scale change rasterises
  // at the resolution the buffer actually has.
  factory.text = (x, y, text, style) => originalText(x, y, text, { resolution: renderScaleNow(), ...style });
}

/**
 * A pointer's position in design units.
 *
 * Phaser reports pointer coordinates in the drawing buffer's space, which carries the render
 * scale. Every hit test in this game is written against the 390-wide design surface, so comparing
 * a raw pointer against one silently reads as "somewhere off the bottom right" as soon as the
 * scale is above 1 — which is how panning the map stopped working the moment the buffer grew.
 */
export function designPointer(pointer: { x: number; y: number }): { x: number; y: number } {
  return { x: pointer.x / renderScaleNow(), y: pointer.y / renderScaleNow() };
}

/** A pointer distance in design units. */
export function designLength(value: number): number {
  return value / renderScaleNow();
}

/**
 * Correction on hand-drawn contour widths, so a line carries the same weight at every quality.
 *
 * At `low` the game draws into a 390-wide buffer and the browser stretches it to the panel — so a
 * 1.2-unit contour is rasterised across a pixel or two and then blown up three times, arriving as a
 * soft band far heavier than 1.2 units of ink. At `high` the buffer is the size of the panel and
 * the same contour lands crisp and exactly as wide as it says.
 *
 * Every ink weight in this game was tuned by eye against the blurred version, because that is what
 * the art was drawn on. Rendering it honestly therefore made the game look *worse* the moment the
 * quality went up: the cards lost their outline, and what was reported as "high quality loses the
 * borders" was the borders finally being drawn at the width they had always claimed.
 *
 * Two ways out, and only one of them is honest. Thinning `low` would match them by making the
 * cheap setting worse. This widens the crisp one instead, so the contour arrives at the eye at the
 * weight the drawing was composed for — the blur is the artefact, and the weight is the intent.
 *
 * Tuned down from 1.55, which over-corrected: matching the *mass* of the blurred line made the
 * crisp one hard and heavy, because a smear and a solid stroke of the same area do not read alike.
 * A little over life is enough to carry the weight; the rest was the blur's softness, which is not
 * something a wider line can supply.
 */
export function inkWeight(): number {
  return renderScaleNow() <= 1 ? 1 : 1.22;
}
