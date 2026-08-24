/**
 * Shelf next-fit packing for the stamp atlas pages.
 *
 * Rectangles arrive one at a time and never move again, which is exactly the case shelf packing
 * is good enough for: rows ("shelves") stack top to bottom, each new rectangle goes at the end of
 * the current shelf if it fits, else opens a new shelf. Heights are bucketed to 8 px so a run of
 * near-equal stamps (chips, seals, meter frames) shares a shelf instead of opening one each.
 */
export interface ShelfRect { x: number; y: number; width: number; height: number }

export class ShelfPacker {
  private shelves: Array<{ y: number; height: number; used: number }> = [];
  private nextY = 0;
  private usedArea = 0;

  constructor(private readonly width: number, private readonly height: number) {}

  /** Where a `w × h` rectangle goes, or undefined when the page is full. */
  allocate(w: number, h: number): ShelfRect | undefined {
    if (w > this.width || h > this.height) {
      return undefined;
    }
    const wantH = Math.min(this.height, Math.ceil(h / 8) * 8);
    for (const shelf of this.shelves) {
      if (h <= shelf.height && shelf.used + w <= this.width) {
        const rect = { x: shelf.used, y: shelf.y, width: w, height: h };
        shelf.used += w;
        this.usedArea += w * h;
        return rect;
      }
    }
    if (this.nextY + wantH > this.height) {
      return undefined;
    }
    const shelf = { y: this.nextY, height: wantH, used: w };
    this.nextY += wantH;
    this.shelves.push(shelf);
    this.usedArea += w * h;
    return { x: 0, y: shelf.y, width: w, height: h };
  }

  reset(): void {
    this.shelves = [];
    this.nextY = 0;
    this.usedArea = 0;
  }

  /** Fraction of the page actually covered by stamps — the eviction pass reads this. */
  get occupancy(): number {
    return this.usedArea / (this.width * this.height);
  }
}
