import Phaser from 'phaser';
import { InkMapItemRenderer } from './InkMapItemRenderer';
import { PIGMENT } from './ink/palette';
import { drawHost, hostShape, seal } from './ink/devices';
import { drawFieldPlot } from './ink/settlements';
import { citadel, hamlet, village } from './ink/settlements';
import { inkPath, mulberry32 } from './ink/stroke';
import { banyan, buffalo, groundShadow, tree } from './ink/props';
import { createPlayerLandFlag } from './playerFlag';

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
  override createArmyMarker(total: number, isPlayer: boolean, kingdomColor?: number): Phaser.GameObjects.Container {
    const scene = this.scene as Phaser.Scene;
    const container = scene.add.container(0, 0);
    const graphics = scene.add.graphics();
    const colour = isPlayer ? PIGMENT.muc : (kingdomColor ?? PIGMENT.mucSoft);
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

  /** A worked field is paddy: irregular plots at different stages, divided by earth bunds. */
  override addCropPatch(cluster: Phaser.GameObjects.Container, x: number, y: number, scale: number): void {
    const graphics = (this.scene as Phaser.Scene).add.graphics();
    const seed = Math.round(x * 3 + y * 11);
    const rand = mulberry32(seed);
    const w = 26 * scale;
    const h = 16 * scale;
    for (let index = 0; index < 4; index += 1) {
      const px = x - w / 2 + (index % 2) * w * 0.52;
      const py = y - h / 2 + Math.floor(index / 2) * h * 0.55;
      drawFieldPlot(graphics, {
        points: [
          { x: px, y: py },
          { x: px + w * 0.46, y: py - 1 },
          { x: px + w * 0.47, y: py + h * 0.5 },
          { x: px + 1, y: py + h * 0.52 },
        ],
        stage: rand(),
        seed: seed + index * 7,
      });
    }
    cluster.add(graphics);
  }

  /**
   * A city's rampart. The default traces the hex edges at full weight, so a walled town reads as a
   * black honeycomb; wobbling hard and thinning the line turns the same edges into a wall.
   */
  override drawCityWall(graphics: Phaser.GameObjects.Graphics, edges: Array<[number, number, number, number]>): void {
    for (const [x1, y1, x2, y2] of edges) {
      const seed = Math.round(x1 + y1 * 3 + x2 * 7 + y2 * 11);
      inkPath(graphics, [{ x: x1, y: y1 }, { x: x2, y: y2 }], seed, {
        width: 1.6, alpha: 0.5, colour: PIGMENT.mucSoft, wobble: 3.2, step: 18,
      });
    }
  }

  /** A farm is paddy and a hamlet, which is what a farm in the delta looks like. */
  override createFarmCluster(scale: number, upgradeLevel: number): Phaser.GameObjects.Container {
    const scene = this.scene as Phaser.Scene;
    const container = scene.add.container(0, 0);
    const graphics = scene.add.graphics();
    const seed = Math.round(scale * 977 + upgradeLevel * 31);
    const rand = mulberry32(seed);

    const cols = 3;
    const rows = 2 + Math.min(2, upgradeLevel);
    const w = 24 * scale;
    const h = 15 * scale;
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const px = -w * 1.5 + col * w;
        const py = -h * (rows / 2) + row * h;
        drawFieldPlot(graphics, {
          points: [
            { x: px, y: py },
            { x: px + w - 2, y: py - 1 + (rand() - 0.5) * 2 },
            { x: px + w - 1, y: py + h - 3 },
            { x: px + 1, y: py + h - 2 },
          ],
          stage: rand(),
          seed: seed + row * 11 + col,
        });
      }
    }
    hamlet(graphics, w * 1.4, h * 0.4, 0.5 * scale, seed + 300, 2 + Math.min(3, upgradeLevel));
    buffalo(graphics, -w * 1.4, h * (rows / 2) + 6, 0.4 * scale, seed + 400, rand() > 0.5);
    container.add(graphics);
    return container;
  }
}
