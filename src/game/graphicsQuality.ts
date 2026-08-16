import type Phaser from 'phaser';

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
}

const PROFILES: Record<GraphicsQuality, QualityProfile> = {
  // 1:1 with the design surface — what the game did before this existed.
  low: { renderScale: 1, paperFX: false, scatter: 0.6 },
  medium: { renderScale: 2, paperFX: true, scatter: 1 },
  // 3 is not a typo: it is the ratio of every current flagship phone, and anything above it is
  // spending fill rate on detail the panel cannot resolve.
  high: { renderScale: 3, paperFX: true, scatter: 1.25 },
};

function devicePixelRatioSafe(): number {
  if (typeof window === 'undefined') {
    return 1;
  }
  return Math.max(1, window.devicePixelRatio || 1);
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
  const ratio = devicePixelRatioSafe();
  if (ratio <= 1.25) {
    return 'low';
  }
  const nav = typeof navigator === 'undefined' ? undefined : (navigator as Navigator & { deviceMemory?: number });
  const cores = nav?.hardwareConcurrency ?? 4;
  const memory = nav?.deviceMemory ?? 4;
  return cores >= 8 && memory >= 8 ? 'high' : 'medium';
}

export function getGraphicsQuality(): GraphicsQuality {
  if (typeof localStorage === 'undefined') {
    return defaultGraphicsQuality();
  }
  const stored = localStorage.getItem(STORAGE_KEY);
  return GRAPHICS_QUALITIES.includes(stored as GraphicsQuality) ? (stored as GraphicsQuality) : defaultGraphicsQuality();
}

export function setGraphicsQuality(quality: GraphicsQuality): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, quality);
  }
}

function profile(): QualityProfile {
  return PROFILES[getGraphicsQuality()];
}

/**
 * The factor between design units and drawing-buffer pixels.
 *
 * Capped by the device's own ratio, because rendering above it is invisible by definition — the
 * extra samples have nowhere to land.
 */
export function renderScale(): number {
  return Math.min(profile().renderScale, devicePixelRatioSafe());
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
 * The render scale fixed for this session.
 *
 * Read once: the drawing buffer is sized at boot and every camera divides by the same number, so a
 * value that could change under them mid-frame would only ever be a bug. Changing the setting
 * reloads the page.
 */
export const RENDER_SCALE = renderScale();

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
  camera.setZoom(RENDER_SCALE);
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
  factory.text = (x, y, text, style) => originalText(x, y, text, { resolution: RENDER_SCALE, ...style });
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
  return { x: pointer.x / RENDER_SCALE, y: pointer.y / RENDER_SCALE };
}

/** A pointer distance in design units. */
export function designLength(value: number): number {
  return value / RENDER_SCALE;
}
