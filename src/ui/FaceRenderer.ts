import Phaser from 'phaser';
import type { Hero } from '../state/types';

type HeadStyle = 'round' | 'wideRound' | 'tallRound' | 'square' | 'wideSquare';
type EyeStyle = 'bars' | 'shortBars' | 'dots' | 'sleepy' | 'wideBars';
type MouthStyle = 'line' | 'small' | 'smile' | 'open';
type NoseStyle = 'line' | 'longLine' | 'flat' | 'wedge';
type BeardStyle = 'none' | 'moustache' | 'goatee' | 'moustacheGoatee' | 'full';
type CollarStyle = 'v' | 'wideV' | 'fold' | 'band';
type ShirtStyle = 'plain' | 'robe' | 'split' | 'armor';
type HatStyle = 'roundCap' | 'flatCap' | 'scholar' | 'official' | 'none';

interface FaceRecipe {
  skin: number;
  skinShadow: number;
  hair: number;
  accent: number;
  accentLight: number;
  beard: number;
  headStyle: HeadStyle;
  eyeStyle: EyeStyle;
  mouthStyle: MouthStyle;
  noseStyle: NoseStyle;
  beardStyle: BeardStyle;
  collarStyle: CollarStyle;
  shirtStyle: ShirtStyle;
  hatStyle: HatStyle;
}

const skins = [0xf1c18d, 0xe6ad76, 0xd49862, 0xc38354, 0xf0cea6, 0xb97750];
const hairColors = [0x160b05, 0x2b170b, 0x49311d, 0x5c4730, 0x111111];
const accentColors = [0xc11246, 0x6a8c45, 0x3f6e91, 0x9d6a35, 0x7d4f8a, 0xd8a941];
const headStyles: HeadStyle[] = ['round', 'wideRound', 'tallRound', 'square', 'wideSquare'];
const eyeStyles: EyeStyle[] = ['bars', 'shortBars', 'dots', 'sleepy', 'wideBars'];
const mouthStyles: MouthStyle[] = ['line', 'small', 'smile', 'open'];
const noseStyles: NoseStyle[] = ['line', 'longLine', 'flat', 'wedge'];
const beardStyles: BeardStyle[] = ['none', 'moustache', 'goatee', 'moustacheGoatee', 'full'];
const collarStyles: CollarStyle[] = ['v', 'wideV', 'fold', 'band'];
const shirtStyles: ShirtStyle[] = ['plain', 'robe', 'split', 'armor'];
const hatStyles: HatStyle[] = ['roundCap', 'flatCap', 'scholar', 'official', 'none'];
const FACE_X = 0;
const FACE_Y = -12;
const FACE_WIDTH = 56;
const FACE_HEIGHT = 78;
const HEAD_TOP = FACE_Y - FACE_HEIGHT / 2;
const CHIN_Y = FACE_Y + FACE_HEIGHT / 2;
const NECK_Y = CHIN_Y + 11;

export function renderHeroFace(
  scene: Phaser.Scene,
  hero: Hero,
  x: number,
  y: number,
  scale: number,
): Phaser.GameObjects.Container {
  const recipe = createRecipe(hero);
  const root = scene.add.container(x, y).setScale(scale);

  const frame = scene.add.rectangle(0, 0, 132, 148, 0x1b0703, 1);
  frame.setStrokeStyle(2, 0x6e4f2b, 0.95);
  const innerFrame = scene.add.rectangle(0, 0, 108, 124, 0x230904, 0);
  innerFrame.setStrokeStyle(2, 0x6e4f2b, 0.48);
  root.add([frame, innerFrame]);

  drawShirt(scene, root, recipe);
  drawHead(scene, root, recipe);
  drawHairUnderHat(scene, root, recipe);
  drawHat(scene, root, recipe);
  drawCollar(scene, root, recipe);
  drawFaceDetails(scene, root, recipe);

  return root;
}

function createRecipe(hero: Hero): FaceRecipe {
  const next = seededRandom(hashString(hero.id));
  const skin = pick(skins, next);
  const accent = pick(accentColors, next);
  const hair = pick(hairColors, next);
  const beard = next() > 0.18 ? visibleBeardColor(hair) : 0x5e665b;

  return {
    skin,
    skinShadow: shade(skin, -24),
    hair,
    accent,
    accentLight: shade(accent, 44),
    beard,
    headStyle: pick(headStyles, next),
    eyeStyle: pick(eyeStyles, next),
    mouthStyle: pick(mouthStyles, next),
    noseStyle: pick(noseStyles, next),
    beardStyle: pick(beardStyles, next),
    collarStyle: pick(collarStyles, next),
    shirtStyle: pick(shirtStyles, next),
    hatStyle: hero.type === 'agent' && next() > 0.65 ? 'none' : pick(hatStyles, next),
  };
}

function drawShirt(scene: Phaser.Scene, root: Phaser.GameObjects.Container, recipe: FaceRecipe): void {
  const neck = scene.add.rectangle(FACE_X, NECK_Y, 18, 22, recipe.skinShadow, 1);
  const shirtY = NECK_Y + 31;

  if (recipe.shirtStyle === 'armor') {
    const armor = scene.add.rectangle(FACE_X, shirtY, 72, 42, 0x85827a, 1);
    armor.setStrokeStyle(2, recipe.accentLight, 0.58);
    root.add([neck, armor, scene.add.rectangle(FACE_X, shirtY - 4, 58, 6, 0xbdb49b, 0.82)]);
    return;
  }

  if (recipe.shirtStyle === 'split') {
    root.add([
      neck,
      scene.add.rectangle(FACE_X - 18, shirtY, 36, 42, recipe.accent, 1),
      scene.add.rectangle(FACE_X + 18, shirtY, 36, 42, recipe.accentLight, 0.95),
    ]);
    return;
  }

  if (recipe.shirtStyle === 'robe') {
    root.add([
      neck,
      scene.add.rectangle(FACE_X, shirtY, 72, 42, recipe.accent, 1),
      scene.add.rectangle(FACE_X + 16, shirtY, 22, 42, recipe.accentLight, 0.52),
    ]);
    return;
  }

  root.add([neck, scene.add.rectangle(FACE_X, shirtY, 72, 42, recipe.accent, 1)]);
}

function drawHead(scene: Phaser.Scene, root: Phaser.GameObjects.Container, recipe: FaceRecipe): void {
  const size = headSize(recipe.headStyle);
  const leftEar = scene.add.ellipse(FACE_X - size.width / 2 - 2, FACE_Y, 11, 24, recipe.skinShadow, 1);
  const rightEar = scene.add.ellipse(FACE_X + size.width / 2 + 2, FACE_Y, 11, 24, recipe.skin, 1);
  const face =
    recipe.headStyle === 'square' || recipe.headStyle === 'wideSquare'
      ? scene.add.rectangle(FACE_X, FACE_Y, size.width, size.height, recipe.skin, 1)
      : scene.add.ellipse(FACE_X, FACE_Y, size.width, size.height, recipe.skin, 1);
  const chin = scene.add.ellipse(FACE_X, CHIN_Y - 4, Math.max(24, size.width - 30), 16, recipe.skin, 1);
  root.add([leftEar, rightEar, face, chin]);
}

function drawHairUnderHat(scene: Phaser.Scene, root: Phaser.GameObjects.Container, recipe: FaceRecipe): void {
  const fringe = scene.add.rectangle(FACE_X, HEAD_TOP + 4, FACE_WIDTH - 10, recipe.hatStyle === 'none' ? 12 : 8, recipe.hair, 1);
  const leftSide = scene.add.rectangle(FACE_X - 24, HEAD_TOP + 22, 8, recipe.hatStyle === 'none' ? 38 : 28, recipe.hair, 1);
  const rightSide = scene.add.rectangle(FACE_X + 24, HEAD_TOP + 22, 8, recipe.hatStyle === 'none' ? 38 : 28, recipe.hair, 1);
  const top = recipe.hatStyle === 'none' ? scene.add.ellipse(FACE_X, HEAD_TOP - 2, 54, 18, recipe.hair, 1) : undefined;
  root.add(top ? [top, fringe, leftSide, rightSide] : [fringe, leftSide, rightSide]);
}

function drawHat(scene: Phaser.Scene, root: Phaser.GameObjects.Container, recipe: FaceRecipe): void {
  if (recipe.hatStyle === 'none') {
    return;
  }

  if (recipe.hatStyle === 'flatCap') {
    root.add([
      scene.add.rectangle(FACE_X, HEAD_TOP - 9, 58, 16, recipe.accent, 1),
      scene.add.rectangle(FACE_X, HEAD_TOP - 1, 60, 8, recipe.accent, 1),
      scene.add.rectangle(FACE_X + 12, HEAD_TOP - 1, 24, 6, recipe.accentLight, 0.9),
    ]);
    return;
  }

  if (recipe.hatStyle === 'scholar') {
    root.add([
      scene.add.triangle(FACE_X, HEAD_TOP - 14, -30, 16, 30, 16, 0, -16, recipe.accent, 1),
      scene.add.rectangle(FACE_X, HEAD_TOP - 1, 60, 9, recipe.accent, 1),
      scene.add.rectangle(FACE_X + 12, HEAD_TOP - 1, 24, 7, recipe.accentLight, 0.9),
    ]);
    return;
  }

  if (recipe.hatStyle === 'official') {
    root.add([
      scene.add.rectangle(FACE_X, HEAD_TOP - 6, 60, 14, recipe.accent, 1),
      scene.add.rectangle(FACE_X, HEAD_TOP - 19, 24, 16, recipe.accentLight, 1),
      scene.add.rectangle(FACE_X - 39, HEAD_TOP - 6, 18, 6, recipe.accent, 1),
      scene.add.rectangle(FACE_X + 39, HEAD_TOP - 6, 18, 6, recipe.accent, 1),
    ]);
    return;
  }

  const crown = scene.add.ellipse(FACE_X, HEAD_TOP - 10, 58, 28, recipe.accent, 1);
  const band = scene.add.rectangle(FACE_X, HEAD_TOP - 1, 60, 9, recipe.accent, 1);
  const bandLight = scene.add.rectangle(FACE_X + 12, HEAD_TOP - 1, 24, 7, recipe.accentLight, 0.9);
  root.add([crown, band, bandLight]);
}

function drawCollar(scene: Phaser.Scene, root: Phaser.GameObjects.Container, recipe: FaceRecipe): void {
  if (recipe.collarStyle === 'band') {
    root.add(scene.add.rectangle(FACE_X, NECK_Y + 13, 38, 7, recipe.accentLight, 0.92));
    return;
  }

  if (recipe.collarStyle === 'fold') {
    root.add([
      scene.add.triangle(FACE_X - 0, NECK_Y + 11, -10, -7, 7, -7, 5, 16, recipe.accentLight, 0.92),
      scene.add.triangle(FACE_X + 16, NECK_Y + 11, -7, -7, 10, -7, -5, 16, recipe.accentLight, 0.92),
    ]);
    return;
  }

  const spread = recipe.collarStyle === 'wideV' ? 16 : 10;
  const left = scene.add.line(0, 0, -spread, NECK_Y - 7, 0, NECK_Y + 24, recipe.accentLight, 0.92).setLineWidth(5);
  const right = scene.add.line(16, 0, spread , NECK_Y - 7, 0, NECK_Y + 24, recipe.accentLight, 0.92).setLineWidth(5);
  root.add([left, right]);
}

function drawFaceDetails(scene: Phaser.Scene, root: Phaser.GameObjects.Container, recipe: FaceRecipe): void {
  drawEyes(scene, root, recipe);
  drawNose(scene, root, recipe);
  drawMouth(scene, root, recipe);
  drawBeard(scene, root, recipe);
}

function drawEyes(scene: Phaser.Scene, root: Phaser.GameObjects.Container, recipe: FaceRecipe): void {
  if (recipe.eyeStyle === 'dots') {
    root.add(scene.add.circle(FACE_X - 13, FACE_Y - 6, 3.6, 0x111111, 1));
    root.add(scene.add.circle(FACE_X + 13, FACE_Y - 6, 3.6, 0x111111, 1));
    return;
  }

  if (recipe.eyeStyle === 'sleepy') {
    root.add(scene.add.rectangle(FACE_X - 13, FACE_Y - 6, 16, 3, 0x111111, 1));
    root.add(scene.add.rectangle(FACE_X + 13, FACE_Y - 6, 16, 3, 0x111111, 1));
    return;
  }

  const height = recipe.eyeStyle === 'shortBars' ? 20 : recipe.eyeStyle === 'wideBars' ? 32 : 29;
  const width = recipe.eyeStyle === 'wideBars' ? 6 : 5;
  root.add(scene.add.rectangle(FACE_X - 13, FACE_Y - 6, width, height, 0x111111, 1));
  root.add(scene.add.rectangle(FACE_X + 13, FACE_Y - 6, width, height, 0x111111, 1));
}

function drawNose(scene: Phaser.Scene, root: Phaser.GameObjects.Container, recipe: FaceRecipe): void {
  const color = shade(recipe.skinShadow, -10);

  if (recipe.noseStyle === 'flat') {
    root.add(scene.add.rectangle(FACE_X, FACE_Y + 11, 14, 3, color, 0.62));
    return;
  }

  if (recipe.noseStyle === 'wedge') {
    root.add(scene.add.triangle(FACE_X, FACE_Y + 10, -5, 12, 5, 12, 0, -8, color, 0.55));
    return;
  }

  const height = recipe.noseStyle === 'longLine' ? 24 : 18;
  root.add(scene.add.rectangle(FACE_X, FACE_Y + 8, 4, height, color, 0.6));
}

function drawMouth(scene: Phaser.Scene, root: Phaser.GameObjects.Container, recipe: FaceRecipe): void {
  if (recipe.mouthStyle === 'open') {
    root.add(scene.add.ellipse(FACE_X, CHIN_Y - 10, 12, 6, 0x5b2b1f, 0.82));
    return;
  }

  if (recipe.mouthStyle === 'smile') {
    root.add(scene.add.line(0, 0, FACE_X - 8, CHIN_Y - 11, FACE_X, CHIN_Y - 8, 0x5b2b1f, 0.82).setLineWidth(2));
    root.add(scene.add.line(0, 0, FACE_X, CHIN_Y - 8, FACE_X + 8, CHIN_Y - 11, 0x5b2b1f, 0.82).setLineWidth(2));
    return;
  }

  root.add(scene.add.rectangle(FACE_X, CHIN_Y - 10, recipe.mouthStyle === 'small' ? 10 : 15, 2, 0x5b2b1f, 0.82));
}

function drawBeard(scene: Phaser.Scene, root: Phaser.GameObjects.Container, recipe: FaceRecipe): void {
  if (recipe.beardStyle === 'none') {
    return;
  }

  if (recipe.beardStyle === 'moustache' || recipe.beardStyle === 'moustacheGoatee' || recipe.beardStyle === 'full') {
    const leftMoustache = scene.add.ellipse(FACE_X - 7, CHIN_Y - 15, 17, 7, recipe.beard, 0.95).setRotation(-0.18);
    const rightMoustache = scene.add.ellipse(FACE_X + 7, CHIN_Y - 15, 17, 7, recipe.beard, 0.95).setRotation(0.18);
    root.add([leftMoustache, rightMoustache]);
  }

  if (recipe.beardStyle === 'goatee' || recipe.beardStyle === 'moustacheGoatee') {
    root.add(scene.add.ellipse(FACE_X, CHIN_Y + 2, 21, 16, recipe.beard, 0.95));
  }

  if (recipe.beardStyle === 'full') {
    root.add(scene.add.ellipse(FACE_X, CHIN_Y - 1, 34, 30, recipe.beard, 0.72));
    root.add(scene.add.ellipse(FACE_X, CHIN_Y + 10, 24, 16, recipe.beard, 0.9));
  }
}

function pick<T>(items: T[], next: () => number): T {
  return items[Math.floor(next() * items.length) % items.length];
}

function headSize(style: HeadStyle): { width: number; height: number } {
  if (style === 'wideRound') return { width: FACE_WIDTH + 8, height: FACE_HEIGHT - 4 };
  if (style === 'tallRound') return { width: FACE_WIDTH - 4, height: FACE_HEIGHT + 8 };
  if (style === 'square') return { width: FACE_WIDTH - 2, height: FACE_HEIGHT - 4 };
  if (style === 'wideSquare') return { width: FACE_WIDTH + 8, height: FACE_HEIGHT - 6 };
  return { width: FACE_WIDTH, height: FACE_HEIGHT };
}

function visibleBeardColor(hair: number): number {
  const red = (hair >> 16) & 255;
  const green = (hair >> 8) & 255;
  const blue = hair & 255;
  const brightness = (red + green + blue) / 3;
  return brightness < 80 ? 0x5e665b : shade(hair, -28);
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed: number): () => number {
  let state = seed || 1;
  return () => {
    state = Math.imul(1664525, state) + 1013904223;
    return ((state >>> 0) % 10000) / 10000;
  };
}

function shade(color: number, amount: number): number {
  const r = clamp(((color >> 16) & 255) + amount);
  const g = clamp(((color >> 8) & 255) + amount);
  const b = clamp((color & 255) + amount);
  return (r << 16) + (g << 8) + b;
}

function clamp(value: number): number {
  return Math.min(255, Math.max(0, value));
}
