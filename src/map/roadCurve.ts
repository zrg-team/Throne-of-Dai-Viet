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
  endpointRunway = 0,
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
  // **The step out of the gate has to be a step, not a full stop.**
  //
  // A Catmull-Rom's tangent at a point comes from its neighbours, so an 11-unit runway followed by
  // a waypoint 180 units away leaves the road turning a corner the moment it clears the wall. The
  // runway grows with the road it belongs to: on a short village link 11 units is most of the way
  // to the first waypoint anyway, and on a long haul it is a tenth of the road, which puts the
  // three points that decide the opening tangent within an order of magnitude of each other.
  const runway = endpointRunway > 0 ? Math.max(endpointRunway, length * 0.1) : 0;
  if (runway > 0) {
    points.push(gateExit(fromW, toW, runway));
  }
  /**
   * **One meander, not a shudder.**
   *
   * Each waypoint used to draw its own independent `(rng() - 0.5) * length * 0.22` — so the two of
   * them could be thrown 22% of the road's length to *opposite* sides, and a 550-unit road swerved
   * 120 units left and then 120 right inside its middle third. That is where the rest of the hard
   * corners were once the gate hairpin was gone.
   *
   * A road wanders for a reason — it follows ground — and ground turns slowly. So the offset is a
   * smooth function of position along the road rather than noise per point: a single seeded bow
   * over the whole length, plus a smaller second harmonic for variety. Both fall to zero at the
   * ends, which is also what stops the meander fighting the gate exit.
   */
  const bow = (rng() - 0.5) * length * 0.16;
  const kink = (rng() - 0.5) * length * 0.05;
  const offsetAt = (t: number): number => bow * Math.sin(Math.PI * t) + kink * Math.sin(2 * Math.PI * t);
  const waypointCount = length > 90 ? 3 : 1;
  for (let index = 1; index <= waypointCount; index += 1) {
    const t = index / (waypointCount + 1);
    const jitter = offsetAt(t);
    points.push(
      new Phaser.Math.Vector2(fromW.x + dx * t + normalX * jitter, fromW.y + dy * t + normalY * jitter),
    );
  }
  if (runway > 0) {
    points.push(gateExit(toW, fromW, runway));
  }
  points.push(new Phaser.Math.Vector2(toW.x, toW.y));

  return new Phaser.Curves.Spline(points);
}

/**
 * Where a road stands one step outside a settlement's gate.
 *
 * **This used to be `gate + (0, runway)` — dead south, whichever way the road was going.** A gate
 * faces south, so for a southbound road that is the direction of travel and costs nothing; for a
 * northbound one it is a **hairpin**. The spline ran gate → eleven units below the gate → back up
 * past the gate → onward, and a Catmull-Rom through a reversal is a spike. Measured over a whole
 * map (`_roadbend`): **98 roads out of 98 carried a bend of 130° on average and up to 179°, and
 * every single one of them sat within 6% of an end** — the elbow at the edge of a village that a
 * player sees and calls a hard corner. A road also turned 294° in total from one end to the other,
 * which is not a road; it is a road with two hairpins tied in it.
 *
 * `getRoadEntrance` already returns a point clear of the compound (the art's own bottom edge plus
 * seven), so the runway was never what kept the line off the buildings. What it is *for* is the
 * lean: a road leaves a gate heading a little downhill of the way it is going, which is what keeps
 * an east–west road below the yard rather than through it. So it now leans rather than turns —
 * the direction of travel with a southward bias — and a road that genuinely goes north simply
 * leaves the gate going north.
 */
function gateExit(
  gate: { x: number; y: number },
  toward: { x: number; y: number },
  runway: number,
): Phaser.Math.Vector2 {
  const dx = toward.x - gate.x;
  const dy = toward.y - gate.y;
  const length = Math.hypot(dx, dy) || 1;
  // 0.3 was chosen against the measurement, not by eye: it turns a due-east exit 17° south of its
  // road — enough to keep the line below the yard, gentle enough that the whole map's worst bend
  // is a bend and not a corner — and it leaves a due-north exit dead straight, which is the case
  // the old code broke. At 0.45 the same measurement read 34°.
  const outX = dx / length;
  const outY = dy / length + 0.3;
  const outLength = Math.hypot(outX, outY) || 1;
  return new Phaser.Math.Vector2(
    gate.x + (outX / outLength) * runway,
    gate.y + (outY / outLength) * runway,
  );
}
