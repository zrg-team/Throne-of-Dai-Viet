/**
 * The quality ladder: measure the frames the device actually delivers, and move the rung.
 *
 * Two clocks are watched per frame: `step` (PRE_STEP → POST_RENDER, what the game costs) and
 * `gap` (`game.loop.rawDelta`, what the player experiences — it includes everything the browser
 * did between frames). Windows close every ~2.5 s of gap time; a window whose p95 gap runs hot
 * against the budget counts toward a step down, a window that is calm on BOTH clocks counts
 * toward a step up. Hysteresis on both sides, a cap of two steps per session in each direction,
 * and a rung left twice is never climbed back into — the device already said no.
 *
 * What a rung changes immediately: the paper sheet's visibility, the fps limit, the LOD/scatter
 * answers (`setActiveRung` slots under `profile()`). The buffer scale is requested here and lands
 * at the next scene boundary (`applyPendingRenderScale`) — a mid-run buffer resize under a live
 * fight is exactly the hitch this whole system exists to remove.
 *
 * `?noladder=1` pins everything (every perf harness passes it: a CPU-throttled measurement that
 * steps the quality down mid-run measures the ladder, not the game). `?ladder=fast` shrinks the
 * windows for the ladder's own harness.
 */
import Phaser from 'phaser';
import {
  defaultGraphicsQuality, getGraphicsQuality, renderScaleNow, requestRenderScale, setActiveRung,
} from './graphicsQuality';
import { RUNGS, RUNG_STORAGE_KEY, rungForTier, startingRung, type Rung, type RungId } from './qualityRungs';
import { activePaperSheets } from '../ui/ink/paperSheet';

interface LadderTuning {
  windowMs: number;
  warmupMs: number;
  downAt: number;
  upAt: number;
  downAfter: number;
  upAfter: number;
  maxStepsDown: number;
  maxStepsUp: number;
}

const DEFAULTS: LadderTuning = {
  windowMs: 2500, warmupMs: 5000, downAt: 1.25, upAt: 0.6, downAfter: 2, upAfter: 5,
  maxStepsDown: 2, maxStepsUp: 2,
};

function query(name: string): string | undefined {
  try {
    return new URLSearchParams(window.location.search).get(name) ?? undefined;
  } catch {
    return undefined;
  }
}

export class QualityLadder {
  private rung: Rung;
  private ceiling: Rung;
  private readonly tuning: LadderTuning;
  private readonly enabled: boolean;

  private stepT0 = 0;
  private stepSamples: number[] = [];
  private gapSamples: number[] = [];
  private windowGapMs = 0;
  private warmupLeft: number;
  private holdUntil = 0;
  private hotWindows = 0;
  private calmWindows = 0;
  private stepsDown = 0;
  private stepsUp = 0;
  private readonly leftTwice = new Map<RungId, number>();
  private sceneCap: number | undefined;
  private appliedLimit = 0;
  private fpsTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly game: Phaser.Game) {
    // `?capture=1` marks every harness run: a CPU-throttled measurement that stepped the
    // quality down mid-run would measure the ladder, not the game — and flake every pixel gate.
    // The dev server is pinned too (unless `?ladder=` asks): vite transforms and HMR make every
    // dev frame slow in ways no player's device is, and the first live session measured exactly
    // that — two steps down and a persisted 'low' from an IDLE MENU. Frames in dev measure the
    // tooling, not the game.
    const inDev = typeof import.meta !== 'undefined' && Boolean(import.meta.env?.DEV) && query('ladder') === undefined;
    this.enabled = query('noladder') !== '1' && query('capture') !== '1' && !inDev;
    const fast = query('ladder') === 'fast';
    this.tuning = fast ? { ...DEFAULTS, windowMs: 600, warmupMs: 1000, upAfter: 3 } : DEFAULTS;
    this.warmupLeft = this.tuning.warmupMs;

    const explicitStored = typeof localStorage !== 'undefined' ? localStorage.getItem('mandate:graphics:v1') : null;
    const start = startingRung({
      explicitTier: explicitStored ? getGraphicsQuality() : undefined,
      defaultTier: defaultGraphicsQuality(),
      devicePixelRatio: typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1,
      // A rung persisted while the ladder is pinned came from a session that could not have
      // measured anything real (a dev session before the guard above existed, most likely) —
      // honouring it would keep a polluted 'low' forever.
      persisted: this.enabled && typeof localStorage !== 'undefined' ? localStorage.getItem(RUNG_STORAGE_KEY) : null,
    });
    this.rung = start.rung;
    this.ceiling = start.ceiling;

    // The starting rung is applied even with the ladder disabled — `?noladder=1` means "do not
    // MOVE", not "ignore the persisted answer". (Harnesses also pin the tier, which wins above.)
    this.apply(this.rung, { initial: true });

    if (this.enabled) {
      game.events.on(Phaser.Core.Events.PRE_STEP, this.onPreStep, this);
      game.events.on(Phaser.Core.Events.POST_RENDER, this.onPostRender, this);
    }
  }

  state(): { rung: RungId; ceiling: RungId; scale: number; hot: number; calm: number; stepsDown: number; stepsUp: number; enabled: boolean } {
    return {
      rung: this.rung.id, ceiling: this.ceiling.id, scale: renderScaleNow(),
      hot: this.hotWindows, calm: this.calmWindows,
      stepsDown: this.stepsDown, stepsUp: this.stepsUp, enabled: this.enabled,
    };
  }

  /**
   * An explicit choice — the settings row, a harness. Moves the ceiling with the rung, so the
   * sampler can never climb a session above what the player deliberately picked (or step "down"
   * from a pick the pinned-dev guard would otherwise leave standing).
   */
  force(id: RungId): void {
    const rung = RUNGS.find((r) => r.id === id);
    if (rung) {
      this.rung = rung;
      this.ceiling = rung;
      this.apply(rung, {});
    }
  }

  /** Ignore the next `ms` of samples — a bake or a scene build is not the frame rate. */
  hold(ms: number): void {
    this.holdUntil = performance.now() + ms;
  }

  markSceneStart(): void {
    this.hold(1500);
    this.stepSamples = [];
    this.gapSamples = [];
    this.windowGapMs = 0;
  }

  /** A scene that wants its own pacing cap (the front page idles at 30). */
  setSceneCap(fps?: number): void {
    this.sceneCap = fps;
    this.applyFps();
  }

  private onPreStep(_time: number, delta: number): void {
    this.stepT0 = performance.now();
    // The event's own delta, not `loop.rawDelta`: a manually-stepped loop (every harness, and
    // the resume path) never refreshes rawDelta, and the ladder would keep judging stale gaps.
    const gap = delta;
    if (performance.now() < this.holdUntil) return;
    if (this.warmupLeft > 0) {
      this.warmupLeft -= gap;
      return;
    }
    this.gapSamples.push(gap);
    this.windowGapMs += gap;
    if (this.windowGapMs >= this.tuning.windowMs) this.closeWindow();
  }

  private onPostRender(): void {
    if (performance.now() < this.holdUntil || this.warmupLeft > 0) return;
    this.stepSamples.push(performance.now() - this.stepT0);
  }

  private closeWindow(): void {
    const gapP95 = percentile(this.gapSamples, 0.95);
    const stepP95 = percentile(this.stepSamples, 0.95);
    this.gapSamples = [];
    this.stepSamples = [];
    this.windowGapMs = 0;

    const budget = 1000 / Math.min(this.rung.fps, this.sceneCap ?? 60);
    if (gapP95 > budget * this.tuning.downAt) {
      this.hotWindows += 1;
      this.calmWindows = 0;
      if (this.hotWindows >= this.tuning.downAfter) this.stepDown();
      return;
    }
    if (stepP95 < budget * this.tuning.upAt && gapP95 <= budget * 1.1) {
      this.calmWindows += 1;
      this.hotWindows = 0;
      if (this.calmWindows >= this.tuning.upAfter) this.stepUp();
      return;
    }
    this.hotWindows = 0;
    this.calmWindows = 0;
  }

  private stepDown(): void {
    this.hotWindows = 0;
    if (this.stepsDown >= this.tuning.maxStepsDown) return;
    const at = RUNGS.indexOf(this.rung);
    if (at >= RUNGS.length - 1) return;
    this.leftTwice.set(this.rung.id, (this.leftTwice.get(this.rung.id) ?? 0) + 1);
    this.rung = RUNGS[at + 1];
    this.stepsDown += 1;
    this.apply(this.rung, {});
  }

  private stepUp(): void {
    this.calmWindows = 0;
    if (this.stepsUp >= this.tuning.maxStepsUp) return;
    const at = RUNGS.indexOf(this.rung);
    if (at <= RUNGS.indexOf(this.ceiling)) return;
    const above = RUNGS[at - 1];
    if ((this.leftTwice.get(above.id) ?? 0) >= 2) return;
    this.rung = above;
    this.stepsUp += 1;
    this.apply(this.rung, {});
  }

  private apply(rung: Rung, opts: { initial?: boolean }): void {
    setActiveRung(rung);
    for (const sheet of activePaperSheets()) sheet.setVisible(rung.paper);
    this.applyFps();
    requestRenderScale(rung.scale);
    if (!opts.initial && typeof localStorage !== 'undefined') {
      try { localStorage.setItem(RUNG_STORAGE_KEY, rung.id); } catch { /* private mode */ }
    }
  }

  private applyFps(): void {
    const cap = Math.min(this.rung.fps, this.sceneCap ?? Infinity);
    // 60 means "vsync paces us", not a limiter at 60: Phaser's limiter accumulates delta
    // against a fixed rate, so a limit at (or above) the panel's own rate skips real frames on
    // jitter and halves a 120 Hz panel outright. Only a true sub-60 cap engages it.
    const limit = cap >= 60 ? 0 : cap;
    if (limit === this.appliedLimit) return;
    this.appliedLimit = limit;
    // One macrotask later, never mid-step: `setFPSLimit` stops and restarts the rAF loop, and a
    // restart from INSIDE a step (scene create, any game event) re-arms `isRunning` before the
    // still-running step closure checks it — both then reschedule, and the game double-steps
    // forever after. Deferring puts the swap between frames, where stop() cancels cleanly.
    if (this.fpsTimer !== undefined) clearTimeout(this.fpsTimer);
    this.fpsTimer = setTimeout(() => {
      this.fpsTimer = undefined;
      const loop = this.game.loop as unknown as { setFPSLimit?: (fps: number) => void } | undefined;
      loop?.setFPSLimit?.(limit);
    }, 0);
  }
}

function percentile(samples: number[], p: number): number {
  if (samples.length === 0) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}

let installed: QualityLadder | undefined;

/** Once, from main.ts, after the game exists. */
export function installQualityLadder(game: Phaser.Game): QualityLadder {
  installed ??= new QualityLadder(game);
  return installed;
}

export function qualityLadder(): QualityLadder | undefined {
  return installed;
}

export { rungForTier };
