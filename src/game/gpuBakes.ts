import Phaser from 'phaser';
import { evictIdleStamps } from '../ui/ink/stamp';

/**
 * What the GPU forgot, redrawn.
 *
 * A restored WebGL context hands every wrapper a fresh, empty texture. Anything uploaded from
 * a canvas or an image re-uploads itself; anything that was *rendered* on the GPU — a
 * RenderTexture, a DynamicTexture — comes back blank, and Phaser 4 has no code of its own to
 * repaint them. The map's terrain and fog bakes learned this first (`MapScene.onContextRestored`)
 * and the ink stamps second (`stamp.ts`); the hero and card faces saved through `saveTexture`,
 * and the battle ground flattened under a fight, were still coming back as empty rectangles that
 * stayed empty for the rest of the session — the key still existed, so nothing rebuilt them.
 *
 * One registry, one listener. A bake registers the closure that can paint it again; the restore
 * runs every closure after Phaser has recreated the wrappers. Deferred by a beat so it lands
 * after the stamp registry's synchronous restamp, which the faces draw with.
 *
 * The same registry is where memory is handed back while the player is away: an idle stamp is
 * evicted on `hidden`, which is the cheapest way to make a backgrounded page a smaller target
 * for the phone's memory reaper — the very thing that kills a WebView process.
 */

const bakes = new Map<string, () => void>();
let hookedGame: Phaser.Game | undefined;
/** After Phaser's own wrapper recreation and after `stamp.ts` has restamped its pages. */
const RESTORE_DELAY_MS = 80;

function hook(game: Phaser.Game): void {
  if (hookedGame === game) return;
  hookedGame = game;
  const renderer = game.renderer as unknown as { on?: (event: string, fn: () => void) => void };
  renderer.on?.(Phaser.Renderer.Events.RESTORE_WEBGL, () => {
    window.setTimeout(redrawAll, RESTORE_DELAY_MS);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      try { evictIdleStamps(); } catch { /* a registry mid-teardown has nothing to give back */ }
    }
  });
}

/** Registers (or replaces) the closure that repaints one GPU-rendered texture. */
export function registerGpuBake(game: Phaser.Game, key: string, redraw: () => void): void {
  hook(game);
  bakes.set(key, redraw);
}

export function unregisterGpuBake(key: string): void {
  bakes.delete(key);
}

/** Runs every registered repaint. One that throws is logged and skipped; the rest still run. */
export function redrawAll(): void {
  for (const [key, redraw] of bakes) {
    try {
      redraw();
    } catch (error) {
      console.warn(`[gpuBakes] could not repaint ${key} after a context restore:`, error);
    }
  }
}

/** Test seam: how many bakes would be repainted. */
export function gpuBakeCount(): number {
  return bakes.size;
}
