/**
 * Timing. Everything in the film is a pure function of one number — the second the frame lands on
 * — so a frame can be drawn out of order, twice, or not at all, and comes out identical.
 *
 * There is deliberately no wall clock, no `requestAnimationFrame` accumulator and no tween manager
 * anywhere under `scripts/promo/`. The driver renders frame 900 by asking for t = 30.0, and if the
 * machine took four seconds to draw it the film does not notice.
 */

export const clamp01 = (value: number): number => (value < 0 ? 0 : value > 1 ? 1 : value);

/** 0 before `from`, 1 after `to`, linear between. The spine of every animation here. */
export const span = (t: number, from: number, to: number): number =>
  clamp01((t - from) / (to - from || 1));

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export const mix = (a: number, b: number, t: number): number => a + (b - a) * clamp01(t);

/** Ease in and out. The default for a camera — nothing in this film starts or stops abruptly. */
export const smooth = (t: number): number => {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
};

export const smoother = (t: number): number => {
  const x = clamp01(t);
  return x * x * x * (x * (x * 6 - 15) + 10);
};

/** Fast out of the gate, long settle. What a thing dropped onto paper does. */
export const outCubic = (t: number): number => 1 - (1 - clamp01(t)) ** 3;

export const outQuint = (t: number): number => 1 - (1 - clamp01(t)) ** 5;

export const inCubic = (t: number): number => clamp01(t) ** 3;

/** A seal coming down: overshoot, then one small bounce that settles. */
export const stamp = (t: number): number => {
  const x = clamp01(t);
  if (x >= 1) return 1;
  const settle = 1 - (1 - x) ** 4;
  return settle + Math.sin(x * Math.PI * 3) * (1 - x) ** 2 * 0.16;
};

/** Rises to 1 at the middle and falls back. For anything that flares and passes. */
export const arch = (t: number): number => Math.sin(clamp01(t) * Math.PI);

/** 1 while inside the window, 0 outside, with `fade` seconds of ramp on each end. */
export const window_ = (t: number, from: number, to: number, fade = 0.4): number =>
  Math.min(span(t, from, from + fade), 1 - span(t, to - fade, to));

/**
 * Staggered progress for the nth member of a crowd.
 *
 * `each` is how far apart in time two neighbours start; the whole crowd is finished `each * count`
 * after the first one begins. Used for ranks forming up, stakes going in, and the country flooding
 * red — anywhere the eye should read *sequence* rather than a group fading in together.
 */
export const stagger = (t: number, from: number, each: number, index: number, run: number): number =>
  span(t, from + index * each, from + index * each + run);

/** Colour blend on 0xRRGGBB, for washes that change with the hour. */
export const blend = (from: number, to: number, t: number): number => {
  const k = clamp01(t);
  const r = Math.round(((from >> 16) & 0xff) + ((((to >> 16) & 0xff) - ((from >> 16) & 0xff)) * k));
  const g = Math.round(((from >> 8) & 0xff) + ((((to >> 8) & 0xff) - ((from >> 8) & 0xff)) * k));
  const b = Math.round((from & 0xff) + (((to & 0xff) - (from & 0xff)) * k));
  return (r << 16) | (g << 8) | b;
};
