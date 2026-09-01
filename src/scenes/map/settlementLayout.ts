/** Pure settlement-footprint planning; kept free of Phaser so the scale/overlap contract is testable. */

export interface StructureFootprint {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface StructureRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface SatelliteSpec<T> {
  value: T;
  footprint: StructureFootprint;
}

export interface SatellitePlacement<T> extends SatelliteSpec<T> {
  x: number;
  y: number;
  rect: StructureRect;
}

export function footprintRect(
  x: number,
  y: number,
  footprint: StructureFootprint,
  padding = 0,
): StructureRect {
  return {
    left: x + footprint.left - padding,
    right: x + footprint.right + padding,
    top: y + footprint.top - padding,
    bottom: y + footprint.bottom + padding,
  };
}

export function rectsOverlap(a: StructureRect, b: StructureRect): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function centredX(rect: StructureRect, footprint: StructureFootprint): number {
  return (rect.left + rect.right - footprint.left - footprint.right) / 2;
}

function centredY(rect: StructureRect, footprint: StructureFootprint): number {
  return (rect.top + rect.bottom - footprint.top - footprint.bottom) / 2;
}

/**
 * Candidate anchors around a compound, in natural priority order: flanks, rear court, then front.
 * Each anchor is derived from real alpha dimensions, so a future wider PNG moves itself outward.
 */
function candidateAnchors(
  core: StructureRect,
  footprint: StructureFootprint,
  mirror: 1 | -1,
  ring: number,
): Array<{ x: number; y: number }> {
  const gap = 5 + ring * 5;
  const coreWidth = core.right - core.left;
  const coreHeight = core.bottom - core.top;
  const itemWidth = footprint.right - footprint.left;
  const itemHeight = footprint.bottom - footprint.top;
  const centreX = centredX(core, footprint);
  const centreY = centredY(core, footprint);
  const rearY = core.top - gap - footprint.bottom;
  const frontY = core.bottom + gap - footprint.top;
  const leftX = core.left - gap - footprint.right;
  const rightX = core.right + gap - footprint.left;
  const upperY = centreY - coreHeight * 0.23;
  const lowerY = centreY + coreHeight * 0.23;
  const rearSpread = Math.max(itemWidth * 0.64, coreWidth * 0.27);
  const frontSpread = Math.max(itemWidth * 0.72, coreWidth * 0.32);

  const leftFirst = mirror === 1
    ? [{ x: leftX, y: lowerY }, { x: rightX, y: lowerY }]
    : [{ x: rightX, y: lowerY }, { x: leftX, y: lowerY }];
  const sideRear = mirror === 1
    ? [{ x: rightX, y: upperY }, { x: leftX, y: upperY }]
    : [{ x: leftX, y: upperY }, { x: rightX, y: upperY }];

  return [
    ...leftFirst,
    { x: centreX - rearSpread * mirror, y: rearY },
    { x: centreX + rearSpread * mirror, y: rearY },
    ...sideRear,
    { x: centreX - frontSpread * mirror, y: frontY },
    { x: centreX + frontSpread * mirror, y: frontY },
    // A second flank row is preferable to stacking two structures on one visual footprint.
    { x: leftX - itemWidth * 0.35, y: centreY },
    { x: rightX + itemWidth * 0.35, y: centreY },
  ];
}

/**
 * Places every satellite without intersecting the settlement, its label, or an earlier satellite.
 * `isAllowed` keeps preferred anchors on valid land. If a tiny province has no such anchor, the
 * planner expands outward rather than accepting an overlap; visibility wins over accidental
 * stacking, and the caller can still connect the structure with a short lane.
 */
export function planSettlementSatellites<T>(
  core: StructureRect,
  labelKeepOut: StructureRect,
  items: ReadonlyArray<SatelliteSpec<T>>,
  mirror: 1 | -1,
  isAllowed: (x: number, y: number) => boolean = () => true,
): Array<SatellitePlacement<T>> {
  const occupied: StructureRect[] = [core, labelKeepOut];
  const placements: Array<SatellitePlacement<T>> = [];

  for (const item of items) {
    let chosen: SatellitePlacement<T> | undefined;
    // Search every valid-ground ring before considering an off-province fallback. The previous
    // loop relaxed the ground rule after ring zero, so it never discovered a valid ring-one slot.
    for (const requireAllowed of [true, false]) {
      for (let ring = 0; ring < 7 && !chosen; ring += 1) {
        const candidates = candidateAnchors(core, item.footprint, mirror, ring);
        for (const candidate of candidates) {
          if (requireAllowed && !isAllowed(candidate.x, candidate.y)) continue;
          const rect = footprintRect(candidate.x, candidate.y, item.footprint, 2.5);
          if (occupied.some((other) => rectsOverlap(rect, other))) continue;
          chosen = { ...item, ...candidate, rect };
          break;
        }
      }
      if (chosen) break;
    }

    // This should only be reachable if a future rule exceeds the current capacity. Keep extending
    // the flank deterministically so the new content is visible and the overlap invariant holds.
    if (!chosen) {
      const index = placements.length;
      const side = index % 2 === 0 ? -1 : 1;
      let step = 0;
      while (!chosen) {
        const x = (side < 0 ? core.left : core.right) + side * (30 + step * 18);
        const y = (core.top + core.bottom) / 2;
        const rect = footprintRect(x, y, item.footprint, 2.5);
        if (!occupied.some((other) => rectsOverlap(rect, other))) {
          chosen = { ...item, x, y, rect };
        }
        step += 1;
      }
    }

    placements.push(chosen);
    occupied.push(chosen.rect);
  }

  return placements;
}

export interface LanePoint {
  x: number;
  y: number;
}

/**
 * One pass of Chaikin's corner cutting on an open path, with both ends pinned.
 *
 * Every interior corner is replaced by the two points a quarter and three quarters along its
 * arms, which is what turns a run of straight segments into a curve without needing a spline or
 * a tangent. Open rather than closed: a lane has a mouth and a door, and both have to stay put.
 */
function roundOnce(path: ReadonlyArray<LanePoint>): LanePoint[] {
  if (path.length < 3) return [...path];
  const out: LanePoint[] = [path[0]];
  for (let index = 0; index < path.length - 1; index += 1) {
    const a = path[index];
    const b = path[index + 1];
    out.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 });
    out.push({ x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
  }
  out.push(path[path.length - 1]);
  return out;
}

/**
 * The lane from a settlement's frontage to one of the structures standing around it.
 *
 * **Two things make a village lane read as a lane rather than as plumbing.**
 *
 * It has to *bend*. This was a staircase of right angles — out of the gate, a step sideways, a
 * run down the flank, a step in — and a right angle is the one shape a footpath worn by people
 * never has. Measured on a real compound before this, the worst corner on a lane was 90° and the
 * mean was 68°; nothing about that reads as ground anybody walks.
 *
 * And the lanes must not all leave from the same brick. Every one of them started at the exact
 * centre of the frontage, so a settlement with four outbuildings drew four lanes radiating from
 * one point — the same starburst the province roads had at their gates. The mouth now slides
 * along the frontage toward whatever the lane is going to, so the lanes leave the compound the
 * way they arrive at it: spread along its front.
 *
 * The waypoints still route around the compound rather than through it — a lane that cut across
 * the authored courtyard read as translucent geometry left behind — and the rounding is applied
 * afterwards, so the route is unchanged and only its corners are gone.
 */
export function planSettlementLane(
  core: StructureRect,
  target: LanePoint,
  options: { frontY: number; spread?: number } = { frontY: 0 },
): LanePoint[] {
  const centreX = (core.left + core.right) / 2;
  const halfWidth = Math.max(1, (core.right - core.left) / 2);
  const gateY = options.frontY;
  // The mouth, slid along the frontage toward the target. Kept inside the compound's own front so
  // a lane never appears to leave from open ground beside it.
  const lean = Math.max(-1, Math.min(1, (target.x - centreX) / halfWidth));
  const gateX = centreX + lean * halfWidth * (options.spread ?? 0.45);
  const gate: LanePoint = { x: gateX, y: gateY };
  const end: LanePoint = { x: target.x, y: target.y + 2 };

  const route: LanePoint[] = [gate];
  if (end.y < gateY + 2) {
    // Behind or beside: swing out in front of the compound, up its flank, and in at the door.
    //
    // The waypoints are deliberately far apart. A route whose corners are five units from each
    // other cannot be rounded — corner cutting can only work with the room between the points it
    // is given — and the first version of this had exactly that, which is where the last of the
    // sharp turns lived. Each leg is now a real leg: out past the compound's shoulder, a long run
    // up the flank, then in.
    const side = end.x < centreX ? -1 : 1;
    const sideX = side < 0 ? core.left - 7 : core.right + 7;
    route.push({ x: gateX + side * halfWidth * 0.4, y: gateY + 9 });
    route.push({ x: sideX, y: gateY + (end.y - gateY) * 0.35 });
    route.push({ x: sideX, y: end.y + 6 });
  } else {
    // In front: one waypoint short of the door, so the lane leans out of the gate before it turns.
    route.push({ x: (gateX + end.x) / 2, y: gateY + (end.y - gateY) * 0.45 });
  }
  route.push(end);

  // Three passes, not two: two left the flank turn at fifty degrees, which still reads as a corner.
  return roundOnce(roundOnce(roundOnce(route)));
}
