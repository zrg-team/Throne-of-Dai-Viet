/**
 * Props that move.
 *
 * Everything in `props.ts` draws straight into a shared `Graphics` at an absolute position, which
 * is right for scenery and wrong for anything alive: a buffalo baked into the same buffer as the
 * houses around it can never take a step. These helpers give one prop its own object so it can.
 *
 * Also the home of the **facing convention**, because getting it wrong is invisible in a still
 * screenshot and glaring in motion. A glyph declares which way it was drawn; the mover multiplies
 * that by the direction of travel. A cart whose ox is drawn on the left, flipped as though the ox
 * were on the right, spends the whole map pushing its cart backwards.
 */
import Phaser from 'phaser';
import { BASE_SCALE_KEY, propImage, type BakedProp } from './sprites';

/** Anything that can be walked around: a `Graphics` prop or a baked `Image` one. */
export type Walkable = Phaser.GameObjects.GameObject & {
  x: number;
  y: number;
  setScale(x: number, y: number): unknown;
  getData(key: string): unknown;
  setData(key: string, value: unknown): unknown;
};

/**
 * Flips an object horizontally without losing the scale it was built at.
 *
 * A baked prop is rasterised large and scaled down; writing `setScale(-1, 1)` onto one of those
 * shows it four times the size and mirrored.
 */
function applyFacing(object: Walkable, scaleX: number): void {
  const base = (object.getData(BASE_SCALE_KEY) as number | undefined) ?? 1;
  object.setScale(scaleX * base, base);
}

/** `-1` for a glyph drawn facing left (−x), `+1` for one drawn facing right. */
export type NativeFacing = -1 | 1;

/** Data key a glyph uses to tell a mover which way it was drawn. Absent means facing +x. */
export const NATIVE_FACING_KEY = 'nativeFacing';

/** Data key carrying a grazing animal's home patch, for verification. */
export const GRAZING_KEY = 'grazing';

/** Marks a container with the direction its art faces, for `faceTravel`. */
export function setNativeFacing(object: Phaser.GameObjects.Container, facing: NativeFacing): void {
  object.setData(NATIVE_FACING_KEY, facing);
}

/**
 * Points a glyph the way it is travelling. `direction` is the sign of the step just taken.
 *
 * Returns the scaleX applied, so a caller tracking changes can skip redundant writes.
 */
export function faceTravel(object: Walkable, direction: -1 | 1): number {
  const native = (object.getData(NATIVE_FACING_KEY) as NativeFacing | undefined) ?? 1;
  const scaleX = direction * native;
  applyFacing(object, scaleX);
  return scaleX;
}

/**
 * Draws one prop into its own `Graphics` at the given position, with the prop's own coordinates
 * centred on the object's origin so the object can be moved, flipped and tweened.
 *
 * Prefer `livingSprite` for anything there are many of: a live `Graphics` re-submits its whole
 * command list every frame, and these props are hundreds of path segments each.
 */
export function livingProp(
  scene: Phaser.Scene,
  x: number,
  y: number,
  draw: (g: Phaser.GameObjects.Graphics) => void,
): Phaser.GameObjects.Graphics {
  const graphics = scene.add.graphics({ x, y });
  draw(graphics);
  return graphics;
}

/** One instance of a baked prop, ready to be walked around. See `ink/sprites.ts`. */
export function livingSprite(
  scene: Phaser.Scene,
  baked: BakedProp,
  x: number,
  y: number,
  scale = 1,
): Phaser.GameObjects.Image {
  return propImage(scene, baked, x, y, scale);
}

/**
 * Sends an animal wandering inside a small patch around its home: a few steps, a pause to crop the
 * grass, a few steps back. Bounded by `radius`, so a grazing beast never drifts off its own field
 * and never has to be cleaned up from somewhere unexpected.
 *
 * Vertical drift is squashed because the ground is seen from a low angle — wandering as far up and
 * down as sideways reads as sliding, not walking.
 */
export function grazeInSmallArea(
  scene: Phaser.Scene,
  animal: Walkable,
  homeX: number,
  homeY: number,
  radius: number,
  seed: number,
  nativeFacing: NativeFacing = 1,
): void {
  let step = Math.abs(Math.round(seed)) % 997;
  let facing = 0;
  // Findable from a driver script, so "the herd is not standing still" can be a check rather than
  // something somebody has to notice in a screenshot.
  animal.setData(GRAZING_KEY, { homeX, homeY, radius });

  const next = (): void => {
    if (!animal.active) return;
    step += 1;
    const angle = noise(step * 3.7 + seed) * Math.PI * 2;
    const distance = radius * (0.35 + noise(step * 7.1 + seed) * 0.65);
    const targetX = homeX + Math.cos(angle) * distance;
    const targetY = homeY + Math.sin(angle) * distance * 0.45;

    const heading = targetX - animal.x;
    if (Math.abs(heading) > 0.4) {
      const direction = heading < 0 ? -1 : 1;
      if (direction !== facing) {
        facing = direction;
        applyFacing(animal, direction * nativeFacing);
      }
    }

    scene.tweens.add({
      targets: animal,
      x: targetX,
      y: targetY,
      duration: 2600 + noise(step * 11.3 + seed) * 2800,
      ease: 'Sine.easeInOut',
      onComplete: () => {
        if (!animal.active) return;
        scene.time.delayedCall(900 + noise(step * 13.9 + seed) * 3000, next);
      },
    });
  };

  scene.time.delayedCall(300 + (Math.abs(Math.round(seed)) % 2400), next);
}

function noise(seed: number): number {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}
