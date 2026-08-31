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
