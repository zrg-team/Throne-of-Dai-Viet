import Phaser from 'phaser';
import { PIGMENT } from './palette';
import { inkPath, washFill, type Pt } from './stroke';
import type { StoryBand } from '../../state/types';

/**
 * The band behind a story card.
 *
 * Twelve generic impressions, chosen by tag rather than by story, and **never** one image per
 * story. A template binds a random hero and a random province, so a picture specific to one
 * instance is a lie on every other map: an illustration of "the fisherman of Vân Đồn" is wrong
 * the moment the story binds somewhere else. The same band showing up across many stories is
 * correct rather than a compromise, because the stories are generic templates and should look
 * like it. Twelve bands, once, instead of twenty illustrations.
 *
 * Drawn from the same woodblock primitives as everything else — a colour wash pulled off-register
 * from a hand-pulled contour — and seeded per fragment, so no two impressions are identical the
 * way no two pulls of a real block are.
 */

/** A stable numeric seed from the fragment's identity, so a card looks the same each time it opens. */
function seedOf(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Where the ground line sits, as a fraction of the band's height.
 *
 * Pushed low across the board: the first cut put the horizon near the middle and left the
 * silhouette only a few pixels of headroom, so every tag rendered as the same faint line.
 */
const HORIZON: Record<StoryBand, number> = {
  court: 0.82, river: 0.66, field: 0.78, coast: 0.62, mountain: 0.88, march: 0.84,
  fire: 0.86, granary: 0.82, night: 0.6, crowd: 0.86, shrine: 0.82, border: 0.8,
};

/**
 * Which pigment carries the wash. Deliberately narrow, and deliberately never `son` — the one
 * rule the art direction hangs on is that sỏi son is spent on the player alone.
 */
const WASH: Record<StoryBand, number> = {
  court: PIGMENT.hoe, river: PIGMENT.cham, field: PIGMENT.giDong, coast: PIGMENT.cham,
  mountain: PIGMENT.diepDeep, march: PIGMENT.nau, fire: PIGMENT.hoe,
  granary: PIGMENT.hoe, night: PIGMENT.cham, crowd: PIGMENT.hoePale,
  shrine: PIGMENT.giDong, border: PIGMENT.diepDeep,
};

export function drawStoryBand(
  scene: Phaser.Scene,
  band: StoryBand,
  key: string,
  width: number,
  height: number,
): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  const seed = seedOf(`${band}:${key}`);
  const horizon = height * HORIZON[band];

  // The colour block, pulled first and registered by hand — the offset is the whole trick.
  washFill(g, [
    { x: 0, y: horizon },
    { x: width, y: horizon },
    { x: width, y: height },
    { x: 0, y: height },
  ], WASH[band], seed, 0.2, 2.2);

  const contour: Pt[] = [];
  const steps = 22;

  switch (band) {
    case 'mountain':
    case 'border': {
      // Karst: one summit and one lower shoulder, deliberately unequal — equal lobes read as
      // a comb of spikes, which is the mistake the map's own karst went through twice.
      for (let i = 0; i <= steps; i += 1) {
        const t = i / steps;
        const peak = Math.exp(-((t - 0.3) ** 2) / 0.008) * height * 0.78
          + Math.exp(-((t - 0.66) ** 2) / 0.016) * height * 0.5;
        contour.push({ x: t * width, y: horizon - peak });
      }
      break;
    }
    case 'river':
    case 'coast': {
      for (let i = 0; i <= steps; i += 1) {
        const t = i / steps;
        contour.push({ x: t * width, y: horizon + Math.sin(t * 7) * 4 });
      }
      // Three receding water lines rather than one — a river reads by repetition.
      for (let k = 1; k <= 3; k += 1) {
        inkPath(g, contour.map((p) => ({ x: p.x, y: p.y + k * 6 })), seed + k, {
          width: 0.9, alpha: 0.45 - k * 0.08,
        });
      }
      // A far bank above the water.
      inkPath(g, [
        { x: 0, y: horizon - height * 0.28 },
        { x: width * 0.35, y: horizon - height * 0.42 },
        { x: width * 0.7, y: horizon - height * 0.26 },
        { x: width, y: horizon - height * 0.34 },
      ], seed + 9, { width: 1.1, alpha: 0.5 });
      break;
    }
    case 'court':
    case 'shrine':
    case 'granary': {
      // A hall: two swept eaves over a pair of pillars. The eaves curl *upward* at the ends,
      // which is the one line that says Đại Việt rather than "generic building".
      // The eaves of a đình curve *up* at the tips, and the roof sags between them. Written as
      // a sag term minus a tip term, because the first attempt added them and produced a hump.
      const ridgeY = horizon - height * 0.72;
      const left = width * 0.06;
      const right = width * 0.94;
      for (let i = 0; i <= steps; i += 1) {
        const t = i / steps;
        const x = left + t * (right - left);
        const sag = Math.cos((t - 0.5) * Math.PI) * height * 0.1;
        const tip = Math.abs(t - 0.5) ** 6 * height * 1.6;
        contour.push({ x, y: ridgeY + sag - tip });
      }
      // Pillars and a floor, so the roof is standing on something.
      for (const px of [left + (right - left) * 0.18, left + (right - left) * 0.5, right - (right - left) * 0.18]) {
        inkPath(g, [{ x: px, y: horizon }, { x: px, y: horizon - height * 0.3 }], seed + Math.round(px), {
          width: 1.0, alpha: 0.55, wobble: 0.4,
        });
      }
      break;
    }
    case 'march':
    case 'crowd': {
      // A column of figures: short verticals at irregular spacing, so it reads as people
      // rather than as a fence.
      let x = width * 0.05;
      let n = 0;
      while (x < width * 0.95) {
        const h = height * (0.34 + ((n * 37) % 11) / 40);
        // Body, then a head — two strokes is the difference between a crowd and a fence.
        inkPath(g, [{ x, y: horizon }, { x, y: horizon - h }], seed + n, { width: 1.3, alpha: 0.7, wobble: 0.5 });
        g.fillStyle(PIGMENT.muc, 0.62);
        g.fillCircle(x, horizon - h - height * 0.06, Math.max(1.2, height * 0.045));
        x += width * (0.05 + ((n * 17) % 7) / 220);
        n += 1;
      }
      for (let i = 0; i <= steps; i += 1) contour.push({ x: (i / steps) * width, y: horizon });
      break;
    }
    case 'fire': {
      for (let i = 0; i <= steps * 2; i += 1) {
        const t = i / (steps * 2);
        contour.push({ x: t * width, y: horizon - Math.abs(Math.sin(t * 13)) ** 0.6 * height * 0.62 });
      }
      break;
    }
    case 'night': {
      for (let i = 0; i < 20; i += 1) {
        g.fillStyle(PIGMENT.mucFaint, 0.5);
        g.fillCircle(((i * 53) % 100) / 100 * width, ((i * 29) % 70) / 100 * horizon, 1.1);
      }
      // A moon, off-centre, because a sky needs one thing that is not a dot.
      g.lineStyle(1.2, PIGMENT.muc, 0.45);
      g.strokeCircle(width * 0.78, horizon * 0.42, height * 0.13);
      for (let i = 0; i <= steps; i += 1) contour.push({ x: (i / steps) * width, y: horizon });
      break;
    }
    default: {
      // field — paddy, with furrows running to the horizon.
      for (let i = 0; i <= steps; i += 1) {
        const t = i / steps;
        // A treeline, so the horizon is not a ruler.
        contour.push({ x: t * width, y: horizon - height * 0.18 - Math.abs(Math.sin(t * 9)) * height * 0.14 });
      }
      for (let i = 1; i < 5; i += 1) {
        const y = horizon + (height - horizon) * (i / 5);
        inkPath(g, [{ x: 0, y }, { x: width, y }], seed + i, { width: 0.8, alpha: 0.3 });
      }
    }
  }

  inkPath(g, contour, seed, { width: 1.3, alpha: 0.7 });
  return g;
}
