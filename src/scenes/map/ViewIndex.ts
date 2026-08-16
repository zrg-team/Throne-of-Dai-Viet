/**
 * Which of the map's live objects the camera can actually see.
 *
 * The map is 2244x3030 design units and the camera shows between 1.8% and 9.3% of it — 236x512 at
 * full zoom, 542x1172 zoomed out. Everything outside that was still being submitted every frame:
 * settlement nodes with their name plates, army markers, the ox-carts and travellers on every road
 * in the country, the fog clouds. Phaser culls sprites against the camera but not `Container`s or
 * `Graphics`, which is what almost every live object on this map is.
 *
 * A uniform grid, not a quadtree. A quadtree earns its rebalancing on unbounded extent and clustered
 * density; this world is a fixed rectangle carrying a hex grid, so density is near-uniform and the
 * objects are point-like. A grid gives O(1) insert, O(1) move, and a view query that touches 6-18
 * cells out of 108 — with no tree to rebuild when a cart moves.
 *
 * Culling is not only about the draw. A traffic mover runs an `onUpdate` every frame evaluating a
 * spline; a fog cloud runs an infinite yoyo. `setVisible(false)` stops neither, so an entry may
 * carry a tween to pause with it — that is usually the larger half of the saving.
 */
import type Phaser from 'phaser';

/** What an object is, so a quality tier can drop a whole class of them when zoomed out. */
export type CullKind = 'node' | 'label' | 'flag' | 'army' | 'traffic' | 'cloud';

export interface CullEntry {
  /** What kind of thing this is, for the zoom LOD. */
  kind: CullKind;
  /** World position the object is anchored at. */
  x: number;
  y: number;
  /**
   * How far from that anchor the object actually paints. A settlement node reaches well below and
   * to the side of its land centre, and popping in at the screen edge is worse than drawing a few
   * extra objects — so this is deliberately generous.
   */
  radius: number;
  /** Called only when the object crosses in or out of view, never per frame. */
  setCulled(culled: boolean): void;
}

const DEFAULT_CELL_SIZE = 256;

export class ViewIndex {
  private readonly cellSize: number;
  private readonly entries = new Map<string, CullEntry>();
  private readonly cells = new Map<string, Set<string>>();
  /** Which cell each id currently sits in, so a move can leave the old one. */
  private readonly placement = new Map<string, string>();
  private culled = new Set<string>();
  /** Kinds the current quality tier has dropped at this zoom. Treated exactly as out-of-view. */
  private suppressed = new Set<CullKind>();

  constructor(cellSize: number = DEFAULT_CELL_SIZE) {
    this.cellSize = cellSize;
  }

  /**
   * Sets which kinds are dropped regardless of where the camera is.
   *
   * Deliberately routed through the same `culled` bookkeeping as the view test rather than kept as a
   * second switch on each object: two independent reasons to hide one thing, each unaware of the
   * other, is how a cart ends up visible because the zoom changed while it was off-screen.
   */
  setSuppressed(kinds: Iterable<CullKind>): boolean {
    const next = new Set(kinds);
    if (next.size === this.suppressed.size && [...next].every((kind) => this.suppressed.has(kind))) {
      return false;
    }
    this.suppressed = next;
    return true;
  }

  private cellKey(x: number, y: number): string {
    return `${Math.floor(x / this.cellSize)},${Math.floor(y / this.cellSize)}`;
  }

  /** Registers an object, or moves one already registered. */
  set(id: string, entry: CullEntry): void {
    const key = this.cellKey(entry.x, entry.y);
    const previous = this.placement.get(id);
    if (previous !== undefined && previous !== key) {
      this.cells.get(previous)?.delete(id);
    }
    this.entries.set(id, entry);
    this.placement.set(id, key);
    let bucket = this.cells.get(key);
    if (!bucket) {
      bucket = new Set<string>();
      this.cells.set(key, bucket);
    }
    bucket.add(id);

    // A settlement node or army marker is destroyed and rebuilt when its content changes, and the
    // replacement arrives visible. If its id was culled, it has to inherit that immediately —
    // otherwise a rebuild off-screen quietly un-culls itself and never gets culled again, because
    // `apply` only speaks to entries that change side.
    if (this.culled.has(id)) {
      entry.setCulled(true);
    }
  }

  remove(id: string): void {
    const key = this.placement.get(id);
    if (key !== undefined) {
      this.cells.get(key)?.delete(id);
    }
    this.placement.delete(id);
    this.entries.delete(id);
    this.culled.delete(id);
  }

  has(id: string): boolean {
    return this.entries.has(id);
  }

  clear(): void {
    this.entries.clear();
    this.cells.clear();
    this.placement.clear();
    this.culled.clear();
  }

  get size(): number {
    return this.entries.size;
  }

  /** How many registered objects are currently culled. Read by the culling verifier. */
  get culledCount(): number {
    return this.culled.size;
  }

  /**
   * Shows what the view rectangle reaches and hides the rest.
   *
   * Only the entries that *changed* side are told, so a still camera does no work beyond the cell
   * sweep, and a slow pan touches a handful of objects per frame.
   */
  apply(view: Phaser.Geom.Rectangle, margin = 0): void {
    const left = view.x - margin;
    const top = view.y - margin;
    const right = view.right + margin;
    const bottom = view.bottom + margin;

    const visible = new Set<string>();
    const minCol = Math.floor(left / this.cellSize);
    const maxCol = Math.floor(right / this.cellSize);
    const minRow = Math.floor(top / this.cellSize);
    const maxRow = Math.floor(bottom / this.cellSize);

    for (let col = minCol; col <= maxCol; col += 1) {
      for (let row = minRow; row <= maxRow; row += 1) {
        const bucket = this.cells.get(`${col},${row}`);
        if (!bucket) {
          continue;
        }
        for (const id of bucket) {
          const entry = this.entries.get(id);
          if (!entry) {
            continue;
          }
          // The cell sweep is a coarse pass — an object near a cell edge can sit in a cell the view
          // touches while itself lying outside it, so each candidate is checked against its own reach.
          if (
            entry.x + entry.radius < left
            || entry.x - entry.radius > right
            || entry.y + entry.radius < top
            || entry.y - entry.radius > bottom
          ) {
            continue;
          }
          visible.add(id);
        }
      }
    }

    for (const [id, entry] of this.entries) {
      const shouldCull = !visible.has(id) || this.suppressed.has(entry.kind);
      if (shouldCull === this.culled.has(id)) {
        continue;
      }
      if (shouldCull) {
        this.culled.add(id);
      } else {
        this.culled.delete(id);
      }
      entry.setCulled(shouldCull);
    }
  }

  /** Reveals everything and forgets the culled set, for teardown and for the `?nocull=1` escape. */
  showAll(): void {
    for (const [id, entry] of this.entries) {
      if (this.culled.has(id)) {
        entry.setCulled(false);
      }
    }
    this.culled = new Set<string>();
  }

  /** Drops every entry whose id is not in `keep`, revealing it first so nothing dies hidden. */
  retainOnly(keep: Set<string>): void {
    for (const id of [...this.entries.keys()]) {
      if (keep.has(id)) {
        continue;
      }
      if (this.culled.has(id)) {
        this.entries.get(id)?.setCulled(false);
      }
      this.remove(id);
    }
  }
}
