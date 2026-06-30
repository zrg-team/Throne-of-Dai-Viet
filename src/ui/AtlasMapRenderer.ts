import Phaser from 'phaser';
import type { HexTerrainType } from '../map/terrainTypes';
import type { PixelPoint } from '../map/hex';
import type { MapRenderer } from './MapRenderer';
import type { MapThemeDefinition, MapThemePalette } from './mapTheme';
import { brushStroke, inkOutline, shade, washFill } from './inkTheme';

/**
 * Environment renderer for the illustrated-atlas theme. Hand-inked, watercolour
 * look on warm parchment: wobbly brush outlines, layered terrain silhouettes,
 * and round-canopy groves — modelled on classical illustrated war maps rather
 * than flat printed cartography.
 */
export class AtlasMapRenderer implements MapRenderer {
  constructor(
    private readonly scene: Phaser.Scene,
    readonly theme: MapThemeDefinition,
  ) {}

  get palette(): MapThemePalette {
    return this.theme.palette;
  }

  drawBackground(worldWidth: number, worldHeight: number): Phaser.GameObjects.Graphics {
    const { paper, paperLight, paperShade, inkSoft } = this.theme.palette;
    const graphics = this.scene.add.graphics();

    // Warm parchment wash, lighter toward the top-left as if lit.
    graphics.fillGradientStyle(paperLight, paper, paper, paperShade, 1);
    graphics.fillRect(0, 0, worldWidth, worldHeight);

    // Broad tea-stain blotches give the paper an aged, uneven tone.
    for (let index = 0; index < 18; index += 1) {
      const seed = index * 131 + 17;
      const x = (seed * 71) % worldWidth;
      const y = (seed * 113) % worldHeight;
      graphics.fillStyle(index % 2 === 0 ? paperShade : paperLight, 0.05);
      graphics.fillEllipse(x, y, 180 + (seed % 6) * 60, 130 + (seed % 5) * 50);
    }

    // Fine paper-fibre flecks for grain.
    for (let index = 0; index < 320; index += 1) {
      const seed = index * 97 + 31;
      graphics.fillStyle(seed % 3 === 0 ? paperShade : paperLight, 0.06 + (seed % 5) * 0.01);
      graphics.fillCircle((seed * 29) % worldWidth, (seed * 53) % worldHeight, 0.8 + (seed % 4) * 0.6);
    }

    // Soft vignette: corner shading + an inner border that frames the page.
    graphics.fillStyle(paperShade, 0.05);
    for (const [cx, cy] of [[0, 0], [worldWidth, 0], [0, worldHeight], [worldWidth, worldHeight]] as const) {
      graphics.fillCircle(cx, cy, Math.min(worldWidth, worldHeight) * 0.34);
    }
    for (let inset = 0; inset < 26; inset += 1) {
      graphics.lineStyle(1, paperShade, 0.05 * (1 - inset / 26));
      graphics.strokeRect(inset, inset, worldWidth - inset * 2, worldHeight - inset * 2);
    }
    graphics.lineStyle(1.4, inkSoft, 0.22);
    graphics.strokeRect(18, 18, worldWidth - 36, worldHeight - 36);

    return graphics;
  }

  drawHexFill(graphics: Phaser.GameObjects.Graphics, corners: PixelPoint[], color: number): void {
    graphics.fillStyle(color, 1);
    graphics.fillPoints(corners, true);
    // A faint inner wash keeps adjacent same-terrain hexes from reading as flat colour blocks.
    graphics.fillStyle(shade(color, 0.92), 0.16);
    const cx = corners.reduce((s, c) => s + c.x, 0) / corners.length;
    const cy = corners.reduce((s, c) => s + c.y, 0) / corners.length;
    graphics.fillEllipse(cx, cy, 18, 12);
  }

  decorateTerrain(graphics: Phaser.GameObjects.Graphics, terrain: HexTerrainType, centers: PixelPoint[], size: number, rng: () => number): void {
    if (centers.length === 0) return;
    switch (terrain) {
      case 'plains':
        centers.forEach((center) => this.drawGrass(graphics, center, size, rng));
        return;
      case 'fields':
        centers.forEach((center) => this.drawPaddies(graphics, center, size, rng, false));
        return;
      case 'riceFields':
        centers.forEach((center) => this.drawPaddies(graphics, center, size, rng, true));
        return;
      case 'forest':
        this.drawForest(graphics, centers, size, rng);
        return;
      case 'mountains':
        this.drawMountains(graphics, centers, size, rng);
        return;
      case 'hills':
        this.drawHills(graphics, centers, size, rng);
        return;
      case 'water':
        centers.forEach((center) => this.drawWater(graphics, center, size, rng));
        return;
      case 'fortress':
        centers.forEach((center) => this.drawFortress(graphics, center, size));
        return;
      default:
        return;
    }
  }

  drawCloud(graphics: Phaser.GameObjects.Graphics, x: number, y: number, baseRadius: number, seed: number, alpha = 0.9): void {
    const { fog, inkSoft } = this.theme.palette;
    const puffs = 5 + (seed % 3);
    graphics.fillStyle(inkSoft, alpha * 0.12);
    for (let index = 0; index < puffs; index += 1) {
      const angle = (seed + index * 47) * Phaser.Math.DEG_TO_RAD;
      const distance = baseRadius * (0.16 + ((seed >> index) & 3) * 0.08);
      graphics.fillCircle(x + Math.cos(angle) * distance, y + Math.sin(angle) * distance + baseRadius * 0.16, baseRadius * (0.42 + (index % 3) * 0.08));
    }
    graphics.fillStyle(fog, alpha);
    for (let index = 0; index < puffs; index += 1) {
      const angle = (seed + index * 47) * Phaser.Math.DEG_TO_RAD;
      const distance = baseRadius * (0.16 + ((seed >> index) & 3) * 0.08);
      graphics.fillCircle(x + Math.cos(angle) * distance, y + Math.sin(angle) * distance, baseRadius * (0.42 + (index % 3) * 0.08));
    }
  }

  drawZoneBorder(graphics: Phaser.GameObjects.Graphics, edges: Array<[number, number, number, number]>, color: number, alpha = 0.95): void {
    const { paperLight, ink } = this.theme.palette;
    for (const [x1, y1, x2, y2] of edges) {
      const seed = Math.round(x1 + y1 * 3 + x2 * 7 + y2 * 11);
      const points: PixelPoint[] = [{ x: x1, y: y1 }, { x: x2, y: y2 }];
      // Pale paper highlight, a soft ink shadow, then the coloured ownership stroke.
      brushStroke(graphics, points, 2.6, paperLight, alpha * 0.7, seed);
      brushStroke(graphics, points, 1.4, ink, alpha * 0.45, seed + 41);
      brushStroke(graphics, points, 1.6, color, alpha * 0.85, seed + 97);
    }
  }

  drawRoad(graphics: Phaser.GameObjects.Graphics, points: PixelPoint[], widthFrom: number, widthTo: number): void {
    const { paperLight, cityRoad } = this.theme.palette;
    for (let index = 0; index < points.length - 1; index += 1) {
      const t = index / (points.length - 1);
      const width = Math.max(1, Phaser.Math.Linear(widthFrom, widthTo, t) * 0.44);
      const seg: PixelPoint[] = [points[index], points[index + 1]];
      brushStroke(graphics, seg, width + 2, paperLight, 0.5, index * 17);
      brushStroke(graphics, seg, width, cityRoad.track, 0.6, index * 17 + 53);
    }
  }

  private drawGrass(graphics: Phaser.GameObjects.Graphics, center: PixelPoint, size: number, rng: () => number): void {
    graphics.lineStyle(0.8, this.theme.palette.inkSoft, 0.26);
    for (let index = 0; index < 7; index += 1) {
      const x = center.x + (rng() - 0.5) * size * 1.08;
      const y = center.y + (rng() - 0.5) * size * 0.84;
      graphics.lineBetween(x, y + 2.2, x + (rng() - 0.5) * 2.5, y - 2.8);
    }
  }

  /** Isometric paddy diamonds with raised bunds; rice plots get a faint water sheen. */
  private drawPaddies(graphics: Phaser.GameObjects.Graphics, center: PixelPoint, size: number, rng: () => number, rice: boolean): void {
    const { terrain, inkSoft, waterHighlight } = this.theme.palette;
    const fill = rice ? terrain.riceFields : terrain.fields;
    const w = size * 0.5;
    const h = size * 0.3;
    for (const [dx, dy] of [[-0.26, -0.16], [0.26, -0.1], [-0.1, 0.22], [0.32, 0.26]] as const) {
      const x = center.x + dx * size + (rng() - 0.5) * 2;
      const y = center.y + dy * size + (rng() - 0.5) * 2;
      const top = { x, y: y - h / 2 };
      const right = { x: x + w / 2, y };
      const bottom = { x, y: y + h / 2 };
      const left = { x: x - w / 2, y };
      const diamond = [top, right, bottom, left];
      graphics.fillStyle(fill, 0.55);
      graphics.fillPoints(diamond, true);
      if (rice) {
        graphics.fillStyle(waterHighlight, 0.18);
        graphics.fillPoints(diamond, true);
      }
      inkOutline(graphics, diamond, inkSoft, 0.42, true, Math.round(x * 3 + y * 7));
      // Furrow lines running with the plot.
      graphics.lineStyle(0.7, inkSoft, rice ? 0.3 : 0.4);
      for (let row = 1; row <= 3; row += 1) {
        const t = row / 4;
        graphics.lineBetween(
          left.x + (top.x - left.x) * t, left.y + (top.y - left.y) * t,
          bottom.x + (right.x - bottom.x) * t, bottom.y + (right.y - bottom.y) * t,
        );
      }
    }
  }

  /** Round-canopy groves: clustered broadleaf trees with cast shadow, layered foliage, a two-tone trunk, and a lumpy hand-drawn outline. */
  private drawForest(graphics: Phaser.GameObjects.Graphics, centers: PixelPoint[], size: number, rng: () => number): void {
    const { ink, inkSoft, terrain, mapObjects } = this.theme.palette;
    const canopyDark = shade(terrain.forest, 0.74);
    const canopyMid = shade(terrain.forest, 0.92);
    const count = Math.max(5, Math.round(centers.length * 5.5));
    const trees = Array.from({ length: count }, () => {
      const anchor = centers[Math.floor(rng() * centers.length)];
      return {
        x: anchor.x + (rng() - 0.5) * size * 1.3,
        y: anchor.y + (rng() - 0.5) * size * 1.05,
        radius: size * (0.17 + rng() * 0.12),
        seed: Math.floor(rng() * 9999),
      };
    });
    trees.sort((a, b) => a.y - b.y);

    for (const { x, y, radius, seed } of trees) {
      const crownY = y - radius * 0.24;

      // Soft cast shadow on the ground.
      graphics.fillStyle(ink, 0.12);
      graphics.fillEllipse(x + radius * 0.2, y + radius * 1.0, radius * 1.95, radius * 0.6);

      // Two-tone trunk rising into the canopy.
      brushStroke(graphics, [{ x, y: y + radius * 1.02 }, { x: x - radius * 0.04, y: crownY + radius * 0.3 }], radius * 0.2, mapObjects.trunk, 0.95, seed + 7);
      brushStroke(graphics, [{ x: x + radius * 0.05, y: y + radius * 0.96 }, { x, y: crownY + radius * 0.34 }], radius * 0.08, shade(mapObjects.trunk, 1.22), 0.6, seed + 9);

      // Layered canopy: a deep base ring, overlapping mid-tone lobes, then a rounded crown.
      graphics.fillStyle(canopyDark, 0.97);
      graphics.fillCircle(x - radius * 0.58, crownY + radius * 0.22, radius * 0.66);
      graphics.fillCircle(x + radius * 0.6, crownY + radius * 0.26, radius * 0.62);
      graphics.fillCircle(x, crownY + radius * 0.34, radius * 0.78);
      graphics.fillStyle(canopyMid, 0.98);
      graphics.fillCircle(x - radius * 0.4, crownY + radius * 0.02, radius * 0.6);
      graphics.fillCircle(x + radius * 0.42, crownY + radius * 0.06, radius * 0.56);
      graphics.fillStyle(terrain.forest, 0.98);
      graphics.fillCircle(x, crownY - radius * 0.06, radius * 0.86);
      // Sun-side highlight clusters.
      graphics.fillStyle(mapObjects.foliageHighlight, 0.85);
      graphics.fillCircle(x - radius * 0.36, crownY - radius * 0.42, radius * 0.46);
      graphics.fillCircle(x - radius * 0.02, crownY - radius * 0.52, radius * 0.3);

      // Hand-drawn lumpy outline around the whole crown.
      const ring: PixelPoint[] = [];
      const lobes = 11;
      for (let i = 0; i < lobes; i += 1) {
        const a = (i / lobes) * Math.PI * 2;
        const rr = radius * (1.0 + ((seed >> i) & 3) * 0.05);
        ring.push({ x: x + Math.cos(a) * rr, y: crownY + Math.sin(a) * rr });
      }
      inkOutline(graphics, ring, ink, 0.5, true, seed);

      // A couple of shaded foliage clefts for hand-inked depth.
      graphics.lineStyle(Math.max(0.8, radius * 0.06), inkSoft, 0.4);
      graphics.lineBetween(x + radius * 0.1, crownY - radius * 0.2, x + radius * 0.24, crownY + radius * 0.28);
      graphics.lineBetween(x - radius * 0.3, crownY + radius * 0.04, x - radius * 0.2, crownY + radius * 0.4);
    }
  }

  /** Layered ink-silhouette mountains with an inner ridge, snow cap, and a mist band. */
  private drawMountains(graphics: Phaser.GameObjects.Graphics, centers: PixelPoint[], size: number, rng: () => number): void {
    const { mountains } = this.theme.palette.terrain;
    const { ink, inkSoft, paperLight, fog } = this.theme.palette;
    const peaks = [...centers]
      .sort(() => rng() - 0.5)
      .slice(0, Math.max(1, Math.round(centers.length * 0.85)))
      .map((peak) => {
        const scale = 1.0 + rng() * 0.7;
        return {
          px: peak.x + (rng() - 0.5) * size * 0.5,
          py: peak.y + size * 0.28,
          halfW: size * 0.6 * scale,
          h: size * 0.78 * scale,
          jx: (rng() - 0.5) * size * 0.22,
          seed: Math.round(peak.x * 3 + peak.y * 7),
        };
      })
      .sort((a, b) => a.py - b.py);

    for (const { px, py, halfW, h, jx, seed } of peaks) {
      const pts = [
        { x: px - halfW, y: py },
        { x: px - halfW * 0.52, y: py - h * 0.5 },
        { x: px - halfW * 0.16 + jx, y: py - h * 0.8 },
        { x: px + jx, y: py - h },
        { x: px + halfW * 0.22 + jx, y: py - h * 0.82 },
        { x: px + halfW * 0.5, y: py - h * 0.46 },
        { x: px + halfW, y: py },
      ];
      washFill(graphics, pts, mountains, 0.97, rng);
      inkOutline(graphics, pts, ink, 0.8, false, seed);

      const innerPts = [
        { x: px - halfW * 0.5, y: py - 2 },
        { x: px - halfW * 0.18 + jx, y: py - h * 0.72 },
        { x: px + jx, y: py - h * 0.94 },
        { x: px + halfW * 0.24 + jx, y: py - h * 0.74 },
        { x: px + halfW * 0.5, y: py - 2 },
      ];
      inkOutline(graphics, innerPts, inkSoft, 0.4, false, seed + 11);

      // Snow cap.
      graphics.fillStyle(paperLight, 0.85);
      graphics.fillTriangle(px + jx, py - h, px + jx - halfW * 0.2, py - h * 0.72, px + jx + halfW * 0.18, py - h * 0.68);
      // Mist band across the mid-slopes.
      graphics.fillStyle(fog, 0.4);
      graphics.fillEllipse(px, py - h * 0.36, halfW * 1.5, h * 0.2);
    }
  }

  /** Asymmetric ink-wash hill mounds with horizontal contour strokes. */
  private drawHills(graphics: Phaser.GameObjects.Graphics, centers: PixelPoint[], size: number, rng: () => number): void {
    const { hills } = this.theme.palette.terrain;
    const { ink, inkSoft } = this.theme.palette;
    const mounds = [...centers]
      .sort(() => rng() - 0.5)
      .slice(0, Math.max(1, Math.round(centers.length * 0.85)))
      .map((center) => {
        const scale = 0.8 + rng() * 0.6;
        return {
          px: center.x + (rng() - 0.5) * size * 0.6,
          py: center.y + size * 0.24,
          halfW: size * (0.5 + rng() * 0.3) * scale,
          h: size * (0.3 + rng() * 0.18) * scale,
          jx: (rng() - 0.5) * size * 0.3,
          seed: Math.round(center.x * 3 + center.y * 7),
        };
      })
      .sort((a, b) => a.py - b.py);

    for (const { px, py, halfW, h, jx, seed } of mounds) {
      const pts = [
        { x: px - halfW, y: py },
        { x: px - halfW * 0.56, y: py - h * 0.5 },
        { x: px - halfW * 0.16 + jx, y: py - h * 0.84 },
        { x: px + jx, y: py - h },
        { x: px + halfW * 0.28 + jx, y: py - h * 0.8 },
        { x: px + halfW * 0.58, y: py - h * 0.44 },
        { x: px + halfW, y: py },
      ];
      washFill(graphics, pts, hills, 0.62, rng);
      inkOutline(graphics, pts, inkSoft, 0.46, false, seed);

      graphics.lineStyle(0.8, inkSoft, 0.24);
      for (const tH of [0.4, 0.62]) {
        const wAtH = halfW * Math.sqrt(Math.max(0, 1 - tH * tH));
        const ty = py - tH * h;
        graphics.lineBetween(px + jx - wAtH * 0.72, ty, px + jx + wAtH * 0.7, ty);
      }
      graphics.fillStyle(ink, 0.05);
      graphics.fillEllipse(px, py + 2, halfW * 1.7, h * 0.22);
    }
  }

  /** Flowing river surface: layered current lines, bright highlights, and small eddies. */
  private drawWater(graphics: Phaser.GameObjects.Graphics, center: PixelPoint, size: number, rng: () => number): void {
    const { waterDeep, waterHighlight } = this.theme.palette;
    for (const offset of [-0.3, -0.05, 0.18, 0.4]) {
      const y = center.y + size * offset;
      const bright = offset === -0.05 || offset === 0.4;
      waveLine(graphics, center.x - size * 0.5, y, center.x + size * 0.5, y, size * 0.05, 7, bright ? waterHighlight : waterDeep, bright ? 0.5 : 0.4);
    }
    // A couple of curling eddies.
    graphics.lineStyle(1, waterDeep, 0.4);
    for (let i = 0; i < 2; i += 1) {
      const ex = center.x + (rng() - 0.5) * size * 0.6;
      const ey = center.y + (rng() - 0.5) * size * 0.5;
      graphics.beginPath();
      graphics.arc(ex, ey, size * 0.1, Phaser.Math.DegToRad(20), Phaser.Math.DegToRad(250));
      graphics.strokePath();
    }
  }

  private drawFortress(graphics: Phaser.GameObjects.Graphics, center: PixelPoint, size: number): void {
    const { inkSoft } = this.theme.palette;
    graphics.lineStyle(1, inkSoft, 0.3);
    for (let row = -1; row <= 1; row += 1) {
      graphics.lineBetween(center.x - size * 0.54, center.y + row * size * 0.28, center.x + size * 0.54, center.y + row * size * 0.28);
    }
    const offsets = [-0.27, 0, 0.27];
    for (let col = 0; col < offsets.length; col += 1) {
      const x = center.x + offsets[col] * size;
      const rowShift = (col % 2) * size * 0.14;
      graphics.lineBetween(x, center.y - size * 0.4 + rowShift, x, center.y + size * 0.4 + rowShift);
    }
  }
}

function waveLine(graphics: Phaser.GameObjects.Graphics, x1: number, y1: number, x2: number, y2: number, amplitude: number, segments: number, color: number, alpha: number): void {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.hypot(dx, dy) || 1;
  const nx = -dy / length;
  const ny = dx / length;
  graphics.lineStyle(1, color, alpha);
  let prevX = x1;
  let prevY = y1;
  for (let index = 1; index <= segments; index += 1) {
    const t = index / segments;
    const wobble = Math.sin(t * Math.PI * 2) * amplitude;
    const x = x1 + dx * t + nx * wobble;
    const y = y1 + dy * t + ny * wobble;
    graphics.lineBetween(prevX, prevY, x, y);
    prevX = x;
    prevY = y;
  }
}
