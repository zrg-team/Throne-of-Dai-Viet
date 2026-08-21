/**
 * A QR Code encoder small enough to read in one sitting: byte mode, versions 1–10, error
 * correction L or M. That covers a payment link several times over, which is all it is here for.
 *
 * Why the game encodes its own: the coffee modal has to work for a player on a laptop, whose only
 * way to pay is to scan something with their phone. Wise and MoMo both hand out a *link*; drawing
 * the code from the link means the game needs no image file to be useful, and the official image
 * (MoMo's VietQR, which bank apps can read directly) can still take over when one is provided.
 *
 * Follows ISO/IEC 18004: data → codewords with Reed–Solomon parity → interleaved → placed in the
 * zigzag → masked by the pattern with the lowest penalty → format (and, from version 7, version)
 * information written last. Verified by decoding the rendered result with an independent decoder
 * in `test_scripts/shot/shot-support.mjs`, across every version this file can produce.
 */

export type QrEcc = 'L' | 'M';

export interface QrMatrix {
  /** Modules per side; `version * 4 + 17`. */
  size: number;
  version: number;
  ecc: QrEcc;
  /** `modules[y][x]`, `true` for a dark module. No quiet zone — the renderer adds it. */
  modules: boolean[][];
}

const MAX_VERSION = 10;

/** Error-correction codewords per block, indexed by version (index 0 unused). */
const ECC_CODEWORDS_PER_BLOCK: Record<QrEcc, number[]> = {
  L: [0, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18],
  M: [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26],
};

/** Number of error-correction blocks, indexed by version (index 0 unused). */
const NUM_ECC_BLOCKS: Record<QrEcc, number[]> = {
  L: [0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4],
  M: [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5],
};

/** The two-bit level indicator that goes into the format information. */
const ECC_FORMAT_BITS: Record<QrEcc, number> = { L: 1, M: 0 };

/**
 * Encodes `text` (as UTF-8 bytes) at the smallest version that holds it, or returns `null` when
 * even version 10 cannot — which for a URL means something is badly wrong upstream.
 */
export function encodeQr(text: string, ecc: QrEcc = 'M'): QrMatrix | null {
  const bytes = new TextEncoder().encode(text);
  const version = pickVersion(bytes.length, ecc);
  if (version === null) {
    return null;
  }
  const codewords = encodeCodewords(bytes, version, ecc);
  return buildMatrix(codewords, version, ecc);
}

// ── capacity ─────────────────────────────────────────────────────────────────────────────────

/** Byte-mode character-count field width. */
function charCountBits(version: number): number {
  return version <= 9 ? 8 : 16;
}

/** Data modules available once every function pattern has taken its place. */
function rawDataModules(version: number): number {
  let result = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const numAlign = Math.floor(version / 7) + 2;
    result -= (25 * numAlign - 10) * numAlign - 55;
    if (version >= 7) {
      result -= 36;
    }
  }
  return result;
}

function dataCapacityBytes(version: number, ecc: QrEcc): number {
  return Math.floor(rawDataModules(version) / 8) - ECC_CODEWORDS_PER_BLOCK[ecc][version] * NUM_ECC_BLOCKS[ecc][version];
}

function pickVersion(byteLength: number, ecc: QrEcc): number | null {
  for (let version = 1; version <= MAX_VERSION; version += 1) {
    const needed = 4 + charCountBits(version) + byteLength * 8;
    if (needed <= dataCapacityBytes(version, ecc) * 8) {
      return version;
    }
  }
  return null;
}

// ── codewords ────────────────────────────────────────────────────────────────────────────────

/** Mode + count + data + terminator + padding, then parity, then interleaved for placement. */
function encodeCodewords(bytes: Uint8Array, version: number, ecc: QrEcc): number[] {
  const bits: number[] = [];
  const append = (value: number, length: number) => {
    for (let i = length - 1; i >= 0; i -= 1) {
      bits.push((value >>> i) & 1);
    }
  };

  append(0b0100, 4); // byte mode
  append(bytes.length, charCountBits(version));
  for (const b of bytes) {
    append(b, 8);
  }

  const capacityBits = dataCapacityBytes(version, ecc) * 8;
  append(0, Math.min(4, capacityBits - bits.length)); // terminator
  append(0, (8 - (bits.length % 8)) % 8);              // to a byte boundary
  for (let pad = 0xec; bits.length < capacityBits; pad ^= 0xec ^ 0x11) {
    append(pad, 8);                                    // the alternating pad bytes the spec asks for
  }

  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j += 1) {
      byte = (byte << 1) | bits[i + j];
    }
    data.push(byte);
  }
  return addParityAndInterleave(data, version, ecc);
}

function addParityAndInterleave(data: number[], version: number, ecc: QrEcc): number[] {
  const numBlocks = NUM_ECC_BLOCKS[ecc][version];
  const blockEccLen = ECC_CODEWORDS_PER_BLOCK[ecc][version];
  const rawCodewords = Math.floor(rawDataModules(version) / 8);
  const numShortBlocks = numBlocks - (rawCodewords % numBlocks);
  const shortBlockLen = Math.floor(rawCodewords / numBlocks);
  const divisor = rsDivisor(blockEccLen);

  const blocks: number[][] = [];
  let k = 0;
  for (let i = 0; i < numBlocks; i += 1) {
    const dataLen = shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1);
    const block = data.slice(k, k + dataLen);
    k += dataLen;
    const parity = rsRemainder(block, divisor);
    if (i < numShortBlocks) {
      block.push(0); // placeholder so every block has the same column count
    }
    blocks.push(block.concat(parity));
  }

  const result: number[] = [];
  for (let i = 0; i < blocks[0].length; i += 1) {
    for (let j = 0; j < blocks.length; j += 1) {
      // The placeholder column of a short block is skipped, not emitted.
      if (i !== shortBlockLen - blockEccLen || j >= numShortBlocks) {
        result.push(blocks[j][i]);
      }
    }
  }
  return result;
}

// ── Reed–Solomon over GF(2^8) with the QR polynomial 0x11D ───────────────────────────────────

function gfMultiply(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i -= 1) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z;
}

/** The generator polynomial's coefficients, highest degree first, leading 1 omitted. */
function rsDivisor(degree: number): number[] {
  const result = new Array<number>(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i += 1) {
    for (let j = 0; j < result.length; j += 1) {
      result[j] = gfMultiply(result[j], root);
      if (j + 1 < result.length) {
        result[j] ^= result[j + 1];
      }
    }
    root = gfMultiply(root, 0x02);
  }
  return result;
}

function rsRemainder(data: number[], divisor: number[]): number[] {
  const result = new Array<number>(divisor.length).fill(0);
  for (const b of data) {
    const factor = b ^ (result.shift() as number);
    result.push(0);
    divisor.forEach((coef, i) => { result[i] ^= gfMultiply(coef, factor); });
  }
  return result;
}

// ── the matrix ───────────────────────────────────────────────────────────────────────────────

class Matrix {
  readonly size: number;
  readonly modules: boolean[][];
  private readonly isFunction: boolean[][];

  constructor(readonly version: number, readonly ecc: QrEcc) {
    this.size = version * 4 + 17;
    this.modules = Array.from({ length: this.size }, () => new Array<boolean>(this.size).fill(false));
    this.isFunction = Array.from({ length: this.size }, () => new Array<boolean>(this.size).fill(false));
  }

  private setFunction(x: number, y: number, dark: boolean): void {
    this.modules[y][x] = dark;
    this.isFunction[y][x] = true;
  }

  drawFunctionPatterns(): void {
    for (let i = 0; i < this.size; i += 1) {
      this.setFunction(6, i, i % 2 === 0);
      this.setFunction(i, 6, i % 2 === 0);
    }
    this.drawFinder(3, 3);
    this.drawFinder(this.size - 4, 3);
    this.drawFinder(3, this.size - 4);

    const positions = this.alignmentPositions();
    const n = positions.length;
    for (let i = 0; i < n; i += 1) {
      for (let j = 0; j < n; j += 1) {
        // The three corners under the finders carry no alignment pattern.
        if (!((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0))) {
          this.drawAlignment(positions[i], positions[j]);
        }
      }
    }
    this.drawFormatBits(0); // reserves the modules; rewritten once the mask is chosen
    this.drawVersion();
  }

  private drawFinder(x: number, y: number): void {
    for (let dy = -4; dy <= 4; dy += 1) {
      for (let dx = -4; dx <= 4; dx += 1) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        const xx = x + dx;
        const yy = y + dy;
        if (xx >= 0 && xx < this.size && yy >= 0 && yy < this.size) {
          this.setFunction(xx, yy, dist !== 2 && dist !== 4);
        }
      }
    }
  }

  private drawAlignment(x: number, y: number): void {
    for (let dy = -2; dy <= 2; dy += 1) {
      for (let dx = -2; dx <= 2; dx += 1) {
        this.setFunction(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    }
  }

  private alignmentPositions(): number[] {
    if (this.version === 1) {
      return [];
    }
    const numAlign = Math.floor(this.version / 7) + 2;
    const step = this.version === 32 ? 26 : Math.ceil((this.version * 4 + 4) / (numAlign * 2 - 2)) * 2;
    const result = [6];
    for (let pos = this.size - 7; result.length < numAlign; pos -= step) {
      result.splice(1, 0, pos);
    }
    return result;
  }

  drawFormatBits(mask: number): void {
    const data = (ECC_FORMAT_BITS[this.ecc] << 3) | mask;
    let rem = data;
    for (let i = 0; i < 10; i += 1) {
      rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    }
    const bits = ((data << 10) | rem) ^ 0x5412;
    const bit = (i: number) => ((bits >>> i) & 1) !== 0;

    // Beside the top-left finder.
    for (let i = 0; i <= 5; i += 1) this.setFunction(8, i, bit(i));
    this.setFunction(8, 7, bit(6));
    this.setFunction(8, 8, bit(7));
    this.setFunction(7, 8, bit(8));
    for (let i = 9; i < 15; i += 1) this.setFunction(14 - i, 8, bit(i));

    // Split between the other two finders.
    for (let i = 0; i < 8; i += 1) this.setFunction(this.size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i += 1) this.setFunction(8, this.size - 15 + i, bit(i));
    this.setFunction(8, this.size - 8, true); // the always-dark module
  }

  private drawVersion(): void {
    if (this.version < 7) {
      return;
    }
    let rem = this.version;
    for (let i = 0; i < 12; i += 1) {
      rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    }
    const bits = (this.version << 12) | rem;
    for (let i = 0; i < 18; i += 1) {
      const dark = ((bits >>> i) & 1) !== 0;
      const a = this.size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      this.setFunction(a, b, dark);
      this.setFunction(b, a, dark);
    }
  }

  /** Zigzags the codewords upward and downward through pairs of columns, right to left. */
  drawCodewords(data: number[]): void {
    let i = 0;
    for (let right = this.size - 1; right >= 1; right -= 2) {
      if (right === 6) {
        right = 5; // step over the vertical timing pattern
      }
      for (let vert = 0; vert < this.size; vert += 1) {
        for (let j = 0; j < 2; j += 1) {
          const x = right - j;
          const upward = ((right + 1) & 2) === 0;
          const y = upward ? this.size - 1 - vert : vert;
          if (!this.isFunction[y][x] && i < data.length * 8) {
            this.modules[y][x] = ((data[i >>> 3] >>> (7 - (i & 7))) & 1) !== 0;
            i += 1;
          }
        }
      }
    }
  }

  applyMask(mask: number): void {
    for (let y = 0; y < this.size; y += 1) {
      for (let x = 0; x < this.size; x += 1) {
        if (!this.isFunction[y][x] && maskBit(mask, x, y)) {
          this.modules[y][x] = !this.modules[y][x];
        }
      }
    }
  }

  /** The four penalty rules of the spec; lower is easier for a reader. */
  penalty(): number {
    const N1 = 3;
    const N2 = 3;
    const N3 = 40;
    const N4 = 10;
    const size = this.size;
    let result = 0;

    const countFinderLike = (history: number[]): number => {
      const n = history[1];
      const core = n > 0 && history[2] === n && history[3] === n * 3 && history[4] === n && history[5] === n;
      return (core && history[0] >= n * 4 && history[6] >= n ? 1 : 0)
        + (core && history[6] >= n * 4 && history[0] >= n ? 1 : 0);
    };
    const pushRun = (run: number, history: number[]) => {
      if (history[0] === 0) {
        run += size; // the quiet zone counts as light run at the edge
      }
      history.pop();
      history.unshift(run);
    };
    const finishLine = (runColor: boolean, run: number, history: number[]): number => {
      if (runColor) {
        pushRun(run, history);
        run = 0;
      }
      pushRun(run + size, history);
      return countFinderLike(history);
    };

    // Rule 1 and rule 3, along rows and then columns.
    for (let pass = 0; pass < 2; pass += 1) {
      for (let a = 0; a < size; a += 1) {
        let runColor = false;
        let run = 0;
        const history = [0, 0, 0, 0, 0, 0, 0];
        for (let b = 0; b < size; b += 1) {
          const dark = pass === 0 ? this.modules[a][b] : this.modules[b][a];
          if (dark === runColor) {
            run += 1;
            if (run === 5) result += N1;
            else if (run > 5) result += 1;
          } else {
            pushRun(run, history);
            if (!runColor) result += countFinderLike(history) * N3;
            runColor = dark;
            run = 1;
          }
        }
        result += finishLine(runColor, run, history) * N3;
      }
    }

    // Rule 2: same-coloured 2×2 blocks.
    for (let y = 0; y < size - 1; y += 1) {
      for (let x = 0; x < size - 1; x += 1) {
        const c = this.modules[y][x];
        if (c === this.modules[y][x + 1] && c === this.modules[y + 1][x] && c === this.modules[y + 1][x + 1]) {
          result += N2;
        }
      }
    }

    // Rule 4: dark/light balance.
    let dark = 0;
    for (const row of this.modules) for (const m of row) if (m) dark += 1;
    const total = size * size;
    const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
    result += k * N4;
    return result;
  }
}

function maskBit(mask: number, x: number, y: number): boolean {
  switch (mask) {
    case 0: return (x + y) % 2 === 0;
    case 1: return y % 2 === 0;
    case 2: return x % 3 === 0;
    case 3: return (x + y) % 3 === 0;
    case 4: return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
    case 5: return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6: return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    default: return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
  }
}

function buildMatrix(codewords: number[], version: number, ecc: QrEcc): QrMatrix {
  const matrix = new Matrix(version, ecc);
  matrix.drawFunctionPatterns();
  matrix.drawCodewords(codewords);

  let best = 0;
  let bestPenalty = Infinity;
  for (let mask = 0; mask < 8; mask += 1) {
    matrix.applyMask(mask);
    matrix.drawFormatBits(mask);
    const penalty = matrix.penalty();
    if (penalty < bestPenalty) {
      bestPenalty = penalty;
      best = mask;
    }
    matrix.applyMask(mask); // XOR is its own inverse
  }
  matrix.applyMask(best);
  matrix.drawFormatBits(best);

  return { size: matrix.size, version, ecc, modules: matrix.modules };
}
