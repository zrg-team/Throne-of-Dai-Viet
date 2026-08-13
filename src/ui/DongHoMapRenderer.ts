import Phaser from 'phaser';
import type { HexTerrainType } from '../map/terrainTypes';
import type { PixelPoint } from '../map/hex';
import type { LandscapeContext, MapRenderer } from './MapRenderer';
import type { MapThemeDefinition, MapThemePalette } from './mapTheme';
import { PIGMENT } from './ink/palette';
import { groundTone, hatchPoly, inkPath, mulberry32, printedShape, washFill, type Pt } from './ink/stroke';
import { areca, bamboo, banana, banyan, farmer, grassTuft, karstRange, softRidge, tree } from './ink/props';
import { drawFieldPlot, type FieldPlot } from './ink/settlements';

/**
 * Đông Hồ landscape rendering — the whole map drawn in one pass instead of tile by tile.
 *
 * The rule this class exists to enforce:
 *
 *   **The grid decides where. It never decides what shape.**
 *
 * Nothing here is clipped to a cell. Ground tone blends between cells with a radial falloff, props
 * are one scatter over the whole map that merely *consults* the grid for what to be, ranges and
 * field systems draw as whole objects across many cells, and everything sorts back-to-front so
 * overlap reads as depth.
 *
 * The version that clipped each tile into its own hexagon read, correctly, as a list of dioramas:
 * static, cut off at every boundary, and nothing like a country. Deleting the clip is the single
 * largest change in this art direction.
 */

/** Ground tone per terrain. `null` means bare paper — mountains carry their own fill. */
const GROUND: Partial<Record<HexTerrainType, number | null>> = {
  plains: PIGMENT.giDongPale,
  fields: PIGMENT.giDongPale,
  riceFields: PIGMENT.giDongPale,
  forest: PIGMENT.giDong,
  hills: PIGMENT.diepLo,
  mountains: null,
  water: null,
  fortress: PIGMENT.diepLo,
  shrine: PIGMENT.diepLo,
};

type PropKind = 'tree' | 'tuft' | 'bamboo' | 'banana' | 'areca' | 'banyan' | 'farmer';

interface ScatterSpec {
  count: [number, number];
  kinds: PropKind[];
  scale: [number, number];
}

/** How thickly each terrain is planted, and with what. Trees carry it; bamboo is an accent. */
const SCATTER: Partial<Record<HexTerrainType, ScatterSpec>> = {
  plains: { count: [2, 5], kinds: ['tree', 'tree', 'tree', 'tuft'], scale: [0.55, 1.35] },
  fields: { count: [1, 3], kinds: ['tree', 'tuft', 'farmer'], scale: [0.5, 1.0] },
  riceFields: { count: [1, 2], kinds: ['tree', 'tuft'], scale: [0.6, 0.95] },
  forest: { count: [7, 11], kinds: ['tree', 'tree', 'tree', 'tree', 'bamboo', 'banana'], scale: [0.7, 1.6] },
  hills: { count: [3, 6], kinds: ['tree', 'tree', 'tree', 'tuft'], scale: [0.6, 1.25] },
  mountains: { count: [1, 2], kinds: ['tree', 'tuft'], scale: [0.45, 0.8] },
  fortress: { count: [2, 4], kinds: ['tree', 'banyan'], scale: [0.6, 1.05] },
  shrine: { count: [2, 4], kinds: ['tree', 'banyan'], scale: [0.6, 1.05] },
};

interface ScatterItem {
  x: number;
  y: number;
  kind: PropKind;
  scale: number;
  seed: number;
}

export class DongHoMapRenderer implements MapRenderer {
  constructor(
    private readonly scene: Phaser.Scene,
    readonly theme: MapThemeDefinition,
  ) {}

  get palette(): MapThemePalette {
    return this.theme.palette;
  }

  // ── the wide hook: this renderer owns terrain entirely ──────────────────────

  drawLandscape(ctx: LandscapeContext): void {
    const { graphics, decoration, tiles, tileSize, isVisible } = ctx;
    const visible = tiles.filter((tile) => isVisible(tile));
    if (visible.length === 0) {
      return;
    }

    this.paintGround(graphics, visible, ctx);
    this.paintWater(graphics, visible, ctx);
    this.paintRanges(graphics, visible, ctx);
    this.paintFields(graphics, visible, ctx);
    this.paintScatter(decoration, visible, ctx, tileSize);
  }

  /**
   * Water, as one body rather than as a hexagon of blue.
   *
   * Blended tone gives the sheet of water; the shoreline is then found by looking for cells whose
   * neighbour is dry, and inked along those — so the coast is a drawn edge, not the boundary of a
   * fill. Flow lines run inside, never across it.
   */
  private paintWater(graphics: Phaser.GameObjects.Graphics, tiles: LandscapeContext['tiles'], ctx: LandscapeContext): void {
    const wet = new Set<string>();
    for (const tile of tiles) {
      if (tile.terrain === 'water') {
        wet.add(`${tile.coord.q},${tile.coord.r}`);
      }
    }
    if (wet.size === 0) {
      return;
    }

    for (const tile of tiles) {
      if (tile.terrain !== 'water') {
        continue;
      }
      const centre = ctx.centreOf(tile);
      groundTone(graphics, centre.x, centre.y, ctx.tileSize * 1.15, PIGMENT.chamWash, 0.5);
    }

    const rand = mulberry32(4400);
    for (const tile of tiles) {
      if (tile.terrain !== 'water') {
        continue;
      }
      const centre = ctx.centreOf(tile);
      const { q, r } = tile.coord;
      // Only a cell with a dry neighbour is on the shore, so the ink follows the water's real edge.
      const neighbours = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]];
      for (const [dq, dr] of neighbours) {
        if (wet.has(`${q + dq},${r + dr}`)) {
          continue;
        }
        const away = ctx.centreAt(q + dq, r + dr);
        const mx = (centre.x + away.x) / 2;
        const my = (centre.y + away.y) / 2;
        const nx = -(away.y - centre.y);
        const ny = away.x - centre.x;
        const length = Math.hypot(nx, ny) || 1;
        const reach = ctx.tileSize * 0.55;
        inkPath(
          graphics,
          [
            { x: mx - (nx / length) * reach, y: my - (ny / length) * reach },
            { x: mx + (nx / length) * reach, y: my + (ny / length) * reach },
          ],
          Math.round(mx + my * 3),
          { width: 1.05, alpha: 0.5, colour: PIGMENT.cham, wobble: 3.2, step: 12 },
        );
      }
      // Two flow lines per cell, well inside the edge, so the sheet reads as moving water.
      for (let line = 0; line < 2; line += 1) {
        const oy = centre.y + (rand() - 0.5) * ctx.tileSize * 0.7;
        const half = ctx.tileSize * (0.2 + rand() * 0.28);
        inkPath(
          graphics,
          [{ x: centre.x - half, y: oy }, { x: centre.x + half, y: oy }],
          Math.round(centre.x + oy + line),
          { width: 0.65, alpha: 0.3, colour: PIGMENT.cham, wobble: 1.6, step: 9 },
        );
      }
    }
  }

  /**
   * Soft radial tone per cell, so neighbours overlap into one continuous field of colour.
   * A hex-shaped fill here is exactly how the grid leaks back into the picture.
   */
  private paintGround(graphics: Phaser.GameObjects.Graphics, tiles: LandscapeContext['tiles'], ctx: LandscapeContext): void {
    for (const tile of tiles) {
      const tone = GROUND[tile.terrain];
      if (!tone) {
        continue;
      }
      const centre = ctx.centreOf(tile);
      const variance = ((tile.coord.q * 7 + tile.coord.r * 13) % 5) * 0.022;
      groundTone(graphics, centre.x, centre.y, ctx.tileSize * 1.05, tone, 0.12 + variance);
    }
  }

  /**
   * A run of mountain or hill cells becomes ONE range spanning the whole run, bleeding past its
   * cells. Never a peak per tile — that is what produced a picket fence of identical summits.
   */
  private paintRanges(graphics: Phaser.GameObjects.Graphics, tiles: LandscapeContext['tiles'], ctx: LandscapeContext): void {
    const relief = new Map<string, HexTerrainType>();
    for (const tile of tiles) {
      if (tile.terrain === 'mountains' || tile.terrain === 'hills') {
        relief.set(`${tile.coord.q},${tile.coord.r}`, tile.terrain);
      }
    }
    // A hex row below this one, in the pointy-top axial layout used by the map.
    const below = (q: number, r: number): HexTerrainType | undefined => relief.get(`${q},${r + 1}`) ?? relief.get(`${q - 1},${r + 1}`);
    /** How many rows of the same relief stand behind this one — the massif's depth. */
    const depthBehind = (q: number, r: number): number => {
      let depth = 0;
      let cursor = { q, r };
      while (depth < 4) {
        const back = relief.get(`${cursor.q},${cursor.r - 1}`) ? { q: cursor.q, r: cursor.r - 1 }
          : relief.get(`${cursor.q + 1},${cursor.r - 1}`) ? { q: cursor.q + 1, r: cursor.r - 1 }
            : undefined;
        if (!back) break;
        cursor = back;
        depth += 1;
      }
      return depth;
    };

    const byRow = new Map<number, Array<{ q: number; terrain: HexTerrainType }>>();
    for (const tile of tiles) {
      if (tile.terrain !== 'mountains' && tile.terrain !== 'hills') {
        continue;
      }
      // Only the FRONT face of a massif is drawn. Painting every row produces stacked bands of
      // identical peaks — the banding that made the first pass read as a picket fence.
      if (below(tile.coord.q, tile.coord.r) === tile.terrain) {
        continue;
      }
      const row = byRow.get(tile.coord.r) ?? [];
      row.push({ q: tile.coord.q, terrain: tile.terrain });
      byRow.set(tile.coord.r, row);
    }

    for (const [r, row] of byRow) {
      row.sort((a, b) => a.q - b.q);
      let index = 0;
      while (index < row.length) {
        const terrain = row[index].terrain;
        let end = index;
        while (end + 1 < row.length && row[end + 1].q === row[end].q + 1 && row[end + 1].terrain === terrain) {
          end += 1;
        }
        const from = ctx.centreAt(row[index].q, r);
        const to = ctx.centreAt(row[end].q, r);
        const seed = Math.round(from.x * 3 + from.y);
        // A deeper massif stands taller, so a range reads as a body of rock rather than a wall.
        const depth = depthBehind(row[index].q, r);
        if (terrain === 'mountains') {
          karstRange(
            graphics, from.x - ctx.tileSize * 1.1, to.x + ctx.tileSize * 1.1,
            from.y + ctx.tileSize * 0.8, ctx.tileSize * (0.8 + depth * 0.34), seed,
          );
        } else {
          softRidge(
            graphics, from.x - ctx.tileSize * 1.1, to.x + ctx.tileSize * 1.1,
            from.y + ctx.tileSize * 0.7, ctx.tileSize * (0.26 + depth * 0.1), seed,
          );
        }
        index = end + 1;
      }
    }
  }

  /**
   * One wandering lattice across the whole map; a plot is kept only where the land beneath it is
   * paddy. Neighbouring cells therefore share their bunds and the field system ends raggedly —
   * which is what a delta looks like from above, and the opposite of a field per tile.
   */
  private paintFields(graphics: Phaser.GameObjects.Graphics, tiles: LandscapeContext['tiles'], ctx: LandscapeContext): void {
    const paddy = tiles.filter((tile) => tile.terrain === 'riceFields' || tile.terrain === 'fields');
    if (paddy.length === 0) {
      return;
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const centres: Array<{ x: number; y: number }> = [];
    for (const tile of paddy) {
      const centre = ctx.centreOf(tile);
      centres.push(centre);
      minX = Math.min(minX, centre.x);
      minY = Math.min(minY, centre.y);
      maxX = Math.max(maxX, centre.x);
      maxY = Math.max(maxY, centre.y);
    }
    const reach = ctx.tileSize * 0.94;
    minX -= reach; minY -= reach; maxX += reach; maxY += reach;

    const rand = mulberry32(7777);
    const cell = ctx.tileSize * 0.5;
    const rowCount = Math.min(400, Math.ceil((maxY - minY) / cell) + 1);
    const lines: Pt[][] = [];
    for (let index = 0; index <= rowCount; index += 1) {
      const yy = minY + index * cell;
      const line: Pt[] = [];
      for (let node = 0; node <= 26; node += 1) {
        line.push({
          x: minX + ((maxX - minX) * node) / 26,
          y: yy + Math.sin(node * 0.62 + index * 1.21) * cell * 0.2 + (rand() - 0.5) * cell * 0.12,
        });
      }
      lines.push(line);
    }
    const heightAt = (line: Pt[], x: number): number => {
      const t = Math.max(0, Math.min(1, (x - line[0].x) / (line[26].x - line[0].x || 1)));
      const index = Math.min(25, Math.floor(t * 26));
      const fraction = t * 26 - index;
      return line[index].y + (line[index + 1].y - line[index].y) * fraction;
    };
    const nearPaddy = (x: number, y: number): boolean => {
      for (const centre of centres) {
        if ((centre.x - x) ** 2 + (centre.y - y) ** 2 < reach * reach) {
          return true;
        }
      }
      return false;
    };

    const plots: FieldPlot[] = [];
    for (let row = 0; row < rowCount; row += 1) {
      let x = minX + (rand() - 0.5) * cell;
      while (x < maxX) {
        const width = cell * (0.8 + rand() * 1.0);
        const mx = x + width / 2;
        const my = (heightAt(lines[row], mx) + heightAt(lines[row + 1], mx)) / 2;
        if (nearPaddy(mx, my)) {
          plots.push({
            points: [
              { x: x + 1, y: heightAt(lines[row], x) + 1 },
              { x: x + width - 1, y: heightAt(lines[row], x + width) + 1 },
              { x: x + width - 1, y: heightAt(lines[row + 1], x + width) - 1 },
              { x: x + 1, y: heightAt(lines[row + 1], x) - 1 },
            ],
            stage: rand(),
            seed: Math.round(mx * 7 + my * 13),
          });
        }
        x += width;
      }
    }
    for (const plot of plots) {
      drawFieldPlot(graphics, plot);
    }
  }

  /**
   * One scatter over the whole map. Points drift past their own cell on purpose, and the lot is
   * sorted back-to-front so overlap reads as depth rather than as z-fighting.
   */
  private paintScatter(
    graphics: Phaser.GameObjects.Graphics,
    tiles: LandscapeContext['tiles'],
    ctx: LandscapeContext,
    tileSize: number,
  ): void {
    const rand = mulberry32(2024);
    const items: ScatterItem[] = [];
    for (const tile of tiles) {
      const spec = SCATTER[tile.terrain];
      if (!spec) {
        continue;
      }
      const centre = ctx.centreOf(tile);
      const count = spec.count[0] + Math.floor(rand() * (spec.count[1] - spec.count[0] + 1));
      for (let index = 0; index < count; index += 1) {
        const angle = rand() * Math.PI * 2;
        const distance = Math.sqrt(rand()) * tileSize * 1.12;
        items.push({
          x: centre.x + Math.cos(angle) * distance,
          y: centre.y + Math.sin(angle) * distance * 0.92,
          kind: spec.kinds[Math.floor(rand() * spec.kinds.length)],
          scale: spec.scale[0] + rand() * (spec.scale[1] - spec.scale[0]),
          seed: (tile.coord.q * 7919 + tile.coord.r * 104729 + index * 3167) % 100000,
        });
      }
    }
    items.sort((a, b) => a.y - b.y);

    const unit = tileSize / 24;
    for (const item of items) {
      const s = item.scale * unit;
      switch (item.kind) {
        case 'tree':
          graphics.fillStyle(PIGMENT.muc, 0.07);
          graphics.fillEllipse(item.x, item.y, 14 * s, 4.2 * s);
          tree(graphics, item.x, item.y, s, item.seed);
          break;
        case 'tuft': grassTuft(graphics, item.x, item.y, s, item.seed); break;
        case 'bamboo': bamboo(graphics, item.x, item.y, s * 0.5, item.seed); break;
        case 'banana': banana(graphics, item.x, item.y, s * 0.75, item.seed); break;
        case 'areca': areca(graphics, item.x, item.y, s * 0.6, item.seed); break;
        case 'banyan': banyan(graphics, item.x, item.y, s * 0.6, item.seed); break;
        case 'farmer': farmer(graphics, item.x, item.y, s * 0.8, item.seed); break;
        default: break;
      }
    }
  }

  // ── the narrow per-hex API, kept so the interface stays satisfied ───────────

  drawBackground(worldWidth: number, worldHeight: number): Phaser.GameObjects.Graphics {
    const graphics = this.scene.add.graphics();
    graphics.fillStyle(PIGMENT.diep, 1);
    graphics.fillRect(0, 0, worldWidth, worldHeight);
    // Broad tea-staining so the sheet is never one flat tone. The fine fibre and shell grit come
    // from the tiled paper texture composited over this by the scene.
    const rand = mulberry32(31);
    for (let index = 0; index < 22; index += 1) {
      graphics.fillStyle(rand() > 0.45 ? PIGMENT.diepLo : PIGMENT.diepHi, 0.05 + rand() * 0.05);
      graphics.fillEllipse(
        rand() * worldWidth,
        rand() * worldHeight,
        220 + rand() * 520,
        180 + rand() * 420,
      );
    }
    return graphics;
  }

  /**
   * Off-map padding is bare paper under this theme.
   *
   * Deliberately a no-op: even a 16%-alpha hex fill out here draws a visible staircase of hexagons
   * along the world's edge, which is the one thing this whole renderer exists to avoid.
   */
  drawHexFill(_graphics: Phaser.GameObjects.Graphics, _corners: PixelPoint[], _color: number): void {
    void _graphics; void _corners; void _color;
  }

  /** Unused under this theme — `drawLandscape` owns decoration. Kept for interface compatibility. */
  decorateTerrain(): void {
    /* intentionally empty */
  }

  drawCloud(graphics: Phaser.GameObjects.Graphics, x: number, y: number, baseRadius: number, seed: number, alpha = 0.9): void {
    const rand = mulberry32(seed);
    for (let puff = 0; puff < 6; puff += 1) {
      const angle = rand() * Math.PI * 2;
      const distance = baseRadius * (0.2 + rand() * 0.5);
      graphics.fillStyle(PIGMENT.diepHi, alpha * 0.9);
      graphics.fillCircle(x + Math.cos(angle) * distance, y + Math.sin(angle) * distance * 0.7, baseRadius * (0.5 + rand() * 0.4));
    }
  }

  /**
   * A border, not a chain of hexagons. Enough wobble that the six-sided origin of each edge stops
   * being legible, which is the difference between a frontier and a honeycomb.
   */
  drawZoneBorder(
    graphics: Phaser.GameObjects.Graphics,
    edges: Array<[number, number, number, number]>,
    _color: number,
    alpha = 0.95,
  ): void {
    // The passed colour is the kingdom's hue, and this theme deliberately refuses it: a frontier is
    // drawn in ink like everything else, and WHOSE it is comes from the hatch angle and the seal.
    void _color;
    for (const [x1, y1, x2, y2] of edges) {
      inkPath(graphics, [{ x: x1, y: y1 }, { x: x2, y: y2 }], Math.round(x1 + y1 * 3 + x2 * 7), {
        width: 1.0, alpha: Math.min(0.34, alpha * 0.38), colour: PIGMENT.mucSoft, wobble: 5.5, step: 30,
      });
    }
  }

  /**
   * Territory, hatched rather than filled. The ANGLE carries the faction — a second channel, so
   * ownership survives greyscale and colour blindness — and the player's rules are the one place
   * on the map besides their banner and seal where sỏi son is spent.
   */
  drawZoneFill(
    graphics: Phaser.GameObjects.Graphics,
    loops: Array<Array<{ x: number; y: number }>>,
    isPlayer: boolean,
    isNeutral: boolean,
  ): void {
    if (isNeutral) {
      return;
    }
    for (const loop of loops) {
      if (loop.length < 3) {
        continue;
      }
      hatchPoly(graphics, loop, isPlayer ? -0.65 : 0.75, 10, isPlayer ? PIGMENT.son : PIGMENT.mucSoft, isPlayer ? 0.15 : 0.11, 0.9);
    }
  }

  /**
   * The shore, as a soft band of sand rather than a ruled edge.
   *
   * The default draws an eighteen-pixel stroke straight along each hex edge, which outlines every
   * island in a perfect staircase of hexagons. Heavy wobble and a low alpha turn the same edges
   * into a beach.
   */
  /**
   * Unexplored ground is paper the chronicle has not reached yet — which is exactly right for this
   * treatment, and would be perfect if the boundary were not a staircase of hexagons.
   *
   * Two passes fix that without a mask: a wobbled polygon so no two cells share a straight cut, and
   * a soft radial halo that spills past the cell and blurs the frontier into the drawn land.
   */
  drawFogCell(
    graphics: Phaser.GameObjects.Graphics,
    centre: { x: number; y: number },
    corners: PixelPoint[],
    radius: number,
    explored: boolean,
  ): void {
    const alpha = explored ? 0.8 : 0.9;
    const rand = mulberry32(Math.round(centre.x * 3 + centre.y * 7));
    const torn: Pt[] = [];
    for (let index = 0; index < corners.length; index += 1) {
      const a = corners[index];
      const b = corners[(index + 1) % corners.length];
      for (let step = 0; step < 3; step += 1) {
        const t = step / 3;
        const nx = -(b.y - a.y);
        const ny = b.x - a.x;
        const length = Math.hypot(nx, ny) || 1;
        const push = (rand() - 0.35) * radius * 0.2;
        torn.push({ x: a.x + (b.x - a.x) * t + (nx / length) * push, y: a.y + (b.y - a.y) * t + (ny / length) * push });
      }
    }
    graphics.fillStyle(PIGMENT.diepHi, alpha);
    graphics.fillPoints(torn, true);
    // The halo is what actually kills the staircase: it reaches into the neighbours.
    groundTone(graphics, centre.x, centre.y, radius * 1.5, PIGMENT.diepHi, alpha * 0.55);
  }

  /** The undrawn part of the chronicle, with a torn edge rather than a stepped one. */
  drawFogRegion(
    graphics: Phaser.GameObjects.Graphics,
    loops: Array<Array<{ x: number; y: number }>>,
    explored: boolean,
  ): void {
    const alpha = explored ? 0.86 : 0.95;
    for (const loop of loops) {
      if (loop.length < 3) {
        continue;
      }
      const rand = mulberry32(Math.round(loop[0].x * 7 + loop[0].y * 3));
      // Push each existing vertex a little along its own normal. Subdividing first, or pushing
      // harder, makes the polygon self-intersect and the fill sprouts ribbons across the paper.
      const torn: Pt[] = loop.map((point, index) => {
        const next = loop[(index + 1) % loop.length];
        const nx = -(next.y - point.y);
        const ny = next.x - point.x;
        const length = Math.hypot(nx, ny) || 1;
        const push = (rand() - 0.4) * 3.5;
        return { x: point.x + (nx / length) * push, y: point.y + (ny / length) * push };
      });
      graphics.fillStyle(PIGMENT.diepHi, alpha);
      graphics.fillPoints(torn, true);
    }
  }

  drawShoreEdge(graphics: Phaser.GameObjects.Graphics, x1: number, y1: number, x2: number, y2: number): void {
    const seed = Math.round(x1 + y1 * 3 + x2 * 7);
    inkPath(graphics, [{ x: x1, y: y1 }, { x: x2, y: y2 }], seed, {
      width: 11, alpha: 0.2, colour: PIGMENT.diepDeep, wobble: 5.5, step: 22,
    });
    inkPath(graphics, [{ x: x1, y: y1 }, { x: x2, y: y2 }], seed + 5, {
      width: 1.1, alpha: 0.22, colour: PIGMENT.mucFaint, wobble: 4.5, step: 20,
    });
  }

  drawRoad(graphics: Phaser.GameObjects.Graphics, points: PixelPoint[], widthFrom: number, _widthTo: number): void {
    void _widthTo;
    if (points.length < 2) {
      return;
    }
    inkPath(graphics, points as Pt[], Math.round(points[0].x + points[0].y), {
      width: Math.max(1, widthFrom * 0.5), alpha: 0.24, colour: PIGMENT.nau, wobble: 1.4, step: 14,
    });
  }
}

/** Exported for the item renderer, which paints the same wash under settlements. */
export function paperWash(graphics: Phaser.GameObjects.Graphics, points: Pt[], seed: number): void {
  washFill(graphics, points, PIGMENT.diepLo, seed, 0.4);
}

export { printedShape };
