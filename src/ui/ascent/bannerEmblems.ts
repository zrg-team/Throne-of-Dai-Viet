import Phaser from 'phaser';
import { PIGMENT } from '../ink/palette';
import { BANNER_EMBLEMS, type BannerEmblem } from '../faces/kingLook';

export const BANNER_EMBLEM_SIZE = 64;

/** Saved ids are stable; the old crown is now the bronze-drum motif in the banner picker. */
export function bannerEmblem(id: string): BannerEmblem {
  return (BANNER_EMBLEMS as readonly string[]).includes(id) ? id as BannerEmblem : 'crown';
}

/** Dedicated woodcut devices, independent of the small tactical card glyphs. */
export function drawBannerEmblem(
  scene: Phaser.Scene,
  id: string,
  fill = PIGMENT.hoePale,
  ink = PIGMENT.muc,
  ground = PIGMENT.diepHi,
): Phaser.GameObjects.Container {
  const root = scene.add.container(0, 0).setData('bannerEmblem', bannerEmblem(id));
  const g = scene.add.graphics();
  root.add(g);
  const polygon = (points: number[][], colour = fill, line = ink, weight = 1.8): void => {
    const path = points.map(([x, y]) => ({ x, y }));
    g.fillStyle(colour).fillPoints(path, true);
    g.lineStyle(weight, line).strokePoints(path, true);
  };
  const line = (points: number[][], colour = ink, weight = 1.6): void => {
    g.lineStyle(weight, colour).strokePoints(points.map(([x, y]) => ({ x, y })), false);
  };
  const oval = (x: number, y: number, w: number, h: number, colour = fill): void => {
    g.fillStyle(colour).fillEllipse(x, y, w, h);
    g.lineStyle(1.8, ink).strokeEllipse(x, y, w, h);
  };
  switch (bannerEmblem(id)) {
    case 'crown': {
      // Ngọc Lũ's fourteen-ray sun and geometric bands; an adaptation, not a facsimile.
      oval(0, 0, 58, 58);
      g.lineStyle(1.3, ink).strokeCircle(0, 0, 25).strokeCircle(0, 0, 20).strokeCircle(0, 0, 17);
      const sun: number[][] = [];
      for (let i = 0; i < 28; i += 1) {
        const a = i * Math.PI / 14 - Math.PI / 2;
        const r = i % 2 ? 7 : 16;
        sun.push([Math.cos(a) * r, Math.sin(a) * r]);
      }
      polygon(sun, ink, ink, 0.5);
      for (let i = 0; i < 22; i += 1) {
        const a = i * Math.PI * 2 / 22;
        const p = (r: number, delta: number): number[] => [Math.cos(a + delta) * r, Math.sin(a + delta) * r];
        line([p(24, -0.07), p(21, 0), p(24, 0.07)], ink, 1.15);
      }
      g.fillStyle(fill).fillCircle(0, 0, 3);
      break;
    }
    case 'banner': {
      // A square command standard, with nested bands and a flame-cut fly.
      line([[-21, 28], [-21, -27]], ink, 4);
      polygon([[-24, -25], [-21, -31], [-18, -25]], fill);
      for (let i = 0; i < 5; i += 1) {
        const y = -21 + i * 7;
        polygon([[21, y], [28, y + 1], [22, y + 6]], fill, ink, 1);
      }
      polygon([[-18, -23], [22, -21], [22, 16], [-18, 14]]);
      polygon([[-13, -18], [16, -16], [16, 10], [-13, 9]], ground, ink, 1.3);
      polygon([[-9, -14], [12, -13], [12, 6], [-9, 5]], fill, ink, 1);
      line([[-3, -9], [6, -8], [6, 1], [-3, 0], [-3, -9]], ink, 2.3);
      line([[-21, -23], [-27, -14], [-25, -7]], fill, 2.5);
      break;
    }
    case 'blade': {
      // A complete sword: tapered blade, ridge, guard, wrapped grip and pommel.
      g.setRotation(Math.PI / 5);
      polygon([[0, -31], [5, -21], [4, 12], [-4, 12], [-5, -21]]);
      polygon([[0, -27], [3, -20], [2, 10], [0, 10]], ground, ground, 0.5);
      line([[0, -24], [0, 11]], ink, 1.1);
      polygon([[-12, 10], [-8, 8], [-5, 11], [5, 11], [8, 8], [12, 10], [9, 15], [-9, 15]]);
      polygon([[-3, 15], [3, 15], [3, 27], [-3, 27]]);
      for (let y = 17; y < 26; y += 3) line([[-3, y], [3, y + 1]], ink, 1.1);
      oval(0, 28, 9, 5);
      line([[4, 23], [12, 26], [16, 21], [16, 12]], ink, 1.3);
      polygon([[13, 13], [18, 13], [19, 4], [15, 7]], fill, ink, 1.1);
      break;
    }
    case 'grain': {
      const stems = [
        [[-2, 27], [-6, 10], [-10, -3], [-16, -12], [-23, -14], [-29, -10]],
        [[1, 27], [1, 4], [0, -12], [-4, -23], [-12, -27], [-19, -24]],
        [[3, 27], [10, 6], [14, -11], [19, -20], [25, -20], [29, -16]],
      ];
      for (const stem of stems) {
        line(stem, ink, 3.5);
        line(stem, fill, 1.8);
      }
      polygon([[-3, 22], [-22, 8], [-28, -5], [-14, 4]], fill);
      polygon([[3, 23], [23, 11], [29, 0], [14, 6]], fill);
      const kernels = [[-28,-10],[-23,-12],[-18,-10],[-13,-4],[-18,-24],[-12,-25],[-7,-21],[-3,-15],[28,-16],[24,-18],[20,-16],[16,-10]];
      for (const [x, y] of kernels) {
        polygon([[x, y - 3], [x + 4, y - 1], [x + 3, y + 5], [x, y + 7], [x - 2, y + 2]], fill, ink, 1.2);
      }
      polygon([[-6, 18], [7, 18], [6, 22], [-5, 23]], ink);
      break;
    }
    case 'branch': {
      // Jointed bamboo and lance-shaped leaves, not the tactical river-branch glyph.
      polygon([[-9, 29], [-5, -26], [0, -27], [-3, 29]]);
      polygon([[6, 29], [7, -15], [12, -17], [12, 29]]);
      for (const y of [-17, -3, 12, 25]) line([[-9, y], [1, y - 1]], ink, 2);
      for (const y of [-9, 7, 22]) line([[5, y], [13, y]], ink, 2);
      line([[-4, -15], [-15, -22], [-23, -23]], ink, 1.5);
      line([[10, -4], [18, -14], [28, -19]], ink, 1.5);
      line([[-5, 5], [-16, 0], [-28, 2]], ink, 1.5);
      for (const points of [
        [[-13,-20],[-18,-31],[-20,-27],[-18,-20]],
        [[-18,-22],[-31,-25],[-27,-18],[-20,-19]],
        [[17,-12],[18,-26],[23,-22],[21,-16]],
        [[22,-17],[31,-15],[25,-10],[18,-10]],
        [[-16,1],[-26,-9],[-25,-2],[-20,2]],
        [[-18,2],[-30,8],[-23,10],[-13,4]],
        [[11,11],[26,2],[23,10],[13,15]],
      ]) polygon(points, fill, ink, 1.2);
      break;
    }
    case 'tortoise': {
      polygon([[-11,-14],[-25,-20],[-24,-10],[-14,-4]]);
      polygon([[11,-14],[25,-20],[24,-10],[14,-4]]);
      polygon([[-13,9],[-24,19],[-17,23],[-9,17]]);
      polygon([[13,9],[24,19],[17,23],[9,17]]);
      polygon([[-3,21],[0,30],[4,20]]);
      oval(0, -25, 13, 13);
      oval(0, 0, 39, 49);
      g.lineStyle(1.2, ink).strokeEllipse(0, 0, 31, 41);
      polygon([[-7,-10],[0,-15],[8,-10],[8,7],[0,13],[-8,7]], fill, ink, 1.8);
      line([[-7,-10],[-12,-16]], ink); line([[8,-10],[12,-16]], ink);
      line([[-8,0],[-16,0]], ink); line([[8,0],[16,0]], ink);
      line([[-8,7],[-12,15]], ink); line([[8,7],[12,15]], ink);
      line([[0,13],[0,21]], ink);
      g.fillStyle(ink).fillCircle(-3, -27, 1).fillCircle(3, -27, 1);
      break;
    }
  }
  return root;
}
