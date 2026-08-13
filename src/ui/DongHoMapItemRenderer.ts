import Phaser from 'phaser';
import { InkMapItemRenderer } from './InkMapItemRenderer';
import type { ProgressBadgeVariant } from './MapItemRenderer';
import type { LandBuildingType } from '../state/types';
import { UI_FONT } from './fonts';
import { PIGMENT } from './ink/palette';
import { drawHost, figure, hostShape, seal } from './ink/devices';
import { drawFieldPlot } from './ink/settlements';
import { citadel, hamlet, village } from './ink/settlements';
import { hatchPoly, inkPath, mulberry32, printedShape, thickPath, washFill, type Pt } from './ink/stroke';
import { areca, bamboo, banyan, buffalo, farmer, groundShadow, hayStack, house, thap, tree } from './ink/props';
import { createPlayerLandFlag } from './playerFlag';

/**
 * Chains loose segments back into the loops they were cut from.
 *
 * Hex boundary edges arrive unordered; drawn as they come they are only ever a pile of sticks. A
 * loop can be walked, rounded and given a fill, which is what turns a set of cell borders into a
 * wall somebody built.
 */
function chainEdges(edges: Array<[number, number, number, number]>): Pt[][] {
  const key = (x: number, y: number): string => `${Math.round(x * 2)}:${Math.round(y * 2)}`;
  const open = edges.map(([x1, y1, x2, y2]) => [{ x: x1, y: y1 }, { x: x2, y: y2 }] as [Pt, Pt]);
  const used = new Array<boolean>(open.length).fill(false);
  const byPoint = new Map<string, number[]>();
  open.forEach(([a, b], index) => {
    for (const point of [a, b]) {
      const bucket = byPoint.get(key(point.x, point.y));
      if (bucket) {
        bucket.push(index);
      } else {
        byPoint.set(key(point.x, point.y), [index]);
      }
    }
  });

  const loops: Pt[][] = [];
  for (let start = 0; start < open.length; start += 1) {
    if (used[start]) {
      continue;
    }
    used[start] = true;
    const chain: Pt[] = [open[start][0], open[start][1]];
    let grew = true;
    while (grew) {
      grew = false;
      const tail = chain[chain.length - 1];
      for (const index of byPoint.get(key(tail.x, tail.y)) ?? []) {
        if (used[index]) {
          continue;
        }
        const [a, b] = open[index];
        const next = key(a.x, a.y) === key(tail.x, tail.y) ? b : a;
        if (key(next.x, next.y) === key(chain[0].x, chain[0].y)) {
          used[index] = true;
          grew = false;
          break;
        }
        used[index] = true;
        chain.push(next);
        grew = true;
        break;
      }
    }
    if (chain.length >= 3) {
      loops.push(chain);
    }
  }
  return loops;
}

/** One Chaikin pass: cuts every corner, so a hexagon relaxes toward the bank of earth it stands for. */
function smoothLoop(loop: Pt[]): Pt[] {
  if (loop.length < 3) {
    return loop;
  }
  const out: Pt[] = [];
  for (let index = 0; index < loop.length; index += 1) {
    const a = loop[index];
    const b = loop[(index + 1) % loop.length];
    out.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 });
    out.push({ x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
  }
  return out;
}

/**
 * Đông Hồ rendering for everything drawn *on* the map: settlements, hosts, seals.
 *
 * Extends the ink renderer rather than reimplementing it, so the parts this art direction has
 * nothing new to say about — carts, travellers, progress badges, building glyphs — keep working
 * unchanged. What is overridden is the handful of things the document argues about:
 *
 *  · **hosts are sized by the number of men in them.** A nine-thousand-man army is visibly a
 *    different object from a two-thousand-man one, with no label to read. This is the single
 *    highest-value change in the whole art direction.
 *  · **settlements are drawn in oblique**, two faces visible, so a roof sits on the land rather
 *    than floating over it.
 *  · **ownership is a stamped seal**, in the only saturated red on the map.
 */
export class DongHoMapItemRenderer extends InkMapItemRenderer {
  /**
   * A host, drawn as the number of men it contains.
   *
   * One mark stands for about fifty-five soldiers and the block is wider than deep, the way a host
   * on the march is. Nobody counts the figures; the eye compares two blocks and gets the ratio
   * right, which is the whole point.
   */
  override createArmyMarker(total: number, isPlayer: boolean, _kingdomColor?: number): Phaser.GameObjects.Container {
    const scene = this.scene as Phaser.Scene;
    const container = scene.add.container(0, 0);
    const graphics = scene.add.graphics();
    // The kingdom colour is deliberately ignored. Painting a rival's host in its saturated banner
    // hue made every enemy garrison the loudest thing on the map — a scarlet swarm beside a seat
    // drawn in ink. Ownership is carried by the standard riding with the host and by the hatch on
    // the ground under it, never by the men. The player's own host takes the fuller black.
    const colour = isPlayer ? PIGMENT.muc : PIGMENT.mucSoft;
    const scale = 0.82;
    const shape = hostShape(Math.max(1, total), 4.6 * scale, 4 * scale);

    groundShadow(graphics, 0, 4, shape.width * 0.5, 0.08);
    drawHost(graphics, -shape.width / 2, -shape.height, Math.max(1, total), Math.round(total) + 17, colour, scale, true);
    container.add(graphics);

    // The standard rides with the host and multiplies with it, so size reads twice over.
    const standards = Math.max(1, Math.min(3, Math.round(total / 4000)));
    for (let index = 0; index < standards; index += 1) {
      const flag = isPlayer
        ? createPlayerLandFlag(scene, false, Math.round(total) + index * 7)
        : createPlayerLandFlag(scene, false, index * 13, true);
      flag.setPosition(-shape.width / 2 - 6 + index * 9, 2);
      flag.setScale(0.72);
      container.add(flag);
    }
    return container;
  }

  /** Ownership, stamped. The only saturated red on the map is the player's own. */
  override createSelectionFlag(): Phaser.GameObjects.Container {
    const scene = this.scene as Phaser.Scene;
    const container = scene.add.container(0, 0);
    const graphics = scene.add.graphics();
    seal(graphics, 0, -20, 18, 'star');
    container.add(graphics);
    return container;
  }

  /**
   * A settlement in oblique, its form decided by what the land IS rather than by how many hexes it
   * happens to own. A castle is a walled seat at one hex or at nine; sizing that off the cluster
   * count is what made the player's own capital read thinner than a rival's.
   */
  override addCityCluster(
    cluster: Phaser.GameObjects.Container,
    centers: ReadonlyArray<{ x: number; y: number }>,
    isShrine: boolean,
    kind?: 'city' | 'market' | 'shrine',
  ): void {
    if (centers.length === 0) {
      return;
    }
    const scene = this.scene as Phaser.Scene;
    const graphics = scene.add.graphics();
    const seed = Math.round(centers[0].x * 13 + centers[0].y * 7);
    const rand = mulberry32(seed);

    const sorted = [...centers].sort((a, b) => a.y - b.y);
    const anchor = sorted[Math.floor(sorted.length / 2)];
    // A bigger holding gets a bigger seat, but never below the size at which a wall reads.
    const spread = Math.min(1.35, 0.8 + sorted.length * 0.06);

    if (isShrine || kind === 'shrine') {
      banyan(graphics, anchor.x - 22, anchor.y + 2, 0.85 * spread, seed + 40);
      village(graphics, anchor.x, anchor.y + 6, 0.8 * spread, seed);
    } else if (kind === 'market') {
      village(graphics, anchor.x, anchor.y + 4, 0.9 * spread, seed);
      for (const centre of sorted.slice(0, 2)) {
        hamlet(graphics, centre.x + (rand() - 0.5) * 26, centre.y + 20, 0.5 * spread, seed + 100 + centre.x, 3);
      }
    } else {
      // Outlying hamlets first, so the seat stands in front of what it protects.
      for (const centre of sorted.slice(0, Math.min(3, sorted.length - 1))) {
        hamlet(graphics, centre.x + (rand() - 0.5) * 30, centre.y + 22, 0.46 * spread, seed + 100 + centre.x, 3);
      }
      const s = 0.78 * spread;
      citadel(graphics, anchor.x - 38 * s, anchor.y + 12, s, 'le', seed);
    }

    // The herd grazes at the edge of the settlement, where it actually lives — not scattered
    // through the paddy, and never far from the roofs.
    buffalo(graphics, anchor.x - 34, anchor.y + 34, 0.42 * spread, seed + 700, rand() > 0.55);
    if (sorted.length > 3) {
      buffalo(graphics, anchor.x + 30, anchor.y + 40, 0.36 * spread, seed + 720, false);
    }

    for (const centre of sorted) {
      if (centre === anchor || rand() > 0.45) {
        continue;
      }
      tree(graphics, centre.x + (rand() - 0.5) * 34, centre.y + 16, 0.95, seed + 200 + centre.x);
    }
    cluster.add(graphics);
  }

  /** A small holding: two or three roofs and a tree, at the same line weight as everything else. */
  override addBuildingGroup(
    cluster: Phaser.GameObjects.Container,
    x: number,
    y: number,
    isShrine: boolean,
    houseCount: number,
  ): void {
    const scene = this.scene as Phaser.Scene;
    const graphics = scene.add.graphics();
    const seed = Math.round(x * 11 + y * 5);
    if (isShrine) {
      banyan(graphics, x - 10, y + 2, 0.55, seed);
    }
    hamlet(graphics, x, y, 0.62, seed, Math.max(2, Math.min(6, houseCount)));
    cluster.add(graphics);
  }

  /**
   * The capital's ring, in ink rather than in gold. A stamped seal says whose it is; the ring only
   * has to say "this one", so it is the quietest mark on the map that still reads.
   */
  override createCapitalHighlight(): Phaser.GameObjects.Graphics {
    const graphics = (this.scene as Phaser.Scene).add.graphics();
    graphics.fillStyle(PIGMENT.hoePale, 0.1);
    graphics.fillEllipse(0, 4, 88, 44);
    graphics.lineStyle(1.2, PIGMENT.mucSoft, 0.32);
    graphics.strokeEllipse(0, 4, 92, 48);
    seal(graphics, 40, -12, 15, 'star');
    return graphics;
  }

  /**
   * A worked corner beside a settlement — hands, not more bunds. The landscape lattice already
   * owns the fields here; see `createFarmCluster`.
   */
  override addCropPatch(cluster: Phaser.GameObjects.Container, x: number, y: number, scale: number): void {
    const g = (this.scene as Phaser.Scene).add.graphics();
    const seed = Math.round(x * 3 + y * 11);
    const rand = mulberry32(seed);
    farmer(g, x - 6 * scale, y, 0.85 * scale, seed);
    if (rand() > 0.45) {
      farmer(g, x + 8 * scale, y + 5 * scale, 0.7 * scale, seed + 7);
    } else {
      hayStack(g, x + 10 * scale, y + 4 * scale, 0.38 * scale, seed + 9);
    }
    cluster.add(g);
  }

  /**
   * A city's rampart, as a bank of rammed earth rather than a tracing of the grid.
   *
   * The segments arrive as raw hex edges. Drawn one at a time — however thin, however wobbled —
   * they keep every 120° corner, and a walled town reads as a pale honeycomb laid over the map:
   * the grid deciding shape, which is the one thing it may never do. So the edges are chained back
   * into their loops and rounded off first, and the result is drawn as a thing built out of earth:
   * a band with a fill, a shadowed inner face, a contour, and battlement ticks along the crest.
   */
  override drawCityWall(graphics: Phaser.GameObjects.Graphics, edges: Array<[number, number, number, number]>): void {
    for (const loop of chainEdges(edges)) {
      const wall = smoothLoop(smoothLoop(loop));
      if (wall.length < 3) {
        continue;
      }
      const seed = Math.round(wall[0].x * 13 + wall[0].y * 7);
      const band = thickPath([...wall, wall[0]], wall.map(() => 5.4));
      washFill(graphics, band, PIGMENT.diepLo, seed, 0.92);
      hatchPoly(graphics, band, 0.7, 3.6, PIGMENT.nau, 0.16);
      inkPath(graphics, [...wall, wall[0]], seed + 1, {
        width: 1.15, alpha: 0.72, colour: PIGMENT.muc, wobble: 0.9, step: 12,
      });
      // Battlements: short ticks standing off the crest, spaced along the loop by arc length so
      // they stay even however the smoothing has stretched each span.
      let carried = 0;
      for (let i = 0; i < wall.length; i += 1) {
        const a = wall[i];
        const b = wall[(i + 1) % wall.length];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const span = Math.hypot(dx, dy) || 1;
        for (let along = 7 - carried; along < span; along += 14) {
          const t = along / span;
          const nx = -dy / span;
          const ny = dx / span;
          inkPath(graphics, [
            { x: a.x + dx * t + nx * 2.4, y: a.y + dy * t + ny * 2.4 },
            { x: a.x + dx * t + nx * 5.4, y: a.y + dy * t + ny * 5.4 },
          ], seed + i * 7 + along, { width: 0.9, alpha: 0.5, colour: PIGMENT.muc, wobble: 0.3, step: 4 });
        }
        carried = (carried + span) % 14;
      }
    }
  }

  /**
   * The lanes inside a town, as lanes — not as a drawing of which hexes are adjacent.
   *
   * The segments offered are every adjacent pair of seat hexes, so a four-hex seat arrives as a
   * complete graph and the default draws all of it: a broad translucent triangle mesh with the
   * hex spacing legible in it, laid straight over the roofs. A town has lanes that reach every
   * quarter, not a road between every pair of them, so this keeps a minimum spanning tree of the
   * segments — the shortest set that still connects the whole seat — and draws each as a rutted
   * track that bends on its way.
   */
  drawCityRoad(graphics: Phaser.GameObjects.Graphics, segments: Array<[number, number, number, number]>): void {
    const parent = new Map<string, string>();
    const find = (node: string): string => {
      let root = node;
      while ((parent.get(root) ?? root) !== root) {
        root = parent.get(root) ?? root;
      }
      parent.set(node, root);
      return root;
    };
    const at = (x: number, y: number): string => `${Math.round(x)}:${Math.round(y)}`;

    const ordered = [...segments].sort(
      (a, b) => Math.hypot(a[0] - a[2], a[1] - a[3]) - Math.hypot(b[0] - b[2], b[1] - b[3]),
    );
    for (const [ax, ay, bx, by] of ordered) {
      const rootA = find(at(ax, ay));
      const rootB = find(at(bx, by));
      if (rootA === rootB) {
        continue;
      }
      parent.set(rootA, rootB);

      const seed = Math.round(ax + ay * 3 + bx * 7 + by * 11);
      const mx = (ax + bx) / 2;
      const my = (ay + by) / 2;
      const nx = -(by - ay);
      const ny = bx - ax;
      const length = Math.hypot(nx, ny) || 1;
      const bow = ((seed % 7) - 3) * 0.9;
      const lane = [
        { x: ax, y: ay },
        { x: mx + (nx / length) * bow, y: my + (ny / length) * bow },
        { x: bx, y: by },
      ];
      inkPath(graphics, lane, seed, { width: 2.6, alpha: 0.2, colour: PIGMENT.nauDark, wobble: 0.8, step: 12 });
      inkPath(graphics, lane, seed + 53, { width: 0.85, alpha: 0.34, colour: PIGMENT.nauDark, wobble: 1.4, step: 10 });
    }
  }

  /**
   * A farm is the farmSTEAD. The fields are already there.
   *
   * `drawLandscape` lays one paddy lattice across the whole delta, so a farm that draws its own
   * plots on top puts a second, differently-angled set of bunds over the first and the ground
   * turns to mud. What is missing at this scale is the people: the houses, the straw stack after
   * harvest, the buffalo, someone bent in the water.
   */
  override createFarmCluster(scale: number, upgradeLevel: number): Phaser.GameObjects.Container {
    const scene = this.scene as Phaser.Scene;
    const container = scene.add.container(0, 0);
    const g = scene.add.graphics();
    const seed = Math.round(scale * 977 + upgradeLevel * 31);
    const rand = mulberry32(seed);

    hamlet(g, 4 * scale, -2 * scale, 0.6 * scale, seed, 3 + Math.min(3, upgradeLevel));
    hayStack(g, -26 * scale, 6 * scale, 0.5 * scale, seed + 200);
    buffalo(g, -30 * scale, 20 * scale, 0.4 * scale, seed + 300, rand() > 0.5);
    farmer(g, 26 * scale, 16 * scale, 0.9 * scale, seed + 400);
    if (upgradeLevel > 0) {
      areca(g, 34 * scale, 6 * scale, 0.4 * scale, seed + 500);
    }
    if (upgradeLevel > 1) {
      bamboo(g, -34 * scale, -8 * scale, 0.45 * scale, seed + 600);
    }
    container.add(g);
    return container;
  }

  /**
   * Mỏ — a hillside cut, not a cottage.
   *
   * This was the last thing on the map still coming out of the isometric renderer: a flat
   * grey-blue hut with no contour, twice the size of everything near it. What an iron working
   * actually looks like from above is a bite taken out of a slope, spoil tipped below it, timber
   * props at the mouth, and the hands that work it living beside it.
   */
  /**
   * A mine is a small dark mouth at the foot of a bank, not a shed on a rock.
   *
   * The first pass drew the cut as a closed contour — so it read as a boulder set down on the
   * hillside rather than earth cut back into it — and made the adit a quarter of the face wide,
   * which at map scale is a barn door. The bank is now open along its base so it merges into the
   * ground, and the mouth is a low arch you have to stoop through, with the work around it doing
   * the explaining: spoil tipped downhill, baskets, and someone carrying.
   */
  override createMineCluster(scale: number, upgradeLevel: number): Phaser.GameObjects.Container {
    const scene = this.scene as Phaser.Scene;
    const container = scene.add.container(0, 0);
    const g = scene.add.graphics();
    const seed = Math.round(scale * 613 + upgradeLevel * 37);
    const rand = mulberry32(seed);
    const s = scale;

    // The bank of cut earth: filled and shaded, but contoured only along the crest, so the base
    // has no line to read as an edge and the ground carries straight into it.
    const crest: Pt[] = [
      { x: -26 * s, y: -3 * s }, { x: -19 * s, y: -15 * s }, { x: -6 * s, y: -20 * s },
      { x: 9 * s, y: -18 * s }, { x: 20 * s, y: -9 * s }, { x: 26 * s, y: -1 * s },
    ];
    washFill(g, [...crest, { x: 26 * s, y: 4 * s }, { x: -26 * s, y: 4 * s }], PIGMENT.diepLo, seed, 0.9);
    hatchPoly(g, [...crest, { x: 26 * s, y: 4 * s }, { x: -26 * s, y: 4 * s }], -0.9, 3.4 * s, PIGMENT.nau, 0.14);
    inkPath(g, crest, seed + 1, { width: 1.1 * s, alpha: 0.78, wobble: 0.5 * s, step: 7 });
    for (let seam = 0; seam < 4; seam += 1) {
      const sx = -15 * s + seam * 9 * s;
      inkPath(g, [{ x: sx, y: -15 * s + rand() * 4 * s }, { x: sx + (rand() - 0.5) * 3 * s, y: -3 * s }], seed + seam, {
        width: 0.55 * s, alpha: 0.26, wobble: 0.4 * s, step: 7,
      });
    }

    // The adit: a low arch at the foot of the bank, under one timber lintel.
    const mouth: Pt[] = [{ x: -4 * s, y: 1 * s }];
    for (let i = 0; i <= 8; i += 1) {
      const a = Math.PI + (i / 8) * Math.PI;
      mouth.push({ x: Math.cos(a) * 4 * s, y: -4.5 * s + Math.sin(a) * 4 * s });
    }
    mouth.push({ x: 4 * s, y: 1 * s });
    printedShape(g, mouth, PIGMENT.muc, seed + 10, { width: 0.8 * s, alpha: 0.8, wobble: 0.15 * s, step: 4, fillAlpha: 0.78 });
    inkPath(g, [{ x: -5.5 * s, y: -8 * s }, { x: 5.5 * s, y: -8.4 * s }], seed + 30, {
      width: 1.1 * s, alpha: 0.7, colour: PIGMENT.nau, wobble: 0.15 * s, step: 4,
    });
    for (const dx of [-4.6, 4.6]) {
      inkPath(g, [{ x: dx * s, y: -8 * s }, { x: dx * s, y: 1 * s }], seed + 20 + dx, {
        width: 0.8 * s, alpha: 0.6, colour: PIGMENT.nau, wobble: 0.1 * s, step: 4,
      });
    }

    // Spoil tipped down the slope, and the baskets it is carried out in.
    for (let heap = 0; heap < 2 + Math.min(2, upgradeLevel); heap += 1) {
      const hx = -17 * s + heap * 13 * s + (rand() - 0.5) * 4 * s;
      const spoil: Pt[] = [];
      for (let i = 0; i <= 10; i += 1) {
        const a = Math.PI + (i / 10) * Math.PI;
        spoil.push({ x: hx + Math.cos(a) * 6.5 * s, y: 7 * s + Math.sin(a) * 3.4 * s });
      }
      spoil.push({ x: hx + 6.5 * s, y: 8 * s }, { x: hx - 6.5 * s, y: 8 * s });
      printedShape(g, spoil, PIGMENT.diepDeep, seed + 40 + heap, { width: 0.6 * s, alpha: 0.42, wobble: 0.3 * s, step: 5, fillAlpha: 0.7 });
    }
    for (const bx of [11, 15.5]) {
      printedShape(g, [
        { x: (bx - 2.2) * s, y: 4 * s }, { x: (bx + 2.2) * s, y: 4 * s },
        { x: (bx + 1.6) * s, y: 8 * s }, { x: (bx - 1.6) * s, y: 8 * s },
      ], PIGMENT.nau, seed + 60 + bx, { width: 0.5 * s, alpha: 0.6, wobble: 0.15 * s, step: 4, fillAlpha: 0.55 });
    }
    figure(g, -21 * s, 9 * s, 1 * s, PIGMENT.muc, false);
    figure(g, 6 * s, 8 * s, 0.9 * s, PIGMENT.muc, false);
    container.add(g);
    // the hands that work it live beside it
    const homes = scene.add.graphics();
    hamlet(homes, 26 * s, 14 * s, 0.42 * s, seed + 100, 2 + Math.min(3, upgradeLevel));
    container.add(homes);
    return container;
  }

  /** A cottage is a nhà tranh, at the same line weight as every other roof on the map. */
  override addCottage(cluster: Phaser.GameObjects.Container, x: number, y: number, scale: number): void {
    const g = (this.scene as Phaser.Scene).add.graphics();
    groundShadow(g, x + 13 * scale * 0.5, y + 1, 17 * scale * 0.5, 0.08);
    house(g, x - 13 * scale * 0.5, y, scale * 0.5, Math.round(x * 7 + y * 3));
    cluster.add(g);
  }

  /**
   * The mark a constructed building leaves on the map. Drawn rather than glyphed, so a granary
   * beside a temple beside a barracks reads as three buildings and not three icons.
   */
  override createBuildingGlyph(building: LandBuildingType, x: number, y: number): Phaser.GameObjects.GameObject[] {
    const g = (this.scene as Phaser.Scene).add.graphics();
    const seed = Math.round(x * 11 + y * 5);
    switch (building) {
      case 'communalHall':
      case 'university':
        // The two that are civic rather than productive get the tiered tower.
        thap(g, x, y, 0.34, seed, 4);
        break;
      case 'market':
      case 'guild':
      case 'harbor':
        house(g, x - 8, y, 0.44, seed, true);
        hayStack(g, x + 12, y, 0.3, seed + 5);
        break;
      case 'barracks':
      case 'wall':
      case 'tower':
        house(g, x - 8, y, 0.46, seed, true);
        figure(g, x + 12, y, 1, PIGMENT.muc, true);
        break;
      case 'farm':
        hayStack(g, x, y, 0.42, seed);
        farmer(g, x + 10, y, 0.8, seed + 3);
        break;
      case 'mine':
        printedShape(
          g,
          [{ x: x - 7, y }, { x: x - 5, y: y - 9 }, { x: x + 5, y: y - 9 }, { x: x + 7, y }],
          PIGMENT.diepLo, seed, { width: 0.8, alpha: 0.7, wobble: 0.3, step: 5, fillAlpha: 0.9 },
        );
        printedShape(
          g,
          [{ x: x - 3, y }, { x: x - 3, y: y - 6 }, { x: x + 3, y: y - 6 }, { x: x + 3, y }],
          PIGMENT.muc, seed + 1, { width: 0.7, alpha: 0.7, wobble: 0.2, step: 4, fillAlpha: 0.7 },
        );
        break;
      default:
        house(g, x - 8, y, 0.44, seed);
        break;
    }
    return [g];
  }

  /** A traveller on the road: a figure under a conical hat, and nothing else. */
  override createTraveler(): Phaser.GameObjects.Container {
    const scene = this.scene as Phaser.Scene;
    const container = scene.add.container(0, 0);
    const g = scene.add.graphics();
    farmer(g, -2, 4, 0.85, 4711);
    container.add(g);
    return container;
  }

  /** A cart: two wheels, a bed, and the buffalo pulling it. */
  override createCart(): Phaser.GameObjects.Container {
    const scene = this.scene as Phaser.Scene;
    const container = scene.add.container(0, 0);
    const g = scene.add.graphics();
    printedShape(g, [{ x: -1, y: -3 }, { x: 11, y: -3 }, { x: 11, y: 2 }, { x: -1, y: 2 }],
      PIGMENT.nau, 88, { width: 0.7, alpha: 0.75, wobble: 0.15, step: 4, fillAlpha: 0.9 });
    g.lineStyle(0.8, PIGMENT.muc, 0.7);
    g.strokeCircle(1.5, 3, 2.4);
    g.strokeCircle(8.5, 3, 2.4);
    inkPath(g, [{ x: -1, y: -1 }, { x: -7, y: 0 }], 89, { width: 0.7, alpha: 0.6, colour: PIGMENT.nau, wobble: 0.1 });
    buffalo(g, -16, 4, 0.28, 90, false);
    container.add(g);
    return container;
  }

  /** The march destination: a planted standard, in the only red on the map. */
  override createDestinationArrow(): Phaser.GameObjects.Container {
    const scene = this.scene as Phaser.Scene;
    const container = scene.add.container(0, 0);
    container.add(createPlayerLandFlag(scene, false, 3));
    container.setScale(0.8);
    return container;
  }

  /** Work in progress, on a scrap of paper rather than a coloured ring. */
  override createProgressBadge(
    x: number,
    y: number,
    progress: number,
    required: number,
    variant: ProgressBadgeVariant,
  ): Phaser.GameObjects.Container {
    const scene = this.scene as Phaser.Scene;
    const container = scene.add.container(x, y);
    const g = scene.add.graphics();
    const ratio = Math.max(0, Math.min(1, progress / Math.max(1, required)));
    const urgent = variant === 'acquisition' || variant === 'siege';
    const w = 30;
    const plate: Pt[] = [{ x: -w / 2, y: -9 }, { x: w / 2, y: -9 }, { x: w / 2, y: 5 }, { x: -w / 2, y: 5 }];
    washFill(g, plate, PIGMENT.diepHi, 501, 0.92, 1);
    inkPath(g, plate, 502, { width: 0.9, alpha: 0.55, wobble: 0.4, step: 8, closed: true });
    inkPath(g, [{ x: -w / 2 + 3, y: 2 }, { x: w / 2 - 3, y: 2 }], 503, { width: 2, alpha: 0.18, wobble: 0.2, step: 8 });
    if (ratio > 0) {
      inkPath(g, [{ x: -w / 2 + 3, y: 2 }, { x: -w / 2 + 3 + (w - 6) * ratio, y: 2 }], 504, {
        width: 2, alpha: 0.85, colour: urgent ? PIGMENT.son : PIGMENT.giDong, wobble: 0.3, step: 7,
      });
    }
    container.add(g);
    container.add(scene.add.text(0, -8, `${progress}/${required}`, {
      color: '#2a2118', fontFamily: UI_FONT, fontSize: '9px', fontStyle: '700',
    }).setOrigin(0.5, 0));
    return container;
  }
}
