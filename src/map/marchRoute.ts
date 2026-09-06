/**
 * A march, end to end, walked at one pace.
 *
 * A host does not stand on the road. It stands beside its seat, and the road begins at the gate
 * below the compound — so a leg is three things in a row: the step from where the host stands down
 * to the gate, the road itself, and the step off the far gate to where it will stand next. This
 * chains those into one curve that is walked **by distance**, so the pace a march is given is the
 * pace it keeps: a spline's own parameter runs fast on its long straights and slow round its bends,
 * and a column driven by it visibly hurried and dawdled along the same road.
 */
import Phaser from 'phaser';

export interface RoutePoint {
  x: number;
  y: number;
}

/** The part of a Phaser curve a route needs: its length, and a point by distance along it. */
interface ArcCurve {
  getLength(): number;
  getPointAt(u: number, out?: Phaser.Math.Vector2): Phaser.Math.Vector2;
  getStartPoint(out?: Phaser.Math.Vector2): Phaser.Math.Vector2;
}

export class MarchRoute {
  private readonly curves: ArcCurve[];
  private readonly lengths: number[];
  private readonly total: number;

  constructor(curves: Phaser.Curves.Curve[]) {
    const arcs = curves as unknown as ArcCurve[];
    // A zero-length step — the host already standing on the road's end — adds nothing but a
    // division to guard, so it is dropped; the route keeps at least one curve to answer from.
    const kept = arcs.filter((curve) => curve.getLength() > 0.01);
    this.curves = kept.length > 0 ? kept : arcs.slice(0, 1);
    this.lengths = this.curves.map((curve) => curve.getLength());
    this.total = this.lengths.reduce((sum, length) => sum + length, 0);
  }

  /** World units from one end to the other. */
  getLength(): number {
    return this.total;
  }

  /** The position `u` of the way along the route by distance, `u` in 0..1. */
  getPointAt(u: number): RoutePoint {
    const first = this.curves[0];
    if (!first) {
      return { x: 0, y: 0 };
    }
    if (this.total <= 0) {
      const start = first.getStartPoint();
      return { x: start.x, y: start.y };
    }
    let remaining = Math.max(0, Math.min(1, u)) * this.total;
    for (let index = 0; index < this.curves.length; index += 1) {
      const length = this.lengths[index];
      const last = index === this.curves.length - 1;
      if (remaining <= length || last) {
        const local = length > 0 ? Math.max(0, Math.min(1, remaining / length)) : 0;
        const point = this.curves[index].getPointAt(local);
        return { x: point.x, y: point.y };
      }
      remaining -= length;
    }
    const end = this.curves[this.curves.length - 1].getPointAt(1);
    return { x: end.x, y: end.y };
  }

  /**
   * The unit direction of travel at `u`, read as a short step either side of it.
   *
   * A finite difference rather than each curve's own tangent, so the reading is continuous across
   * the joins — the bend where the gate step meets the road is exactly where a column's heading is
   * read from, and two different tangents a hair apart there would have it face two ways.
   */
  getTangentAt(u: number): RoutePoint {
    const step = Math.max(0.005, Math.min(0.05, 6 / Math.max(1, this.total)));
    const before = this.getPointAt(u - step);
    const after = this.getPointAt(u + step);
    const dx = after.x - before.x;
    const dy = after.y - before.y;
    const length = Math.hypot(dx, dy);
    if (length < 1e-6) {
      return { x: 1, y: 0 };
    }
    return { x: dx / length, y: dy / length };
  }
}

/**
 * The same road, walked the other way.
 *
 * A uniform Catmull-Rom spline is symmetric under reversal — the tangent at every point is the
 * neighbours' difference, which merely changes sign — so a spline through the same points in the
 * opposite order is the identical line on the map, traversed backwards. Rebuilding a road with
 * its *endpoints* swapped is not the same thing: the meander is seeded on the sorted orientation
 * and swapping the ends bows it to the other side of the road.
 */
export function reversedSpline(spline: Phaser.Curves.Spline): Phaser.Curves.Spline {
  return new Phaser.Curves.Spline(spline.points.map((point) => point.clone()).reverse());
}
