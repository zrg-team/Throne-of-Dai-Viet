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

export interface LifeSettings {
  /** Skeins of egrets crossing the map. */
  birds: boolean;
  /** How many carts and travellers each road carries. */
  traffic: TrafficDensity;
  /** Whether the year turns visibly: the seasonal wash, the blossom, the weather. */
  seasons: boolean;
}

const STORAGE_KEY = 'mandate:life:v1';

const DEFAULTS: LifeSettings = { birds: true, traffic: 'normal', seasons: true };

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
