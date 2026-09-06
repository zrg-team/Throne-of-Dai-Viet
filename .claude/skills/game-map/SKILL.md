---
name: game-map
description: The hex/tile map system of Vạn Thắng — pointy-top axial coordinates and the exact conversion helpers, the nine terrain types and where their data actually lives, the map generator's flood-fill pipeline, how lands relate to hexes, boundary tracing and roads, ViewIndex culling and frontier-only fog, and the three coordinate spaces that get confused. Use when touching src/map/, MapScene, terrain, provinces, fog, or map rendering performance.
---

# The map

A 30×52 pointy-top hex grid (1560 tiles) flood-filled into 42 provinces ("lands"). Config lives in
[src/game/gameplayConfig.ts:7](../../../src/game/gameplayConfig.ts#L7):

```ts
export const GAMEPLAY_MAP_CONFIG = {
  cols: 30, rows: 52, hexSize: 18, seed: 1337,
  riverHexCount: 92, neutralDistrictTarget: 40,   // + player + rival capital = 42 lands
};
```

## Coordinates

[src/map/hex.ts](../../../src/map/hex.ts) is the *entire* coordinate library — 112 lines,
**pointy-top axial `(q, r)`**, with odd-r offset used only at grid construction.

```ts
export const MAP_SCALE = 1.72;
export interface HexCoord { q: number; r: number }
export const HEX_DIRECTIONS: HexCoord[]     // E, NE, NW, W, SW, SE
export const EDGE_DIRECTIONS: HexCoord[]    // edge i (corner i→i+1) faces this neighbour
hexKey(hex): string                         // `${q},${r}`
hexEquals / hexAdd / hexNeighbors
axialToPixel(hex, size): PixelPoint         // x = size*√3*(q + r/2),  y = size*1.5*r
pixelToAxial(x, y, size): HexCoord          // cube-rounds internally
hexCorners(center, size): number[][]        // SIX [x, y] TUPLES, not {x,y} objects
generateRectGrid(cols, rows): HexCoord[]
```

**There is no `hexDistance`, `hexRing`, `hexSpiral` or `hexLine`.** Gameplay distance and
adjacency run on the **land graph**, not the hex graph — `isAdjacent(state, a, b)` in
`LandSystem.ts` is just `fromLand.neighbors.includes(toLandId)`. Do not add hex pathfinding
expecting the systems to use it.

A drawn hex's world radius is `hexSize * MAP_SCALE` = 18 × 1.72 = **30.96**.

### The three coordinate spaces

This is the single biggest source of bugs on the map.

| Space | Definition | Where it appears |
|---|---|---|
| **Map units** | raw `axialToPixel` output | `land.x`, `land.y`; settlement anchors |
| **World units** | `wx(v) = (v - hexOffsetX) * MAP_SCALE` | everything drawn; camera `scrollX/scrollY` |
| **Design units** | 390 × `GAME_HEIGHT` screen space | all hit tests, all HUD layout |

- `land.x/land.y` are **map units** — every draw site must wrap them in `this.wx(...)`.
- `buildRoadCurve` applies `wx/wy` **internally**; passing world coords double-transforms.
- `hexCorners` returns tuples; most callers do `.map(([x, y]) => ({ x, y }))`.
- **Inflation factors differ per layer and are load-bearing:** terrain/control/fog use
  `hexSize * MAP_SCALE * 1.02`, coast `1.03`, boundary/selection **exactly 1.0**, city walls
  `1.18`. The 1.02 overlap is what makes the landmass read as one continuous ink-wash field
  instead of a grid of hexes with visible seams.
- `camera.zoom ≠ map zoom`. `mapZoom = cameras.main.zoom / RENDER_SCALE`. Reading it raw and
  dividing `GAME_WIDTH` by it answers a different question than every clamp in `MapScene` is
  asking.
- Pointer coords are in **buffer** space — convert with `designPointer(pointer)` before any hit
  test. (The drag-pan delta is the exception: it divides by the *raw* camera zoom, because pointer
  deltas already carry the render scale.)
- **The map camera has no Phaser bounds, on purpose.** `MapScene` never calls `setBounds`:
  Phaser's clamp assumes a camera that zooms about its centre, and with the render scale folded
  into `camera.zoom` it was off by 422 design units on phones — the opening frame put the capital
  under the action bar and the southern band of the map was unreachable (fixed 2026-08-18). Every
  camera move in the scene clamps itself to `[0, world − GAME/mapZoom]`; a new pan path must too.
- The opening frame centres on `getSettlementAnchor(capital)` — the citadel — not on the land
  centroid, which can be most of a province away from it.
- The reverse hit test must undo both transforms in order:
  ```ts
  const rawX = worldX / MAP_SCALE + this.hexOffsetX;
  const coord = pixelToAxial(rawX, rawY, hexSize);
  return this.hexTileMap.get(hexKey(coord))?.landId;
  ```
  It consults only `hexTileMap`, never `fillerTileMap` — taps on padding hexes select nothing.

## Terrain

Nine types, in [src/map/terrainTypes.ts:5](../../../src/map/terrainTypes.ts#L5):

```ts
export type HexTerrainType =
  | 'plains' | 'fields' | 'riceFields' | 'forest'
  | 'mountains' | 'hills' | 'water' | 'fortress' | 'shrine';
```

`TERRAIN_REGISTRY` carries only `{ color, preferredFor: LandType[], weight }`. Everything else
that a terrain "has" lives elsewhere, and this is not obvious:

| Concern | Where |
|---|---|
| Movement cost | `src/game/movementConfig.ts` — `TERRAIN_MOVE_COST`, averaged **per land**, never per hex during play |
| Yields | `ResourceSystem.calculateLandOutputs` — water/rice/mountain bonuses |
| Build gating | `ResourceSystem` — farms need grass tiles, mines need mountains+hills, harbours need water |
| Combat defence | `WarSystem.terrainDefenseMultiplier` — `1 + min(0.35, rugged * 0.5)` |
| Seasonal tone | `src/ui/ink/season.ts` — `groundCast(terrain)` |
| Đông Hồ ground + scatter | `DongHoMapRenderer` — `groundFor()` and `SCATTER` |
| Per-land counts | `TerrainSummary` on `Land` — one numeric field per terrain |

Colour is theme-aware: `getTerrainColor()` routes through `terrainColor()`, which reads the active
theme's palette. The registry's `color` is only a fallback.

Worth knowing: `castle`, `enemyCastle`, `market` and `temple` appear only in `plains.preferredFor`,
so those provinces' non-city hexes are 100% plains.

## Generation

[src/map/hexMapGenerator.ts](../../../src/map/hexMapGenerator.ts), one seeded RNG stream
(`createRng` — mulberry32) consumed in a fixed order:

1. `generateRectGrid`, every tile `plains`, no `landId`
2. `carveRiver` — a **random walk**, not noise (35% chance to turn ±1 direction per step). There
   is no Perlin/simplex anywhere in this codebase.
3. `applySeaBorders` — `SEA_DEPTH = 4`, sides applied in order top/right/bottom/left
4. `growZones` — multi-source flood fill. Each land is seeded on a random unclaimed non-water
   tile, then lands take turns popping one random hex off their frontier and claiming **all** its
   unclaimed non-water neighbours at once. Water hexes and water-isolated pockets keep
   `landId: undefined`.
5. `assignTerrain` — each land's hexes get `pickWeighted` over the terrains that list its
   `LandType` in `preferredFor`. Then castle/market/temple lands get a contiguous BFS core of
   `min(8, max(1, round(hexes * 0.15)))` hexes overwritten to `fortress` (or `shrine` for temples).

Then `computeNeighbors` (cross-land adjacency) and `computeCentroid` (→ `land.x/y`, in map units).

**Determinism caveat that matters.** The hex pipeline is deterministic given `(seed, lands)`, but
`createConfiguredLandTemplates()` builds the 42 templates using **unseeded `Math.random()`** for
name, type, defense and loyalty — and `assignTerrain` branches on `land.type`. So *land shapes*
reproduce from a seed; *terrain does not*. Reproducibility comes from monkey-patching
`Math.random` before construction, which is exactly what `__startBenchGame` and every harness does.

## Lands are hex groups, held by back-reference

`Land` carries **no hex list**. The binding is `HexTile.landId` on each of `state.hexTiles`, and
queries are linear scans. Derived at world-gen: `x/y` (centroid), `neighbors`, `terrainSummary`,
`buildingCapacity = max(1, floor(nonWaterTiles / 7))`, `hasVillage`, `population`.

> **`src/data/lands.ts` is dead data.** It exports 37 hand-authored provinces and *nothing in the
> repo imports it* — the only grep hit is its own declaration. All live modes generate
> `district-01`…`district-42` procedurally in `GameState.ts`. Editing `lands.ts` changes nothing.
> To add provinces, raise `neutralDistrictTarget`. (`src/data/kingdoms.ts`, by contrast, **is**
> live.)

**Boundaries** — `src/map/boundary.ts`. `traceLandBoundaryEdges` emits an edge wherever a tile's
`EDGE_DIRECTIONS[i]` neighbour has a different `landId`. `traceLandBoundaryLoops` welds those into
closed loops via a point graph quantised to 0.1 units. Three separate loop caches exist and are
invalidated independently — two of them are never cleared, which is fine only because their
inputs never change.

**Roads** — `src/map/roadCurve.ts`. `buildRoadCurve` returns a `Phaser.Curves.Spline` seeded from
`state.mapConfig.seed + hashString(seedKey)`, with 1–2 waypoints jittered along the normal. **Every
walker goes through `drawnRoadBetween`** — the road as drawn for the sorted pair, walked backwards
from the higher id — so carts, travellers and marching hosts are all on the painted road.
`ArmyRenderer` chains stand → gate → road → far gate → far stand into a `MarchRoute`
(`src/map/marchRoute.ts`) walked by arc length; where no road is drawn (wilderness, unseen ground) a
host makes a `track|lo|hi` of its own on the same sorted key, so it comes home the way it went.

## Culling and fog

`ViewIndex` ([src/scenes/map/ViewIndex.ts](../../../src/scenes/map/ViewIndex.ts)) is a uniform
256-unit grid, not a quadtree — the world is 2244×3030 and the camera sees 1.8–9.3% of it, and
Phaser culls sprites but **not `Container`s or `Graphics`**, which is what nearly everything here
is. 108 cells; a query touches 6–18.

- `CullKind = 'node' | 'label' | 'flag' | 'army' | 'traffic' | 'cloud'`
- `apply(view, margin)` sweeps candidate cells, then **re-tests each entry** against `x ± radius`
  (an object near a cell edge can sit in a touched cell yet lie outside the view), then calls
  `setCulled` **only on entries that changed side**.
- The view rect is built from `scrollX/scrollY/width/zoom`, deliberately **not** from
  `camera.worldView`, which Phaser only recomputes in `preRender` and which is empty at the first
  cull inside `drawMap`.
- `set()` re-applies a culled state to a rebuilt object, so a refreshed node inherits its
  predecessor's visibility.
- Army radius is a deliberately wide 200 — a marker tweens a whole leg between refreshes.
- Culling a fog cloud both hides it **and pauses its tween**; stopping the animation is usually
  the larger saving.
- Runs every frame *before* the halt check, so a paused map still culls while panning.

**Fog is frontier-only.** A land is fogged only if it is not visible **and** has at least one
visible neighbour. Everything beyond that band is left as bare paper. Painting fog over every
hidden province made the opening position — 3 visible, 39 fogged — the most expensive frame in the
game at 364k fill commands.

## Per frame

`update()` does: `syncWorldMotion` (acts only on change) → `syncViewCulling` (one string compare
on a still camera) → bail if the world is halted → drift up to 40 pooled weather motes →
accumulate to `REALTIME_TICK_MS` and tick.

The GPU draws two baked quads plus the live layers above depth 1.9. Everything at depth ≤ 1.5 is
`visible = false` after the bake. See [game-art-theme](../game-art-theme/SKILL.md) for the bake
and the six-way signature split that decides what repaints.

## Recipes

**A new terrain type** — order matters; steps 3–4 are the silent ones.
1. `src/map/terrainTypes.ts` — add to the `HexTerrainType` union.
2. Same file — add a `TERRAIN_REGISTRY` entry.
3. `src/state/types.ts` — add the field to `TerrainSummary`. *(compile break if skipped)*
4. `src/state/GameState.ts` — add it to `createEmptyTerrainSummary()`. **Skipping this is a silent
   `NaN`** — the counter does `summary[tile.terrain] += 1` on `undefined`.
5. `src/game/movementConfig.ts` — `TERRAIN_MOVE_COST`. *(compile break)*
6. `src/ui/mapTheme.ts` — a colour in **all three** palettes. *(compile break)*
7. `src/ui/MapRenderer.ts` `decorateTerrain` and `src/ui/AtlasMapRenderer.ts` — add a `case`.
   These have a `default: return`, so omission is a silent no-op.
8. `src/ui/DongHoMapRenderer.ts` — `groundFor()` and `SCATTER`. **This is the default theme;
   skipping it renders the new terrain as bare paper.**
9. `src/ui/ink/season.ts` `groundCast` if it should turn with the seasons.
10. `hexMapGenerator.ts` — extend the `key !== 'fortress' && ...` filter if it must be excluded
    from the weighted interior roll.
11. If settlement-bearing, also `SettlementRenderer` and `LandSystem.getAcquisitionTicksRequired`.
12. Optional: yields, build gating, aptitude, combat defence in `ResourceSystem`/`WarSystem`.

**A new land type**
1. `src/state/types.ts` — extend the `LandType` union.
2. `src/map/terrainTypes.ts` — **add it to `ALL_LAND_TYPES`.** Forget this and `assignTerrain`
   builds an empty candidate list and `pickWeighted` throws on `entries[-1].value`.
3. Add it to `preferredFor` on the terrains that suit it.
4. `hexMapGenerator.ts` — extend the city-seeding branch if it needs a fortress/shrine core.
5. `GameState.ts` — add to the `types` pool in `createGeneratedNeutralDistrict` and give it a
   `defense` branch.
6. `SettlementRenderer` — pick its cluster; `TrafficRenderer.roadWidth`; `MapScene` label/flag
   tests.
7. i18n: `landType.<x>` in both catalogs.
