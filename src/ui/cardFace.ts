import Phaser from 'phaser';
import { findPowerCard } from '../data/ascentCards';
import { cabinetLevel } from '../state/cabinet';
import { CARD_ICON_SIZE, drawCardIcon, iconForOption, type CardIconId } from './CardIcons';
import { INK_UI, INK_UI_HEX } from './InkUI';
import { seal, sawtoothBand } from './ink/devices';
import { getLanguage, t } from '../i18n';
import { TITLE_FONT, UI_FONT } from './fonts';
import type { AscentRarity } from '../state/types';

/**
 * The card face, baked. One RenderTexture per `(cardId, level, language)`, drawn once and
 * stamped by every consumer — the draft fan, the cabinet grid, the scratch reveal, the bind
 * step. **Never live Graphics per frame**: the perf ledger's cost floor is Phaser 4 replaying
 * live Graphics every frame (12–16 MB of garbage a frame at its worst), and a hand of five
 * inked cards is exactly the object count that trap is made of.
 *
 * Pattern and lifetime rules copied from `heroFaceTextureKey` (FaceRenderer): draw into an
 * off-list RenderTexture, `render()` **before** destroying the source container or the buffered
 * draw flushes against dead objects and a blank face is cached forever, then `saveTexture`.
 * The RT is kept in a module map because destroying it destroys the saved texture.
 */

/** Design-unit size of a face. Consumers scale stamps down; nothing renders larger than this. */
export const CARD_FACE_W = 150;
export const CARD_FACE_H = 210;
/** Crisp at the fan's near-full-size card without doubling the cache's area. */
const FACE_RASTER = 1.5;

const FACE_TEXTURE_PREFIX = 'card-face:';
const faceTextures = new Map<string, Phaser.GameObjects.RenderTexture>();

/** Mirrors `RARITY_COLOR` in `scenes/conquest/constants.ts` — ui/ must not import scenes/. */
const FACE_RARITY: Record<AscentRarity, number> = {
  bronze: 0x9c6b3f,
  silver: 0xa8adb4,
  gold: INK_UI.gold,
  jade: INK_UI.jade,
};

/**
 * The motif each seal is carved with — the `CardIcons` vocabulary drawn large. Cards not named
 * here fall through to `iconForOption`'s token match, then to the crown.
 */
const CARD_MOTIF: Record<string, CardIconId> = {
  'iron-levy': 'blade',
  'rice-tribute': 'grain',
  'salt-roads': 'cart',
  'feigned-retreat': 'retreat',
  'village-muster': 'banner',
  'bronze-drums': 'banner',
  'corvee-labour': 'hammer',
  'granary-edict': 'grain',
  'earthen-ramparts': 'wall',
  'bamboo-palisade': 'wall',
  'mountain-pass': 'hourglass',
  'surveyors-corps': 'scroll',
  'bronze-drum': 'banner',
  'royal-guard': 'shield',
  'fire-arrows': 'bows',
  'twice-born': 'spark',
  'mandarin-academy': 'book',
  'war-drums': 'horse',
  'dragon-standard': 'crown',
  'heavenly-mandate': 'crown',
  'bach-dang-stakes': 'spears',
  'thunder-march': 'horse',
  'celestial-granary': 'grain',
};

export function cardMotif(cardId: string): CardIconId {
  return CARD_MOTIF[cardId] ?? iconForOption(cardId) ?? 'crown';
}

/**
 * Builds the face at design size, as live objects. Only the bake calls this — consumers go
 * through `cardFaceTextureKey` and stamp the result.
 */
function buildCardFace(scene: Phaser.Scene, cardId: string, level: 1 | 2 | 3): Phaser.GameObjects.Container {
  const card = findPowerCard(cardId);
  const rarity: AscentRarity = card?.rarity ?? 'bronze';
  const colour = FACE_RARITY[rarity];
  const W = CARD_FACE_W;
  const H = CARD_FACE_H;
  const container = scene.add.container(0, 0);

  // Paper, wash, and the double frame the game's chrome is drawn in — the outer heavy in the
  // rarity's ink, the inner a hairline. A Lv3 card gets the gilt frame the ladder promises.
  const g = scene.add.graphics();
  g.fillStyle(INK_UI.parchment, 1);
  g.fillRoundedRect(0, 0, W, H, 10);
  // The wash climbs with rarity, exactly like the hero cards: bronze stays bare paper.
  const wash = rarity === 'jade' ? 0.15 : rarity === 'gold' ? 0.11 : rarity === 'silver' ? 0.05 : 0;
  if (wash > 0) {
    g.fillStyle(colour, wash);
    g.fillRoundedRect(2, 2, W - 4, H - 4, 9);
  }
  g.lineStyle(level >= 3 ? 3.5 : 2.5, level >= 3 ? INK_UI.gold : colour, 0.95);
  g.strokeRoundedRect(1.5, 1.5, W - 3, H - 3, 9);
  g.lineStyle(0.9, INK_UI.brush, 0.4);
  g.strokeRoundedRect(6, 6, W - 12, H - 12, 6);
  container.add(g);

  // Rarity on the head, the way every card in the mode says its tier.
  container.add(scene.add.text(12, 10, t(`ascent.rarity.${rarity}` as Parameters<typeof t>[0]), {
    color: INK_UI_HEX.mutedText, fontFamily: UI_FONT, fontSize: '9px', fontStyle: '700',
  }));

  // The motif, carved large: the 26-unit glyph at 3×, boxed on its own ground.
  const motifBox = scene.add.graphics();
  motifBox.fillStyle(colour, 0.08);
  motifBox.fillRoundedRect(18, 28, W - 36, 92, 6);
  motifBox.lineStyle(0.9, INK_UI.brush, 0.3);
  motifBox.strokeRoundedRect(18, 28, W - 36, 92, 6);
  container.add(motifBox);
  const glyph = drawCardIcon(scene, cardMotif(cardId), colour);
  glyph.setPosition(W / 2, 28 + 46);
  glyph.setScale((92 - 18) / CARD_ICON_SIZE / 2.1);
  container.add(glyph);

  const band = scene.add.graphics();
  sawtoothBand(band, 18, 124, W - 36, 5, 0.45);
  container.add(band);

  // The name, centred under the motif. Two lines at most; the catalog's longest names wrap once.
  const name = scene.add.text(W / 2, 134, t(`ascent.card.${cardId}` as Parameters<typeof t>[0]), {
    color: INK_UI_HEX.inkText, fontFamily: TITLE_FONT, fontSize: '14px', fontStyle: '700',
    align: 'center', wordWrap: { width: W - 24 }, maxLines: 2,
  }).setOrigin(0.5, 0);
  container.add(name);

  // The stars are the ladder made visible: one per cabinet level, gold from Lv2 up.
  const stars = scene.add.text(W / 2, H - 32, '★'.repeat(level), {
    color: level >= 2 ? `#${INK_UI.gold.toString(16).padStart(6, '0')}` : INK_UI_HEX.mutedText,
    fontFamily: UI_FONT, fontSize: '14px',
  }).setOrigin(0.5, 0);
  container.add(stars);

  // The name seal, pressed crooked in the corner the way a hand presses one.
  const chop = scene.add.graphics();
  seal(chop, W - 24, H - 24, 22, rarity === 'jade' ? 'star' : 'lotus');
  container.add(chop);

  return container;
}

/**
 * The face as a texture key, baked on first ask and cached per `(cardId, level, language)`.
 * Returns undefined when the GL context is lost — callers draw nothing this frame and ask
 * again on the next render, exactly as the portrait bake does.
 */
export function cardFaceTextureKey(scene: Phaser.Scene, cardId: string, level?: 1 | 2 | 3): string | undefined {
  const lv = level ?? cabinetLevel(cardId);
  const key = `${FACE_TEXTURE_PREFIX}${cardId}:${lv}:${getLanguage()}`;
  if (scene.textures.exists(key)) return key;
  const renderer = scene.game.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
  if (renderer?.contextLost) return undefined;

  const width = Math.ceil(CARD_FACE_W * FACE_RASTER);
  const height = Math.ceil(CARD_FACE_H * FACE_RASTER);
  const target = scene.make.renderTexture({ width, height }, false);
  const face = buildCardFace(scene, cardId, lv);
  face.setScale(FACE_RASTER);
  target.draw(face);
  // Flush the buffered draw before the source dies — see the file comment.
  target.render();
  face.destroy(true);
  target.saveTexture(key);
  faceTextures.set(key, target);
  return key;
}

/**
 * Stamps a face into a box, preserving aspect. The image is a single texture — a whole fan of
 * these costs the renderer five quads, which is the flat frame cost the gate measures.
 */
export function stampCardFace(
  scene: Phaser.Scene,
  cardId: string,
  box: { x: number; y: number; width: number; height: number },
  level?: 1 | 2 | 3,
): Phaser.GameObjects.Image | undefined {
  const key = cardFaceTextureKey(scene, cardId, level);
  if (!key) return undefined;
  const image = scene.add.image(box.x + box.width / 2, box.y + box.height / 2, key);
  const scale = Math.min(box.width / (CARD_FACE_W * FACE_RASTER), box.height / (CARD_FACE_H * FACE_RASTER));
  image.setScale(scale);
  return image;
}
