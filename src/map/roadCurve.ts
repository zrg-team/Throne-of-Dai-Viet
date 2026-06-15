/**
 * Shared road-curve geometry used by `TrafficRenderer` (cart/traveler glyphs) and
 * `ArmyRenderer` (marching armies), so both animate along the exact same path.
 */
import Phaser from 'phaser';
import { createRng } from './random';
import { hashString } from '../utils/math';
import type { GameState } from '../state/types';

type WorldTransform = (value: number) => number;

/**
 * A gently winding spline between two settlements: a couple of waypoints are nudged
 * sideways by a deterministic, seeded amount so the road meanders instead of running
 * dead straight.
 */
export function buildRoadCurve(
  state: GameState,
  from: { x: number; y: number },
  to: { x: number; y: number },
  seedKey: string,
  wx: WorldTransform,
  wy: WorldTransform,
): Phaser.Curves.Spline {
  const rng = createRng(state.mapConfig.seed + hashString(seedKey));
  const fromW = { x: wx(from.x), y: wy(from.y) };
  const toW = { x: wx(to.x), y: wy(to.y) };
  const dx = toW.x - fromW.x;
  const dy = toW.y - fromW.y;
  const length = Math.hypot(dx, dy) || 1;
  const normalX = -dy / length;
  const normalY = dx / length;

  const points: Phaser.Math.Vector2[] = [new Phaser.Math.Vector2(fromW.x, fromW.y)];
  const waypointCount = length > 90 ? 2 : 1;
  for (let index = 1; index <= waypointCount; index += 1) {
    const t = index / (waypointCount + 1);
    const jitter = (rng() - 0.5) * length * 0.22;
    points.push(
      new Phaser.Math.Vector2(fromW.x + dx * t + normalX * jitter, fromW.y + dy * t + normalY * jitter),
    );
  }
  points.push(new Phaser.Math.Vector2(toW.x, toW.y));

  return new Phaser.Curves.Spline(points);
}
