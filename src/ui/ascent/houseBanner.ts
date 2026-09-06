import Phaser from 'phaser';
import { INK_UI } from '../InkUI';
import { getDynasty, type DynastyBanner } from '../../state/dynasty';
import { ROYAL_HOUSES } from '../faces/kingLook';
import { BANNER_EMBLEM_SIZE, drawBannerEmblem } from './bannerEmblems';

/**
 * The house's mark — two colours and a glyph, on a hanging silk.
 *
 * **This is chrome, not a flag system.** `ArmyRenderer` already flies the realm's own standard
 * over every marching column, drawn from a `flagSeed` and the kingdom colour, and it is left
 * exactly as it is: putting the house's banner on the map would mean re-baking a column's
 * standard on a store read, which is a rendering change this feature has no business making.
 * What the banner does instead is identify the *house* wherever the house appears — the Tông
 * Phả sheet, the coronation, the next-reign screen — which is the job a company banner does in
 * Battle Brothers and the reason a player recognises their own save at a glance.
 *
 * Drawn rather than baked because there are never more than two on a screen at once and both
 * sit on pages, not on frames.
 */
export function drawHouseBanner(
  scene: Phaser.Scene,
  banner: DynastyBanner,
  width: number,
  height: number,
): Phaser.GameObjects.Container {
  const root = scene.add.container(0, 0);
  const g = scene.add.graphics();
  // Square cloth, layered bands and flame-shaped fringe draw on Vietnamese ceremonial flags.
  // This two-colour game standard is not a reconstruction of a dynasty's historical flag.
  const unit = Math.min(width / 100, height / 116);
  const side = 80 * unit;
  const x = (width - 94 * unit) / 2 + 9 * unit;
  const y = 14 * unit;
  const path = (points: number[][], colour: number, weight = 1.2): void => {
    const vertices = points.map(([px, py]) => ({ x: px, y: py }));
    g.fillStyle(colour).fillPoints(vertices, true);
    g.lineStyle(weight * unit, INK_UI.brush).strokePoints(vertices, true);
  };
  const pole = x - 4 * unit;
  g.lineStyle(3.8 * unit, INK_UI.brush).lineBetween(pole, 7 * unit, pole, height - unit);
  g.lineStyle(1.2 * unit, 0xc49a57).lineBetween(pole - 0.6 * unit, 9 * unit, pole - 0.6 * unit, height - 2 * unit);
  path([[pole, unit], [pole + 3 * unit, 7 * unit], [pole, 10 * unit], [pole - 3 * unit, 7 * unit]], 0xd8b45a);
  const teeth = width >= 70 ? 8 : 5;
  for (let i = 0; i < teeth; i += 1) {
    const a = side * i / teeth;
    const b = side * (i + 1) / teeth;
    const mid = (a + b) / 2;
    path([[x + a, y], [x + mid - unit, y - 5 * unit], [x + b, y]], banner.trim, 0.8);
    path([[x + side, y + a], [x + side + 6 * unit, y + mid - unit], [x + side, y + b]], banner.trim, 0.8);
    path([[x + a, y + side], [x + mid + unit, y + side + 6 * unit], [x + b, y + side]], banner.trim, 0.8);
  }
  g.fillStyle(banner.trim).fillRect(x, y, side, side);
  g.lineStyle(1.6 * unit, INK_UI.brush).strokeRect(x, y, side, side);
  const edge = luma(banner.trim) > 140 ? INK_UI.brush : 0xf3e6c4;
  g.lineStyle(1.1 * unit, edge, 0.9).strokeRect(x + 3 * unit, y + 3 * unit, side - 6 * unit, side - 6 * unit);
  g.fillStyle(banner.field).fillRect(x + 7 * unit, y + 7 * unit, side - 14 * unit, side - 14 * unit);
  g.lineStyle(1.1 * unit, edge).strokeRect(x + 7 * unit, y + 7 * unit, side - 14 * unit, side - 14 * unit);
  const markColour = Math.abs(luma(banner.trim) - luma(banner.field)) >= 80
    ? banner.trim : luma(banner.field) > 140 ? INK_UI.brush : 0xf3e6c4;
  // Sparse woven ticks; omit at the smallest dynasty-chip sizes.
  if (width >= 70) {
    g.lineStyle(0.65 * unit, markColour, 0.22);
    for (let i = 0; i < 7; i += 1) {
      const iy = y + (14 + i * 9) * unit;
      g.lineBetween(x + 10 * unit, iy, x + 14 * unit, iy + unit);
      g.lineBetween(x + side - 14 * unit, iy, x + side - 10 * unit, iy + unit);
    }
  }
  g.lineStyle(1.5 * unit, 0xd8b45a).lineBetween(pole - unit, y + 7 * unit, x + unit, y + 7 * unit);
  g.lineBetween(pole - unit, y + side - 7 * unit, x + unit, y + side - 7 * unit);
  root.add(g);
  const emblem = drawBannerEmblem(scene, banner.emblem, markColour,
    luma(markColour) > 140 ? INK_UI.brush : 0xf3e6c4, banner.field);
  emblem.setPosition(x + side / 2, y + side / 2);
  emblem.setScale(side * 0.66 / BANNER_EMBLEM_SIZE);
  root.add(emblem);
  root.setData('houseBanner', { ...banner, width, height });
  return root;
}

/** Keep the player's colours exact; contrast comes from the seam and the motif's ink. */
function luma(colour: number): number {
  return 0.299 * ((colour >> 16) & 255) + 0.587 * ((colour >> 8) & 255) + 0.114 * (colour & 255);
}

/**
 * The house's banner, or the one its họ opens on.
 *
 * A house crowned before the banner step existed — or one whose founder is still the run's
 * champion rather than a made king — has no stored mark, and a sheet with a hole in it where the
 * other sheets have a banner is worse than a default. The fallback is the dynasty's own
 * game-assigned field, which is what the banner step itself opens on.
 */
export function houseBanner(): DynastyBanner {
  const founder = getDynasty().founder;
  if (founder?.banner) return founder.banner;
  const house = getDynasty().house;
  const royal = ROYAL_HOUSES.find((entry) => entry.surname === house);
  return { field: royal?.field ?? 0xaa3a2c, trim: 0xd8b45a, emblem: 'crown' };
}
