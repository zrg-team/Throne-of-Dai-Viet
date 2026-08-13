import Phaser from 'phaser';
import { PIGMENT } from './palette';
import { mulberry32 } from './stroke';

/**
 * Giấy điệp — the ground everything else is printed on.
 *
 * Dó-bark paper coated in crushed seashell bound with glutinous-rice paste, which gives a faintly
 * iridescent, slightly gritty surface. Three things make it read as paper rather than as a beige
 * rectangle: broad uneven tea-staining, short laid fibres lying mostly along the sheet, and a
 * sparse shell grit you only notice on a good screen.
 *
 * Baked ONCE into a tile texture and repeated with a TileSprite. Drawing this per frame, or per
 * world, would be the most expensive thing on the map for no gain — the grain is not supposed to
 * be looked at.
 */

const TEXTURE_KEY = 'ink:paper';
const TILE = 512;

/** Builds the paper tile if this scene's texture manager has not got it yet. */
export function ensurePaperTexture(scene: Phaser.Scene): string {
  if (scene.textures.exists(TEXTURE_KEY)) {
    return TEXTURE_KEY;
  }

  const texture = scene.textures.createCanvas(TEXTURE_KEY, TILE, TILE);
  if (!texture) {
    return TEXTURE_KEY;
  }
  const ctx = texture.getContext();
  const rand = mulberry32(0x0d13b7);
  const hex = (value: number) => `#${value.toString(16).padStart(6, '0')}`;

  ctx.fillStyle = hex(PIGMENT.diep);
  ctx.fillRect(0, 0, TILE, TILE);

  // Broad tea-staining, so no two areas of the sheet are the same tone. Drawn with wrap-around
  // copies so the tile repeats without a visible grid of blotches.
  for (let index = 0; index < 16; index += 1) {
    const x = rand() * TILE;
    const y = rand() * TILE;
    const rx = 60 + rand() * 160;
    const ry = 50 + rand() * 130;
    ctx.globalAlpha = 0.045 + rand() * 0.045;
    ctx.fillStyle = rand() > 0.45 ? hex(PIGMENT.diepLo) : hex(PIGMENT.diepHi);
    for (const dx of [-TILE, 0, TILE]) {
      for (const dy of [-TILE, 0, TILE]) {
        ctx.beginPath();
        ctx.ellipse(x + dx, y + dy, rx, ry, rand() * 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // Laid fibre: short strokes lying mostly along the sheet.
  ctx.globalAlpha = 0.055;
  ctx.lineWidth = 0.7;
  for (let index = 0; index < 900; index += 1) {
    const x = rand() * TILE;
    const y = rand() * TILE;
    const length = 2 + rand() * 9;
    const angle = (rand() - 0.5) * 0.5;
    ctx.strokeStyle = rand() > 0.5 ? hex(PIGMENT.diepDeep) : hex(PIGMENT.diepHi);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length);
    ctx.stroke();
  }

  // Shell grit — the thing you only notice on a good screen, and should never be told about.
  ctx.globalAlpha = 0.14;
  ctx.fillStyle = '#fffbf0';
  for (let index = 0; index < 300; index += 1) {
    ctx.fillRect(rand() * TILE, rand() * TILE, 1, 1);
  }

  ctx.globalAlpha = 1;
  texture.refresh();
  return TEXTURE_KEY;
}

/**
 * A paper ground covering the world, as one tiled sprite.
 *
 * Returned at the caller's chosen depth so it can sit inside `MapScene`'s static bake band and be
 * composited away with everything else.
 */
export function createPaperGround(
  scene: Phaser.Scene,
  width: number,
  height: number,
): Phaser.GameObjects.TileSprite {
  ensurePaperTexture(scene);
  return scene.add.tileSprite(0, 0, width, height, TEXTURE_KEY).setOrigin(0, 0);
}
