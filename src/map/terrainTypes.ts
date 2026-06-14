import type Phaser from 'phaser';
import type { LandType } from '../state/types';
import type { PixelPoint } from './hex';

export type HexTerrainType =
  | 'plains'
  | 'fields'
  | 'riceFields'
  | 'forest'
  | 'mountains'
  | 'hills'
  | 'water'
  | 'fortress'
  | 'shrine';

export interface TerrainDef {
  color: number;
  /** Land types that prefer this terrain when filling a zone's interior hexes. */
  preferredFor: LandType[];
  /** Relative chance of being picked among matching preferredFor candidates. */
  weight: number;
  /** Optional decorative drawing for a single hex, drawn into the shared terrain Graphics. */
  decorate?: (graphics: Phaser.GameObjects.Graphics, center: PixelPoint, size: number, rng: () => number) => void;
  /**
   * Optional decorative drawing for a contiguous group of same-terrain hexes, drawn once per
   * group instead of once per hex so adjacent tiles read as one merged feature (e.g. a single
   * mountain range instead of repeated identical peaks). Takes priority over `decorate`.
   */
  decorateRegion?: (
    graphics: Phaser.GameObjects.Graphics,
    centers: PixelPoint[],
    size: number,
    rng: () => number,
  ) => void;
}

const ALL_LAND_TYPES: LandType[] = ['castle', 'farm', 'market', 'iron', 'temple', 'enemyCastle'];

function randomIndex(rng: () => number, length: number): number {
  return Math.floor(rng() * length);
}

function shuffle<T>(items: T[], rng: () => number): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = randomIndex(rng, index + 1);
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

export const TERRAIN_REGISTRY: Record<HexTerrainType, TerrainDef> = {
  plains: {
    color: 0x7cb863,
    preferredFor: ALL_LAND_TYPES,
    weight: 2,
    decorate: (graphics, center, size, rng) => {
      graphics.fillStyle(0x6aa854, 0.5);
      for (let index = 0; index < 6; index += 1) {
        const px = center.x + (rng() - 0.5) * size * 1.1;
        const py = center.y + (rng() - 0.5) * size * 1.1;
        graphics.fillTriangle(px - 1.5, py + 2.5, px + 1.5, py + 2.5, px, py - 2.5);
      }
    },
  },
  fields: {
    color: 0xd2c45a,
    preferredFor: ['farm'],
    weight: 3,
    decorate: (graphics, center, size, rng) => {
      graphics.fillStyle(0xeede9d, 0.4);
      for (let row = -1; row <= 1; row += 1) {
        const y = center.y + row * size * 0.32;
        graphics.fillRect(center.x - size * 0.6, y - size * 0.05, size * 1.2, size * 0.1);
      }
      void rng;
    },
  },
  riceFields: {
    color: 0x9bcf6f,
    preferredFor: ['farm'],
    weight: 2,
    decorate: (graphics, center, size, rng) => {
      graphics.lineStyle(1, 0x4daeb7, 0.4);
      for (let row = -1; row <= 1; row += 1) {
        const y = center.y + row * size * 0.32;
        graphics.lineBetween(center.x - size * 0.6, y, center.x + size * 0.6, y);
      }
      void rng;
    },
  },
  forest: {
    color: 0x4f7d3f,
    preferredFor: ['farm'],
    weight: 1,
    decorateRegion: (graphics, centers, size, rng) => {
      // Scatter tree clumps across the whole merged patch so it reads as one forest, not
      // a grid of identical hexes each with their own trees.
      const treeCount = Math.round(centers.length * 2.5);
      for (let index = 0; index < treeCount; index += 1) {
        const anchor = centers[randomIndex(rng, centers.length)];
        const px = anchor.x + (rng() - 0.5) * size * 1.4;
        const py = anchor.y + (rng() - 0.5) * size * 1.4;
        const scale = 0.7 + rng() * 0.6;
        graphics.fillStyle(0x355c2b, 0.6);
        graphics.fillTriangle(
          px,
          py + size * 0.22 * scale,
          px - size * 0.18 * scale,
          py + size * 0.4 * scale,
          px + size * 0.18 * scale,
          py + size * 0.4 * scale,
        );
        graphics.fillTriangle(
          px,
          py - size * 0.05 * scale,
          px - size * 0.2 * scale,
          py + size * 0.25 * scale,
          px + size * 0.2 * scale,
          py + size * 0.25 * scale,
        );
      }
    },
  },
  mountains: {
    color: 0x8d8a86,
    preferredFor: ['iron'],
    weight: 2,
    decorateRegion: (graphics, centers, size, rng) => {
      // A handful of large overlapping peaks across the merged patch reads as one
      // mountain range, not per-hex icons.
      const peakCount = Math.max(1, Math.round(centers.length / 2));
      const peaks = shuffle(centers, rng).slice(0, peakCount);

      for (const peak of peaks) {
        const scale = 2.1 + rng() * 1.4;
        const px = peak.x + (rng() - 0.5) * size * 0.7;
        const py = peak.y + (rng() - 0.5) * size * 0.4;
        const height = size * 0.45 * scale;

        graphics.fillStyle(0x65605a, 0.7);
        graphics.fillTriangle(
          px - size * 0.45 * scale,
          py + size * 0.35,
          px + size * 0.45 * scale,
          py + size * 0.35,
          px,
          py - height,
        );

        if (scale > 2.6) {
          graphics.fillStyle(0xf6efd8, 0.65);
          graphics.fillTriangle(px - size * 0.16, py - height + size * 0.35, px + size * 0.16, py - height + size * 0.35, px, py - height);
        }
      }
    },
  },
  hills: {
    color: 0xa9a36f,
    preferredFor: ['iron'],
    weight: 2,
    decorateRegion: (graphics, centers, size, rng) => {
      // Overlapping ellipses across the merged patch form one continuous rolling ridge.
      const ridgeCount = Math.max(1, Math.round(centers.length * 0.7));
      const ridges = shuffle(centers, rng).slice(0, ridgeCount);

      for (const ridge of ridges) {
        const scale = 1.1 + rng() * 0.6;
        const px = ridge.x + (rng() - 0.5) * size * 0.7;
        const py = ridge.y + size * 0.2 + (rng() - 0.5) * size * 0.3;
        graphics.fillStyle(0x8b7056, 0.3);
        graphics.fillEllipse(px, py, size * 0.9 * scale, size * 0.5 * scale);
      }
    },
  },
  water: {
    color: 0x5bb6d6,
    preferredFor: [],
    weight: 0,
    decorate: (graphics, center, size, rng) => {
      graphics.lineStyle(1.5, 0xf4fbfd, 0.4);
      graphics.lineBetween(center.x - size * 0.5, center.y, center.x + size * 0.5, center.y);
      void rng;
    },
  },
  fortress: {
    color: 0xada497,
    preferredFor: [],
    weight: 0,
    // Building clusters are drawn separately (createSettlementCluster); keep this hex a
    // plain merged city platform so the ground reads as one paved area, not per-hex icons.
  },
  shrine: {
    color: 0xc7e0c1,
    preferredFor: [],
    weight: 0,
  },
};
