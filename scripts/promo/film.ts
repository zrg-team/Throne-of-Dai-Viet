/**
 * VẠN THẮNG — the film.
 *
 * Five plates, eighteen seconds, and one argument: that the country in this game is a real one with
 * a real thing that happened to it. The story is the third Mongol war, 1284–1288 — a kingdom of
 * some five million people beating the largest land empire in history, and finishing it in a tidal
 * estuary with sharpened wood.
 *
 * What is drawn here is drawn by the game. Every house, tháp, tree, buffalo, farmer, soldier,
 * banner and seal comes out of `src/ui/ink/`, through the Canvas2D shim in `inkCanvas.ts`, at the
 * proportions the map uses. Nothing is a screenshot; the two title lines at the end are the only
 * lettering, and they arrive after the story is over.
 *
 * ## What the second cut changed, and why
 *
 * The first cut ran fifty-seven seconds and every frame of it was flat. Three faults, and not one
 * of them was about how well any single thing was drawn:
 *
 *  · **No aerial perspective.** Hills, fields, village and grass were four horizontal bands at
 *    identical contrast, which reads as a chart of a landscape rather than as one. Every plate now
 *    goes down in layers with `recede` between them.
 *  · **No foreground.** Nothing was ever close to the camera, so the eye had no near edge to read
 *    past. Each ground plate now has big near plants at the frame's edge, silhouetted by `near`.
 *  · **Figures blown up.** `figure` is drawn to be a mark on a province; at scale 46 it is a stack
 *    of boxes with a hat. Nothing here goes past 16, and crowds read as crowds.
 *
 * Short, with each plate given the time to be composed, beats long and thin.
 *
 * ## The rules it keeps, because they are the game's
 *
 *  · **Sỏi son is Đại Việt's alone.** The Yuan fly the same standard desaturated, so the only
 *    saturated red anywhere in the film is the player's.
 *  · **Drum in the chrome, dynasty in the world.** The Ngọc Lũ face appears once, in the title.
 *  · **The seal carries a drawn device, never a written character** — so the stamp that closes the
 *    film is the Bạch Đằng stakes, which `devices.ts` already knows how to cut.
 *  · **Composites paint bottom-up**, as `settlements.ts` does.
 *
 * ## Time, and the frame
 *
 * Every plate is a pure function of one number: no clock, no accumulator, no tween manager, so the
 * driver can render frame 412 without having rendered 411. And every plate names a **square** of
 * world (`Shot.half`) that both aspect ratios are guaranteed to show; a 9:16 render gets three
 * quarters of a square-side spare above and below, which is where the sky and the near bank go.
 */
import { PIGMENT, mutePigment, shadePigment } from '../../src/ui/ink/palette';
import { inkPath, mulberry32, washFill, type Pt } from '../../src/ui/ink/stroke';
import {
  areca, banana, bamboo, banyan, boThoc, buffalo, chuongTrau, dinh, farmer, gieng, grassTuft,
  hayStack, house, karstRange, softRidge, thap, tree,
} from '../../src/ui/ink/props';
import { figure, sawtoothBand, seal, type FigureArm, type FigureTheme } from '../../src/ui/ink/devices';
import { citadel, drawFieldPlot, paddyLattice, setDrawnEra, village } from '../../src/ui/ink/settlements';
import { lacBird } from '../../src/ui/ink/birds';
import { setFoliageSeason } from '../../src/ui/ink/season';
import type { G } from './inkCanvas';
import {
  BACH_DANG, BLACK_RIVER, MA_RIVER, REALM, RED_RIVER, SEABOARD, THANG_LONG,
  boundsOf, smoothPath, trimPath,
} from './atlas';
import { clamp01, lerp, outCubic, outQuint, smooth, smoother, span, stagger, stamp } from './ease';
import { hazeBand, near, recede } from './depth';
import { banner, bob, fire, horizon, junk, skiff, skyWash, smoke, stake, tideLine, water } from './world';

setFoliageSeason('Summer');
setDrawnEra('tran');

/** Where the camera is, in world units, and how much of the world the safe square holds. */
export interface Shot {
  cx: number;
  cy: number;
  half: number;
}

export interface Scene {
  name: string;
  from: number;
  to: number;
  shot: (local: number) => Shot;
  /** A full-frame multiply: the hour of the day. */
  tint?: (local: number) => { colour: number; alpha: number };
  /** A paper wash over the whole frame — how one plate is pulled off and the next laid down. */
  veil?: (local: number) => number;
  draw: (g: G, ctx: CanvasRenderingContext2D, local: number) => void;
}

// ═══════════════════════════════════════════════════════════════════════════════
// The host
// ═══════════════════════════════════════════════════════════════════════════════

interface HostSpec {
  x: number;
  y: number;
  /** Figure scale of the front rank. Never past ~16: past that a figure stops being a person. */
  s: number;
  cols: number;
  rows: number;
  theme: FigureTheme;
  accent?: number | ((rank: number, file: number) => number | undefined);
  seed: number;
  arrive?: (rank: number) => number;
  arm?: (rank: number, file: number) => FigureArm | undefined;
  tier?: (rank: number) => 0 | 1 | 2;
  rankPitch?: number;
  /** Mounted men need half again what foot do: the pony is the width. */
  filePitch?: number;
  t: number;
}

/**
 * A body of men, at a scale a viewer is standing among rather than flying over.
 *
 * `drawHost` in `devices.ts` spaces files at 1.33 × the figure scale, which is right when a host is
 * a forty-pixel mark on a province and catastrophic at the size a film shows one — the men merge
 * into a black bar. So the pitch here is roughly double, the ranks step back **and up and
 * smaller**, and the back ranks are painted first.
 */
function host(g: G, spec: HostSpec): void {
  const rand = mulberry32(spec.seed);
  const filePitch = spec.filePitch ?? 2.55;
  const rankPitch = spec.rankPitch ?? 1.9;
  for (let rank = spec.rows - 1; rank >= 0; rank -= 1) {
    const arrive = spec.arrive?.(rank) ?? 1;
    if (arrive <= 0.01) continue;
    const s = spec.s * (1 - rank * 0.07);
    const y = spec.y - rank * rankPitch * spec.s;
    for (let file = 0; file < spec.cols; file += 1) {
      const jitterX = (rand() - 0.5) * 0.5;
      const jitterY = (rand() - 0.5) * 0.4;
      const fx = spec.x + (file - (spec.cols - 1) / 2) * filePitch * s + jitterX * s + rank * 0.5 * s;
      const fy = y + jitterY * s + (1 - arrive) * -3.4 * spec.s;
      const accent = typeof spec.accent === 'function' ? spec.accent(rank, file) : spec.accent;
      figure(g, fx, fy + bob(spec.t, file * 3 + rank, 0.09 * s), s, PIGMENT.muc, {
        theme: spec.theme,
        tier: spec.tier?.(rank) ?? 1,
        arm: spec.arm?.(rank, file),
        accent,
        seed: spec.seed + rank * 31 + file * 7,
      });
    }
  }
}

/** Chim Lạc across the sky. The bird on the drum, and the only thing in the film that is free. */
function birds(g: G, t: number, x0: number, y0: number, count: number, speed: number, scatter = 0): void {
  for (let bird = 0; bird < count; bird += 1) {
    const rand = mulberry32(bird * 631 + 17);
    const phase = (t * speed * (0.8 + rand() * 0.4) + rand()) % 1;
    const lift = scatter * (60 + rand() * 200);
    lacBird(
      g,
      x0 + phase * 2200 + rand() * 180,
      y0 + rand() * 160 - lift - Math.sin(phase * 5) * 16,
      3.2 + rand() * 1.8,
      bird * 97,
      Math.floor(t * 6.5 + bird) % 2 === 0 ? 'down' : 'up',
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Plate 1 · Giấy điệp — the country is drawn
// ═══════════════════════════════════════════════════════════════════════════════

const COAST = smoothPath(REALM, true, 2);
const COAST_BOUNDS = boundsOf(COAST);
const SEA_LINE = smoothPath(SEABOARD, false, 6);
const RIVERS = [smoothPath(RED_RIVER, false, 8), smoothPath(BLACK_RIVER, false, 8), smoothPath(MA_RIVER, false, 8)];
const ESTUARY = smoothPath(BACH_DANG, false, 8);

/**
 * The uplands: mountains **drawn**, clipped to the coast, rather than a second colour block.
 *
 * The first cut used a highlands polygon washed over the land polygon. It covered most of the
 * country, and `washFill`'s registration offset — the misprint that is the whole look at prop scale
 * — put a four-pixel ghost of the entire realm down its eastern edge. At map scale that offset is
 * not a misprint, it is a second country.
 *
 * So the interior is the thing a Đông Hồ block-cutter would actually have cut: four little ranges
 * across the north and down the west, which is where Đại Việt's mountains are, cut off at the
 * coastline by a clip. The delta is left as bare wash, which is what a delta is.
 */
function drawUplands(g: G, ctx: CanvasRenderingContext2D, alpha: number): void {
  if (alpha <= 0.01) return;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(COAST[0].x, COAST[0].y);
  for (const point of COAST) {
    ctx.lineTo(point.x, point.y);
  }
  ctx.closePath();
  ctx.clip();
  ctx.globalAlpha = alpha;
  karstRange(g, 20, 720, 232, 74, 4401, true, 1.3);
  karstRange(g, 10, 340, 344, 62, 4407, true, 1.2);
  karstRange(g, 110, 430, 476, 54, 4411, true, 1.1);
  karstRange(g, 300, 540, 624, 46, 4417, true, 1.0);
  ctx.restore();
}

function drawRealm(
  g: G, ctx: CanvasRenderingContext2D, inkRun: number, fill: number,
  wash = PIGMENT.tramPale, washAlpha = 0.5,
): void {
  if (fill > 0.01) {
    washFill(g, COAST, wash, 41, washAlpha * fill, 2.6);
  }
  drawUplands(g, ctx, fill * 0.62);
  const drawn = trimPath(COAST, inkRun);
  if (drawn.length > 1) {
    inkPath(g, drawn, 42, { width: 1.8, alpha: 0.9, wobble: 1.6, step: 22 });
  }
}

const sheet: Scene = {
  name: 'sheet',
  from: 0,
  to: 3.2,
  shot: (t) => ({
    cx: COAST_BOUNDS.cx + 10,
    cy: COAST_BOUNDS.cy,
    half: lerp(424, 372, smoother(span(t, 0, 3.2))),
  }),
  veil: (t) => 1 - span(t, 0, 0.35) + span(t, 3.1, 3.2),
  draw: (g, ctx, t) => {
    const inkRun = outQuint(span(t, 0.15, 1.5));
    const fill = smooth(span(t, 0.8, 1.9));

    // The sea, and enough of a surface on it to say which side of the line is water.
    const sea = smooth(span(t, 1.0, 2.2));
    if (sea > 0.01) {
      g.fillStyle(PIGMENT.chamWash, 0.16 * sea);
      g.fillPoints([
        { x: COAST_BOUNDS.cx - 1400, y: COAST_BOUNDS.cy - 1400 },
        { x: COAST_BOUNDS.cx + 1400, y: COAST_BOUNDS.cy - 1400 },
        { x: COAST_BOUNDS.cx + 1400, y: COAST_BOUNDS.cy + 1800 },
        { x: COAST_BOUNDS.cx - 1400, y: COAST_BOUNDS.cy + 1800 },
      ], true);
      for (let dash = 0; dash < 26; dash += 1) {
        const rand = mulberry32(dash * 331);
        const x = COAST_BOUNDS.cx + 250 + rand() * 600;
        const y = COAST_BOUNDS.cy - 420 + rand() * 1150;
        inkPath(g, [{ x, y }, { x: x + 34, y: y - 5 }, { x: x + 68, y }], dash * 13, {
          width: 1.1, alpha: 0.2 * sea, colour: PIGMENT.cham, wobble: 0.5, step: 12,
        });
      }
    }

    drawRealm(g, ctx, inkRun, fill);

    // The rivers, which is what the country actually is — every capital, every battle and every
    // famine in the story below happens within a day's walk of one of these three.
    RIVERS.forEach((river, index) => {
      const run = smooth(span(t, 1.3 + index * 0.16, 2.4 + index * 0.16));
      if (run <= 0.01) return;
      const drawn = trimPath(river, run);
      if (drawn.length < 2) return;
      inkPath(g, drawn, 70 + index, { width: 5.5, alpha: 0.22, colour: PIGMENT.cham, wobble: 2.2, step: 26 });
      inkPath(g, drawn, 80 + index, { width: 1.7, alpha: 0.62, colour: PIGMENT.cham, wobble: 1.8, step: 22 });
    });

    // Thăng Long, and the estuary that ends the story, marked before anyone knows it matters.
    const capital = outCubic(span(t, 2.0, 2.6));
    if (capital > 0.01) {
      ctx.save();
      ctx.globalAlpha = capital;
      citadel(g, THANG_LONG.x, THANG_LONG.y + 14, 1.5, 'tran', 903);
      ctx.restore();
    }
    const mouth = smooth(span(t, 2.4, 3.1));
    if (mouth > 0.01) {
      const drawn = trimPath(ESTUARY, mouth);
      if (drawn.length > 1) {
        inkPath(g, drawn, 95, { width: 6, alpha: 0.42 * mouth, colour: PIGMENT.cham, wobble: 2, step: 20 });
      }
    }

    // Chim Lạc over the sheet and răng cưa under it. A tall frame leaves a third of itself above
    // and below the country, and the narrator's own register is what belongs there — the drum's
    // vocabulary framing the dynasty's, which is the rule the whole art direction runs on.
    const chrome = smooth(span(t, 0.8, 1.9));
    if (chrome > 0.01) {
      for (let bird = 0; bird < 5; bird += 1) {
        const rand = mulberry32(bird * 733);
        lacBird(g, COAST_BOUNDS.cx - 380 + bird * 190 + rand() * 54,
          COAST_BOUNDS.cy - 486 + rand() * 70, 6.4, bird * 41,
          Math.floor(t * 5 + bird) % 2 === 0 ? 'down' : 'up');
      }
      sawtoothBand(g, COAST_BOUNDS.cx - 340 * chrome, COAST_BOUNDS.cy + 470, 680 * chrome, 26, 0.5 * chrome);
    }

    // The seaboard the game's four centuries eventually reach, drawn as a dotted intention. In 1288
    // none of it is Đại Việt and the film does not pretend otherwise.
    const ghost = smooth(span(t, 2.2, 3.1));
    if (ghost > 0.01) {
      const run = trimPath(SEA_LINE, ghost);
      for (let index = 0; index < run.length - 2; index += 3) {
        inkPath(g, [run[index], run[index + 1]], 60 + index, {
          width: 1.4, alpha: 0.24 * ghost, colour: PIGMENT.mucFaint, wobble: 0.6, step: 14,
        });
      }
    }
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// The delta — one village, drawn in layers, shared by plates 2 and 3
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * The bands, from the back. Each is separated from the next by a `recede`, and that separation is
 * the whole difference between this and the flat version.
 *
 *   −1100 … −340   sky, and whatever weather the plate is having
 *    −340 … −140   karst, then a soft ridge in front of it
 *    −120 …    60   the far paddy, hazed
 *      60 …   210   the near paddy
 *     190 …   320   the village inside its bamboo hedge
 *     360 …   520   the bund people and buffalo walk
 *     520 …   760   the near bank, and the plants the frame is read past
 */
const KARST_BASE = -140;
const BUND = 380;

const FAR_PADDY = paddyLattice({ x0: -1100, x1: 1900, y0: -120, y1: 62, cell: 34, seed: 5501 });
const NEAR_PADDY = paddyLattice({ x0: -1100, x1: 1900, y0: 62, y1: 210, cell: 52, seed: 5507 });

function deltaLand(g: G, at: number, storm: number): void {
  // ── the far distance ────────────────────────────────────────────────────────
  skyWash(g, -1600, 2500, -1100, KARST_BASE + 80, PIGMENT.cham, 0.75 * storm);
  karstRange(g, -1300, 2200, KARST_BASE, 200, 4207, true, 1.35);
  recede(g, -1600, 2500, -1200, KARST_BASE + 40, 0.5);

  softRidge(g, -1400, 2300, KARST_BASE + 34, 58, 991);
  horizon(g, KARST_BASE + 46, -1600, 2500, 1400, PIGMENT.tramPale, 313, 0.4);
  recede(g, -1600, 2500, -1200, KARST_BASE + 100, 0.34);

  // ── the far paddy ───────────────────────────────────────────────────────────
  for (const plot of FAR_PADDY) {
    drawFieldPlot(g, plot);
  }
  hazeBand(g, -1600, 2500, -140, 130, 0.42);

  // ── the near paddy ──────────────────────────────────────────────────────────
  for (const plot of NEAR_PADDY) {
    drawFieldPlot(g, plot);
  }
  hazeBand(g, -1600, 2500, 40, 230, 0.16);
  void at;
}

/** Everything standing in the village. Placed once, so plate 3 is unarguably the same place. */
function deltaVillage(g: G, at: number): void {
  // The lũy tre — the bamboo hedge that is the wall of every village in the delta, and the reason
  // "vườn không nhà trống" was something a village could actually do.
  bamboo(g, -90, 268, 6.6, 1201);
  bamboo(g, 46, 282, 6.0, 1207);
  bamboo(g, 1024, 272, 6.2, 1213);
  bamboo(g, 1150, 288, 5.6, 1217);

  thap(g, 168, 252, 3.2, 1291, 5);
  banyan(g, 858, 306, 4.9, 1301);
  tree(g, -186, 292, 5.6, 1307);
  tree(g, 724, 256, 4.6, 1311);
  areca(g, 386, 264, 4.5, 1319);
  areca(g, 424, 274, 4.1, 1321);
  banana(g, 566, 308, 5.0, 1327);

  village(g, 296, 252, 4.0, 7717);
  dinh(g, 632, 242, 5.2, 8821);
  house(g, 88, 298, 5.0, 8831, true);
  house(g, 912, 290, 4.8, 8837);
  gieng(g, 712, 304, 5.0, 8843);
  boThoc(g, 772, 308, 4.6, 8849);
  hayStack(g, 486, 302, 4.4, 8853);
  chuongTrau(g, 236, 312, 4.6, 8859);

  // Two farmers on the bunds, bent to it. A field with nobody in it is a pattern.
  farmer(g, 178, 156 + bob(at, 3, 0.7), 5.0, 4457);
  farmer(g, 838, 184 + bob(at, 5, 0.7), 5.2, 4461);
}

/**
 * The near bank, and the plants the frame is read past.
 *
 * Rooted below the safe square and tall enough to reach up into it, so a 16:9 crop still gets the
 * leaves even though it never sees the stems. That is the only way one set of drawings frames
 * itself in both aspect ratios.
 */
function deltaForeground(g: G, ctx: CanvasRenderingContext2D, brightness: number): void {
  horizon(g, BUND - 44, -1600, 2500, 1600, shadePigment(PIGMENT.tram, 1.08), 601, 0.34);
  for (let tuft = 0; tuft < 90; tuft += 1) {
    const rand = mulberry32(tuft * 977);
    grassTuft(g, -1300 + rand() * 3400, BUND + 30 + rand() ** 0.7 * 320, 5 + rand() * 6, tuft * 13);
  }

  near(ctx, brightness, () => {
    banana(g, 92, 648, 13.5, 1901);
    bamboo(g, 902, 616, 12.5, 1907);
    banana(g, 700, 734, 15.5, 1903);
    for (let tuft = 0; tuft < 26; tuft += 1) {
      const rand = mulberry32(tuft * 1451);
      grassTuft(g, -400 + rand() * 1900, 566 + rand() * 220, 12 + rand() * 9, tuft * 29);
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Plate 2 · Đồng bằng — the delta, before
// ═══════════════════════════════════════════════════════════════════════════════

const delta: Scene = {
  name: 'delta',
  from: 3.2,
  to: 6.9,
  shot: (t) => ({
    cx: lerp(392, 542, smoother(span(t, 0, 3.7))),
    cy: lerp(200, 176, smoother(span(t, 0, 3.7))),
    half: lerp(322, 278, smoother(span(t, 0, 3.7))),
  }),
  // A hair of sophora over the whole sheet: late afternoon, and the one plate in the film that is
  // allowed to be warm.
  tint: () => ({ colour: PIGMENT.hoePale, alpha: 0.15 }),
  veil: (t) => (1 - span(t, 0, 0.2)) * 0.95,
  draw: (g, ctx, t) => {
    const at = t + 3.2;
    deltaLand(g, at, 0);
    birds(g, at, -1100, KARST_BASE - 280, 5, 0.05);
    deltaVillage(g, at);
    deltaForeground(g, ctx, 0.76);

    // The buffalo and the boy on its back, walking the bund. After the Đông Hồ print the game's own
    // buffalo was drawn from — so this is the film quoting the source the art direction quotes.
    const walk = lerp(-20, 700, span(t, 0, 3.7));
    buffalo(g, walk, BUND + 116 + bob(at, 0, 1.6), 9.0, 4401, true);
    farmer(g, walk - 176, BUND + 126 + bob(at, 7, 1.2), 7.4, 4471);
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// Plate 3 · Bắc phương — the north comes down
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * The same country, four days later, from the same camera.
 *
 * The column crosses the **foreground**, over the bund the buffalo walked down in the last plate,
 * and the camera does not move to avoid it. A threat drawn small behind a village is a diorama.
 */
const north: Scene = {
  name: 'north',
  from: 6.9,
  to: 10.1,
  shot: (t) => ({
    cx: lerp(542, 470, smoother(span(t, 0, 3.2))),
    cy: lerp(176, 192, smoother(span(t, 0, 3.2))),
    half: lerp(278, 344, smoother(span(t, 0, 3.2))),
  }),
  tint: (t) => ({ colour: PIGMENT.cham, alpha: 0.62 * smooth(span(t, 0, 1.5)) }),
  veil: () => 0,
  draw: (g, ctx, t) => {
    const at = t + 6.9;
    const storm = smooth(span(t, 0, 1.2));

    deltaLand(g, at, storm);

    // Smoke on the northern skyline: the villages already behind them, seen before they are.
    for (let column = 0; column < 5; column += 1) {
      smoke(g, -600 + column * 560, KARST_BASE + 10, 2.4, column * 313,
        (at * 0.15 + column * 0.3) % 1, 0.46 * smooth(span(t, 0.2, 1.6)));
    }
    // The birds go first. They always do, and it is the only warning the plate gives.
    birds(g, at, -1100, KARST_BASE - 280, 5, 0.05, smooth(span(t, 0.1, 1.6)));

    deltaVillage(g, at);

    // Foot in the middle distance, behind the village's own hedge.
    const walk = smoother(span(t, 0.5, 2.8));
    const walkX = lerp(-700, 640, walk);
    host(g, {
      x: walkX, y: 234, s: 8.2, cols: 10, rows: 3, filePitch: 2.7,
      theme: 'yuan', seed: 6203, t: at,
      accent: mutePigment(PIGMENT.son, 0.7),
      tier: (rank) => (rank === 0 ? 2 : 1),
      arm: (rank, file) => (rank % 3 === 1 ? 'bow' : file % 4 === 0 ? 'sword' : 'spear'),
      arrive: (rank) => stagger(t, 0.5, 0.2, rank, 0.8),
    });

    deltaForeground(g, ctx, 0.6);

    // And the horse, over the bund and across the front of the plate.
    const ride = smoother(span(t, 0.2, 2.6));
    const rideX = lerp(-620, 560, ride);
    host(g, {
      x: rideX, y: BUND + 152, s: 15.5, cols: 5, rows: 2, filePitch: 3.9,
      theme: 'yuan', seed: 6101, t: at,
      accent: mutePigment(PIGMENT.son, 0.7),
      tier: () => 2,
      arm: () => 'mounted',
      arrive: (rank) => stagger(t, 0.2, 0.24, rank, 0.8),
    });

    // Their standards, muted — the scarcity law, held at the moment it is hardest to hold.
    const up = span(t, 0.5, 1.4);
    if (up > 0.01) {
      banner(g, rideX - 330, BUND + 158, 3.4 * up, 5501, PIGMENT.mucSoft, at * 1.6, 46);
      banner(g, walkX - 250, 228, 2.0 * up, 5507, PIGMENT.mucSoft, at * 1.9, 46);
    }
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// Plate 4 · Bạch Đằng — the tide, 9 April 1288
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * The centrepiece, and the only plate storyboarded around a clock rather than a camera — because
 * the battle *is* a clock.
 *
 * Trần Hưng Đạo had ironwood stakes driven into the bed of the Bạch Đằng at low water, where the
 * tidal range runs to three metres and more. At high water they were invisible. Light boats fought
 * the Yuan fleet under Ô Mã Nhi, gave way, and drew it upriver on the flood. Then the tide turned,
 * the water fell off the stakes, and four hundred ships were held and holed where they sat. It was
 * the third time this estuary had done this to a northern fleet — 938, 981, 1288 — which is why the
 * seal that closes the film is a row of stakes.
 *
 * At eighteen seconds there is no room to plant, flood, bait and ebb. So the plate *is* the ebb:
 * the water going down, which is the moment the other three were for.
 *
 * The tide is drawn as the **width** of the water — bank to bank at the top of the flood, and at
 * the ebb pulled back off mud on both sides. That reads instantly; a gauge with a number on it
 * reads as a gauge.
 */
const FAR_BANK = -260;
const NEAR_BANK = 620;
const RIVER_LEFT = -2400;
const RIVER_RIGHT = 2600;

interface StakeSpec { x: number; y: number; length: number; lean: number; seed: number }

/**
 * Six rows across the channel, each nearer row longer and looser than the one behind it.
 *
 * Length is what carries distance here, because an orthographic plate gets no perspective for
 * free. The excavations at Yen Giang and Dong Van Muoi have lifted several hundred real ones, and
 * the field is thought to have held thousands.
 */
const STAKES: StakeSpec[] = [];
[-190, -90, 30, 170, 330, 500].forEach((rowY, row) => {
  const count = 36 - row * 3;
  for (let index = 0; index < count; index += 1) {
    const rand = mulberry32(row * 977 + index * 131);
    STAKES.push({
      // Rows, with each row's own rhythm kept and every stake nudged off it. Evenly spaced posts
      // are a fence; the same posts moved a stake's width each are a field.
      x: -1900 + (index / (count - 1)) * 3800 + (rand() - 0.5) * 60,
      y: rowY + (rand() - 0.5) * 20,
      length: 22 + row * 14 + rand() * 12,
      lean: 0.30 + rand() * 0.10,
      seed: row * 53 + index * 7,
    });
  }
});

interface FleetShip { x: number; y: number; s: number; seed: number; hold: number }

/**
 * Five hulls, placed by composition rather than by a formation.
 *
 * They are held where they struck, so the plate is a picture of ships *on* something rather than a
 * convoy sailing past: the big one forward and low, two mid, two small and high, which is the
 * arrangement that makes the river read as receding.
 */
const FLEET: FleetShip[] = [
  { x: -300, y: -152, s: 1.45, seed: 9001, hold: 0.62 },
  { x: 250, y: -64, s: 1.95, seed: 9027, hold: 0.44 },
  { x: -140, y: 96, s: 2.7, seed: 9013, hold: 0.00 },
  { x: 330, y: 262, s: 3.4, seed: 9059, hold: 0.28 },
  { x: -330, y: 440, s: 4.2, seed: 9041, hold: 0.14 },
];

const river: Scene = {
  name: 'river',
  from: 10.1,
  to: 14.2,
  shot: (t) => ({
    cx: lerp(-70, 90, smoother(span(t, 0, 4.1))),
    cy: lerp(196, 246, smoother(span(t, 0, 4.1))),
    half: lerp(534, 496, smoother(span(t, 0, 2.4))) + lerp(0, 120, smoother(span(t, 2.4, 4.1))),
  }),
  // Night into a grey dawn. The fight was fought on the morning flood and finished on the ebb.
  tint: (t) => ({ colour: PIGMENT.cham, alpha: lerp(0.44, 0.13, smoother(span(t, 0.2, 2.8))) }),
  veil: (t) => 1 - span(t, 0, 0.3),
  draw: (g, ctx, t) => {
    const at = t + 10.1;
    /** 1 at the top of the flood, 0 at dead low. Everything on the plate is downstream of this. */
    const level = 1 - smoother(span(t, 0.15, 2.9));
    const surface = lerp(-136, FAR_BANK, level);
    const floor = lerp(542, NEAR_BANK, level);
    /** How far a stake stands clear of the water. The whole battle, as one number. */
    const bare = clamp01(1 - level * 1.2);

    // ── the far shore ───────────────────────────────────────────────────────────
    karstRange(g, RIVER_LEFT - 400, RIVER_RIGHT + 400, FAR_BANK - 150, 260, 3301, true, 1.4);
    recede(g, RIVER_LEFT - 400, RIVER_RIGHT + 400, -1400, FAR_BANK - 70, 0.46);
    horizon(g, FAR_BANK - 96, RIVER_LEFT - 500, RIVER_RIGHT + 500, FAR_BANK + 90, PIGMENT.tramDeep, 3307, 0.44);
    for (let clump = 0; clump < 24; clump += 1) {
      const rand = mulberry32(clump * 449);
      bamboo(g, RIVER_LEFT + rand() * (RIVER_RIGHT - RIVER_LEFT), FAR_BANK - 88 + rand() * 22,
        3.8 + rand() * 2.0, clump * 71);
    }
    thap(g, -820, FAR_BANK - 84, 2.2, 3311, 5);
    for (let roof = 0; roof < 5; roof += 1) {
      const rand = mulberry32(roof * 811);
      house(g, 260 + roof * 300 + (rand() - 0.5) * 90, FAR_BANK - 78 + rand() * 14, 2.0 + rand() * 0.6, 3320 + roof);
    }
    hazeBand(g, RIVER_LEFT - 500, RIVER_RIGHT + 500, FAR_BANK - 200, FAR_BANK + 70, 0.5);

    // ── the bed, mud on both sides at the ebb ───────────────────────────────────
    washFill(g, [
      { x: RIVER_LEFT, y: FAR_BANK + 14 }, { x: RIVER_RIGHT, y: FAR_BANK + 14 },
      { x: RIVER_RIGHT, y: NEAR_BANK + 40 }, { x: RIVER_LEFT, y: NEAR_BANK + 40 },
    ], shadePigment(PIGMENT.nau, 0.78), 3401, 0.72, 2.4);

    // The stakes, drawn whole and then drowned. That z-order is the entire trick of the battle: on
    // the flood they are simply not there.
    for (const spec of STAKES) {
      stake(g, spec.x, spec.y, spec.length, spec.lean, spec.seed, 1);
    }
    water(g, RIVER_LEFT - 500, RIVER_RIGHT + 500, surface, floor, 3501, at, 0.74);
    tideLine(g, RIVER_LEFT - 500, RIVER_RIGHT + 500, surface, 3, 0.3);

    // Everything floating, painted bottom-up: a stake has to stand in front of the hull it is
    // holding, and a nearer ship has to overlap a further one.
    const floating: Array<{ y: number; draw: () => void }> = [];

    FLEET.forEach((ship, index) => {
      const drift = lerp(-160, 0, smoother(span(t, 0, 1.4 + ship.hold)));
      const struck = span(t, 0.5 + ship.hold * 0.9, 1.5 + ship.hold * 0.9);
      const heel = struck * (0.17 + (index % 3) * 0.06) * (index % 2 === 0 ? 1 : -1);
      const wreck = span(t, 1.3 + ship.hold * 0.9, 3.6 + ship.hold * 0.9);
      const y = ship.y + struck * 14;
      floating.push({
        y,
        draw: () => {
          junk(g, ship.x + drift, y + Math.sin(at * 1.4 + index) * (1 - struck) * 3, ship.s, ship.seed, {
            heel, sail: 1 - wreck * 0.7, wreck,
          });
          const burn = span(t, 1.4 + ship.hold * 0.9, 2.3 + ship.hold * 0.9);
          if (burn > 0.02) {
            fire(g, ship.x + drift + 3 * ship.s, y - 4, ship.s * 2.3, ship.seed + 3, burn);
            smoke(g, ship.x + drift + 3 * ship.s, y - 16, ship.s * 0.9, ship.seed + 7,
              (at * 0.2 + index * 0.23) % 1, 0.34 * burn);
          }
        },
      });
    });

    // On the ebb the stakes come back out of the water, in front of the hulls sitting on them.
    if (bare > 0.02) {
      for (const spec of STAKES) {
        floating.push({
          y: spec.y,
          draw: () => stake(g, spec.x, spec.y, spec.length * bare, spec.lean, spec.seed + 1, 1),
        });
      }
    }

    // Two light boats standing off upstream, which is what the fleet followed in.
    const away = smoother(span(t, 0, 4.1));
    floating.push({
      y: 380,
      draw: () => {
        skiff(g, lerp(-1500, -820, away), 300, 3.4, 9501, -1);
        skiff(g, lerp(-1800, -1150, away), 380, 4.0, 9503, -1);
      },
    });

    // Spars adrift. Four hundred ships came apart here, and an empty river between the wrecks is
    // the one thing the plate cannot afford to show.
    const adrift = span(t, 1.8, 3.2);
    if (adrift > 0.02) {
      for (let spar = 0; spar < 14; spar += 1) {
        const rand = mulberry32(spar * 2213);
        const sx = -1400 + rand() * 2800;
        const sy = lerp(-180, 520, rand());
        if (sy < surface + 20 || sy > floor - 20) continue;
        const angle = (rand() - 0.5) * 2.4;
        const length = (16 + rand() * 30) * (1 + (sy + 260) / 900);
        floating.push({
          y: sy,
          draw: () => inkPath(g, [
            { x: sx - Math.cos(angle) * length, y: sy - Math.sin(angle) * length * 0.5 },
            { x: sx + Math.cos(angle) * length, y: sy + Math.sin(angle) * length * 0.5 },
          ], spar * 17, { width: 2.6, alpha: 0.7 * adrift, colour: PIGMENT.nauDark, wobble: 0.5, step: 12 }),
        });
      }
    }

    floating.sort((a, b) => a.y - b.y).forEach((item) => item.draw());

    // ── the near bank, and the army that has been waiting since before dark ─────
    horizon(g, NEAR_BANK + 70, RIVER_LEFT - 500, RIVER_RIGHT + 500, NEAR_BANK + 1100,
      PIGMENT.tramDeep, 3601, 0.5);
    host(g, {
      x: 150, y: NEAR_BANK + 250, s: 13.5, cols: 15, rows: 3, rankPitch: 2.6,
      theme: 'tran', seed: 9601, t: at,
      accent: PIGMENT.son,
      tier: (rank) => (rank === 0 ? 2 : 1),
      arm: (rank, file) => (rank === 1 ? 'bow' : file % 4 === 0 ? 'sword' : 'spear'),
      arrive: (rank) => stagger(t, 0.2, 0.2, rank, 0.8),
    });
    for (let flag = 0; flag < 4; flag += 1) {
      const up = span(t, 0.4 + flag * 0.16, 1.2 + flag * 0.16);
      if (up <= 0.01) continue;
      banner(g, -620 + flag * 540, NEAR_BANK + 246, 3.2 * outCubic(up), 9700 + flag,
        PIGMENT.son, at * 1.8 + flag, 52);
    }

    // Reeds, close. The frame is read past them into the river.
    near(ctx, 0.52, () => {
      for (let clump = 0; clump < 8; clump += 1) {
        const rand = mulberry32(clump * 613);
        bamboo(g, -1100 + clump * 330 + (rand() - 0.5) * 110, 1060 + rand() * 110, 10 + rand() * 5, clump * 37);
      }
      for (let tuft = 0; tuft < 26; tuft += 1) {
        const rand = mulberry32(tuft * 1877);
        grassTuft(g, -1300 + rand() * 3000, 940 + rand() * 230, 14 + rand() * 11, tuft * 23);
      }
    });

    // And the birds come back, which is how a plate says it is over.
    if (span(t, 2.8, 3.6) > 0.01) {
      birds(g, at, RIVER_LEFT, FAR_BANK - 380, 6, 0.045, 0);
    }
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// Plate 5 · Vạn Thắng — the mandate
// ═══════════════════════════════════════════════════════════════════════════════

let drumMark: HTMLImageElement | undefined;
let drumReady = false;

/**
 * The game's own mark — the face of the Ngọc Lũ drum, cut by `scripts/build-icon.mjs`.
 *
 * `favicon.svg` rather than `icon.svg`: the two are the same drawing, and the difference is that
 * the icon carries its sheet of điệp paper with it. Composited onto a plate that already *is* a
 * sheet of điệp paper, that arrives as a pale square around the mark.
 */
export function loadDrum(): Promise<void> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => { drumMark = image; drumReady = true; resolve(); };
    image.onerror = () => resolve();
    image.src = '/favicon.svg';
  });
}

const TITLE_FROM = 14.2;

const title: Scene = {
  name: 'title',
  from: TITLE_FROM,
  to: 18.0,
  shot: (t) => ({
    cx: COAST_BOUNDS.cx + 10,
    // After the flood the map is no longer the subject: it slides up behind the drum and shrinks,
    // leaving the lower two thirds of the sheet as clean paper for the type.
    cy: COAST_BOUNDS.cy + lerp(0, 250, smoother(span(t, 1.1, 2.9))),
    half: lerp(372, 840, smoother(span(t, 0.8, 3.4))),
  }),
  veil: (t) => 1 - span(t, 0, 0.3),
  draw: (g, ctx, t) => {
    const fade = 1 - smooth(span(t, 1.2, 2.4)) * 0.9;

    ctx.save();
    ctx.globalAlpha = fade;
    drawRealm(g, ctx, 1, 1, PIGMENT.tramPale, 0.4);

    // Sỏi son floods the realm from Thăng Long outward. This is the map's own control wash, and the
    // one moment in the film the player's colour takes a whole country.
    const flood = smoother(span(t, 0.1, 1.5));
    if (flood > 0.01) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(THANG_LONG.x, THANG_LONG.y, flood * 1200, 0, Math.PI * 2);
      ctx.clip();
      washFill(g, COAST, PIGMENT.son, 41, 0.46, 2.6);
      inkPath(g, COAST, 42, { width: 2.0, alpha: 0.85, colour: PIGMENT.sonDeep, wobble: 1.6, step: 22 });
      ctx.restore();
    }

    // And keeps going south, which is the game's other four hundred years in one gesture.
    const south = smoother(span(t, 1.0, 2.2));
    if (south > 0.01) {
      const run = trimPath(SEA_LINE, south);
      if (run.length > 1) {
        inkPath(g, run, 61, { width: 1.6, alpha: 0.34 * south, colour: PIGMENT.son, wobble: 1.4, step: 18 });
      }
    }

    citadel(g, THANG_LONG.x, THANG_LONG.y + 14, 1.5, 'tran', 903);
    ctx.restore();
  },
};

// ═══════════════════════════════════════════════════════════════════════════════

export const SCENES: Scene[] = [sheet, delta, north, river, title];

export const DURATION = SCENES[SCENES.length - 1].to;

/**
 * The title plate's lettering, drawn in **screen space** rather than in the world.
 *
 * Type is the one thing in the film that must not pan, wobble or scale with the camera — a title
 * that drifts reads as a caption stuck onto a photograph. It also has to respect the frame's real
 * shape rather than the safe square, so it is laid out against the output size.
 */
export function titlePlate(
  ctx: CanvasRenderingContext2D, g: G, width: number, height: number, t: number,
): void {
  const local = t - TITLE_FROM;
  if (local < 1.0) return;

  const cx = width / 2;
  const unit = Math.min(width, height) / 1080;
  const tall = height > width;

  const drumY = tall ? height * 0.30 : height * 0.24;
  const nameY = tall ? height * 0.505 : height * 0.535;
  const ruleY = nameY + 62 * unit;
  const subY = nameY + 112 * unit;
  const lineY = nameY + 178 * unit;
  const sealY = nameY + 290 * unit;

  const up = stamp(span(local, 1.1, 2.0));
  if (drumReady && drumMark && up > 0.01) {
    const size = 320 * unit * lerp(0.74, 1, up);
    ctx.save();
    ctx.globalAlpha = Math.min(1, up * 1.3);
    ctx.drawImage(drumMark, cx - size / 2, drumY - size / 2, size, size);
    ctx.restore();
  }

  const line = (text: string, font: string, y: number, alpha: number, spacing = 0, colour = '#2a2118'): void => {
    if (alpha <= 0.01) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = colour;
    ctx.font = font;
    ctx.textBaseline = 'middle';
    if (spacing === 0) {
      ctx.textAlign = 'center';
      ctx.fillText(text, cx, y);
    } else {
      // Canvas2D grew `letterSpacing` only recently; measured placement works everywhere and lets
      // the tracking be a design number rather than a browser feature.
      ctx.textAlign = 'left';
      const glyphs = [...text];
      const widths = glyphs.map((glyph) => ctx.measureText(glyph).width);
      const total = widths.reduce((sum, w) => sum + w, 0) + spacing * (glyphs.length - 1);
      let x = cx - total / 2;
      glyphs.forEach((glyph, index) => {
        ctx.fillText(glyph, x, y);
        x += widths[index] + spacing;
      });
    }
    ctx.restore();
  };

  // VẠN THẮNG. Source Serif 4 — the game's own title face, and one of the few with a real
  // Vietnamese design: two marks stack over the Ạ and the Ắ here, and a face without them either
  // collides or quietly drops one.
  const nameIn = stamp(span(local, 2.0, 2.8));
  if (nameIn > 0.01) {
    ctx.save();
    ctx.translate(cx, nameY);
    ctx.scale(lerp(1.14, 1, nameIn), lerp(1.14, 1, nameIn));
    ctx.translate(-cx, -nameY);
    line('VẠN THẮNG', `700 ${Math.round(128 * unit)}px "Source Serif 4", Georgia, serif`,
      nameY, Math.min(1, nameIn * 1.5), 7 * unit);
    ctx.restore();
  }

  const rule = span(local, 2.6, 3.0);
  if (rule > 0.01) {
    const half = 210 * unit * rule;
    inkPath(g, [{ x: cx - half, y: ruleY }, { x: cx + half, y: ruleY }], 8801, {
      width: 1.5, alpha: 0.45, wobble: 0.7, step: 22,
    });
  }

  line('TEN THOUSAND VICTORIES',
    `600 ${Math.round(33 * unit)}px "Be Vietnam Pro", system-ui, sans-serif`,
    subY, span(local, 2.7, 3.2), 9 * unit, '#5a4c39');

  line('Rule Đại Việt. The realm does not wait for you.',
    `400 ${Math.round(30 * unit)}px "Be Vietnam Pro", system-ui, sans-serif`,
    lineY, span(local, 3.0, 3.4), 0, '#5a4c39');

  // The seal. Stakes, because of what the fourth plate was about, and because the device is drawn
  // and never written.
  const sealIn = stamp(span(local, 3.2, 3.7));
  if (sealIn > 0.01) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, sealIn * 1.5);
    seal(g, cx, sealY, 92 * unit * lerp(1.22, 1, sealIn), 'stakes');
    ctx.restore();
  }
}
