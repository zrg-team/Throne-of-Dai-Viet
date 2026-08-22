/**
 * Polygon points, structurally.
 *
 * Phaser 4 deleted `Geom.Point` and retyped `Graphics.fillPoints`/`strokePoints` as
 * `Phaser.Math.Vector2[]`. The implementation did not change with the type: v4's `fillPoints` is
 *
 *     this.moveTo(points[0].x, points[0].y);
 *     for (var i = 1; i < endIndex; i++) { this.lineTo(points[i].x, points[i].y); }
 *
 * — it reads `.x` and `.y` and nothing else. Everything this game draws is a plain `{x, y}` struct
 * generated on the fly: hex corners, torn paper edges, ink strokes, roof facets, flag folds. The
 * map alone pushes thousands of these a frame through `fillPoints`.
 *
 * So this is a widening, not a workaround. Boxing every one of those structs into a real `Vector2`
 * would allocate heavily in the map's redraw path to satisfy a signature that never touches the
 * methods it is demanding. Declaration merging adds an overload that accepts what the methods
 * actually read; the `Vector2` overload from Phaser's own types is untouched and still preferred
 * when a real `Vector2` is passed.
 *
 * Alternative considered and rejected: a `poly()` cast helper wrapped around all 62 call sites.
 * Same runtime, sixty-two more places to get it wrong, and a cast at each one saying nothing about
 * why it is safe. This says it once.
 *
 * Delete this file if Phaser ever widens the signature upstream.
 */
declare namespace Phaser {
  namespace GameObjects {
    interface Graphics {
      fillPoints(
        points: ReadonlyArray<{ x: number; y: number }>,
        closeShape?: boolean,
        closePath?: boolean,
        endIndex?: number,
      ): this;
      strokePoints(
        points: ReadonlyArray<{ x: number; y: number }>,
        closeShape?: boolean,
        closePath?: boolean,
        endIndex?: number,
      ): this;
    }
  }
}
