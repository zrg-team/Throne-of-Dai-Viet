export interface HexCoord {
  q: number;
  r: number;
}

export interface PixelPoint {
  x: number;
  y: number;
}

export const HEX_DIRECTIONS: HexCoord[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

export function hexKey(hex: HexCoord): string {
  return `${hex.q},${hex.r}`;
}

export function hexEquals(a: HexCoord, b: HexCoord): boolean {
  return a.q === b.q && a.r === b.r;
}

export function hexAdd(a: HexCoord, b: HexCoord): HexCoord {
  return { q: a.q + b.q, r: a.r + b.r };
}

export function hexNeighbors(hex: HexCoord): HexCoord[] {
  return HEX_DIRECTIONS.map((direction) => hexAdd(hex, direction));
}

/**
 * For pointy-top hexes, the edge between `hexCorners[i]` and `hexCorners[i+1]`
 * faces the neighbor at `EDGE_DIRECTIONS[i]`.
 */
export const EDGE_DIRECTIONS: HexCoord[] = [
  HEX_DIRECTIONS[0],
  HEX_DIRECTIONS[5],
  HEX_DIRECTIONS[4],
  HEX_DIRECTIONS[3],
  HEX_DIRECTIONS[2],
  HEX_DIRECTIONS[1],
];

// Pointy-top axial layout.
export function axialToPixel(hex: HexCoord, size: number): PixelPoint {
  return {
    x: size * Math.sqrt(3) * (hex.q + hex.r / 2),
    y: size * 1.5 * hex.r,
  };
}

export function pixelToAxial(x: number, y: number, size: number): HexCoord {
  const q = ((Math.sqrt(3) / 3) * x - y / 3) / size;
  const r = ((2 / 3) * y) / size;
  return roundHex(q, r);
}

function roundHex(q: number, r: number): HexCoord {
  const cx = q;
  const cz = r;
  const cy = -cx - cz;

  let rx = Math.round(cx);
  let ry = Math.round(cy);
  let rz = Math.round(cz);

  const dx = Math.abs(rx - cx);
  const dy = Math.abs(ry - cy);
  const dz = Math.abs(rz - cz);

  if (dx > dy && dx > dz) {
    rx = -ry - rz;
  } else if (dy > dz) {
    ry = -rx - rz;
  } else {
    rz = -rx - ry;
  }

  return { q: rx, r: rz };
}

// Pointy-top hex corners, relative angles offset by -30deg.
export function hexCorners(center: PixelPoint, size: number): number[][] {
  const corners: number[][] = [];
  for (let index = 0; index < 6; index += 1) {
    const angle = (Math.PI / 180) * (60 * index - 30);
    corners.push([center.x + size * Math.cos(angle), center.y + size * Math.sin(angle)]);
  }
  return corners;
}

/**
 * Hex outline with each corner chamfered into two points near the corner, softening
 * the silhouette. `inset` is the fraction of each adjacent edge cut off at the corner.
 * Drawn slightly oversized so chamfered tiles still tile without gaps.
 */
export function hexRoundedCorners(center: PixelPoint, size: number, inset = 0.16): number[][] {
  const corners = hexCorners(center, size * 1.03);
  const points: number[][] = [];
  for (let index = 0; index < 6; index += 1) {
    const current = corners[index];
    const previous = corners[(index + 5) % 6];
    const next = corners[(index + 1) % 6];
    points.push([
      current[0] + (previous[0] - current[0]) * inset,
      current[1] + (previous[1] - current[1]) * inset,
    ]);
    points.push([
      current[0] + (next[0] - current[0]) * inset,
      current[1] + (next[1] - current[1]) * inset,
    ]);
  }
  return points;
}

/**
 * Rectangular hex grid using row-offset coordinates converted to axial,
 * so the resulting layout is roughly a `cols x rows` rectangle in pixel space.
 */
export function generateRectGrid(cols: number, rows: number): HexCoord[] {
  const result: HexCoord[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      result.push({ q: col - Math.floor(row / 2), r: row });
    }
  }
  return result;
}
