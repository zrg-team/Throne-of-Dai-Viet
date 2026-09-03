/**
 * How much *life* the map carries, as a player setting.
 *
 * Distinct from `graphicsQuality`, which decides how many pixels a frame is drawn into. This
 * decides how many things are moving in it: birds crossing the sky, carts and travellers on the
 * roads, the year turning under the paper. Each of those is a live object with a tween attached,
 * and on a modest phone a busy map is a hundred of them ticking at once — which is a different
 * cost from fill rate, and one a resolution slider cannot answer.
 *
 * It is also a taste setting and not only a performance one. A player who finds the flapping
 * distracting should be able to still the map without dropping it to a 1x buffer.
 *
 * Read at spawn time, not per frame: nothing here is consulted in a hot loop, and changing a
 * setting restarts the scene that owns the props it governs.
 */

export type TrafficDensity = 'none' | 'few' | 'normal' | 'busy';

export const TRAFFIC_DENSITIES: TrafficDensity[] = ['none', 'few', 'normal', 'busy'];

export type MotionLevel = 'full' | 'reduced';

export const MOTION_LEVELS: MotionLevel[] = ['full', 'reduced'];

export interface LifeSettings {
  /** Skeins of egrets crossing the map. */
  birds: boolean;
  /** How many carts and travellers each road carries. */
  traffic: TrafficDensity;
  /** Whether the year turns visibly: the seasonal wash, the blossom, the weather. */
  seasons: boolean;
  /**
   * How much the interface itself moves. `reduced` cuts every choreographed duration to a beat
   * (`motionMs`) and replaces the ceremony's pour with a cut — the reign-end sequence is where
   * a setting like this became necessary, since a nine-second passage a player cannot shorten is
   * a toll on the twentieth run and a hazard for anyone motion-sensitive.
   */
  motion: MotionLevel;
}

const STORAGE_KEY = 'mandate:life:v1';

const DEFAULTS: LifeSettings = { birds: true, traffic: 'normal', seasons: true, motion: 'full' };

/** The longest a reduced-motion tween may run. Under it, motion reads as a change, not a passage. */
const REDUCED_MOTION_MS = 120;

/** Travellers and carts per road, by setting. `none` retires them entirely. */
const TRAFFIC_PER_ROAD: Record<TrafficDensity, { travellers: number; carts: number }> = {
  none: { travellers: 0, carts: 0 },
  few: { travellers: 1, carts: 0 },
  normal: { travellers: 2, carts: 1 },
  busy: { travellers: 3, carts: 1 },
};

let cached: LifeSettings | undefined;

function read(): LifeSettings {
  if (cached) {
    return cached;
  }
  cached = { ...DEFAULTS };
  if (typeof localStorage === 'undefined') {
    return cached;
  }
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<LifeSettings>;
    if (typeof stored.birds === 'boolean') cached.birds = stored.birds;
    if (typeof stored.seasons === 'boolean') cached.seasons = stored.seasons;
    if (stored.traffic && TRAFFIC_DENSITIES.includes(stored.traffic)) cached.traffic = stored.traffic;
    if (stored.motion && MOTION_LEVELS.includes(stored.motion)) cached.motion = stored.motion;
  } catch {
    // A corrupt entry is a defaulted entry. Nothing here is worth failing a boot over.
  }
  return cached;
}

export function getLifeSettings(): LifeSettings {
  return { ...read() };
}

export function setLifeSettings(patch: Partial<LifeSettings>): void {
  const next = { ...read(), ...patch };
  cached = next;
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }
}

/** How many travellers and carts a single road should carry. */
export function trafficPerRoad(): { travellers: number; carts: number } {
  return TRAFFIC_PER_ROAD[read().traffic];
}

export function birdsEnabled(): boolean {
  return read().birds;
}

export function seasonsEnabled(): boolean {
  return read().seasons;
}

export function reducedMotion(): boolean {
  return read().motion === 'reduced';
}

/**
 * A choreographed duration, honouring the motion setting: the full length, or the reduced beat.
 * Every tween in the dynasty page and the reign-end sequence asks this rather than a literal.
 */
export function motionMs(fullMs: number): number {
  return read().motion === 'reduced' ? Math.min(REDUCED_MOTION_MS, fullMs) : fullMs;
}
