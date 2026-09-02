import Phaser from 'phaser';
import { CARD_ICON_SIZE, drawCardIcon, type CardIconId } from '../CardIcons';
import { INK_UI } from '../InkUI';
import { getDynasty, type DynastyBanner } from '../../state/dynasty';
import { BANNER_EMBLEMS, ROYAL_HOUSES } from '../faces/kingLook';

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

  // A silk hung from a pole: square shoulders, a swallowtail at the foot. The tail is what makes
  // it read as a banner rather than as a coloured rectangle at 40 units wide.
  const tail = Math.max(6, Math.round(height * 0.16));
  const body: Phaser.Types.Math.Vector2Like[] = [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height - tail },
    { x: width / 2, y: height },
    { x: 0, y: height - tail },
  ];
  g.fillStyle(banner.field, 1);
  g.fillPoints(body, true);
  g.lineStyle(2, INK_UI.brush, 0.82);
  g.strokePoints(body, true);
  // The trim is a band inside the edge, not a second outline: an outline in a second colour at
  // this size reads as a rendering error rather than as a border.
  g.lineStyle(2.4, banner.trim, 0.95);
  g.strokeRect(3.5, 3.5, width - 7, height - tail - 3.5);
  root.add(g);

  const emblem = drawCardIcon(scene, emblemIcon(banner.emblem), banner.trim);
  const scale = Math.min((width - 14) / CARD_ICON_SIZE, (height - tail - 14) / CARD_ICON_SIZE, 1.6);
  emblem.setPosition(width / 2, (height - tail) / 2);
  emblem.setScale(scale);
  root.add(emblem);
  return root;
}

/** An emblem id the glyph table actually knows; anything stale falls back to the crown. */
export function emblemIcon(emblem: string): CardIconId {
  return (BANNER_EMBLEMS as readonly string[]).includes(emblem) ? emblem as CardIconId : 'crown';
}

/**
 * The house's banner, or the one its họ opens on.
 *
 * A house crowned before the banner step existed — or one whose founder is still the run's
 * champion rather than a made king — has no stored mark, and a sheet with a hole in it where the
 * other sheets have a banner is worse than a default. The fallback is the dynasty's own
 * historical field, which is what the banner step itself opens on.
 */
export function houseBanner(): DynastyBanner {
  const founder = getDynasty().founder;
  if (founder?.banner) return founder.banner;
  const house = getDynasty().house;
  const royal = ROYAL_HOUSES.find((entry) => entry.surname === house);
  return { field: royal?.field ?? 0xaa3a2c, trim: 0xd8b45a, emblem: 'crown' };
}
