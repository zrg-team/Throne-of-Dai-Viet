---
name: game-art-theme
description: The graphics and theme system of Vạn Thắng — the three swappable map themes and their renderer interfaces, the three-layer colour system (pigments → theme palettes → UI tokens), the procedural Đông Hồ ink aesthetic, hero portraits, fonts, graphics quality tiers, and the RenderTexture bake. Use when touching colours, drawing code, renderers, portraits, icons, UI chrome, or anything that changes how the game looks.
---

# The look of Đại Việt

The art is a Đông Hồ folk woodblock print: shell-coated điệp paper, a colour block pulled first
and a soot-black contour pulled second, with the two never quite in register. Almost nothing is a
sprite — it is procedural `Graphics` drawing, every frame or baked into a texture.

## Three themes, one interface

[src/ui/mapTheme.ts:5](../../../src/ui/mapTheme.ts#L5) is the switch:

```ts
export type MapThemeId = 'illustrated-atlas' | 'ink-wash' | 'dong-ho';
export type MapThemeRendererId = 'atlas' | 'ink' | 'dongho';
```

**`dong-ho` is the default and the one that matters** — it is the only theme with seasons, the
only one with a full `drawLandscape`, and the only one the portrait cartouche and season layers
check for. Stored in `localStorage['mandate:map-theme:v1']`; it is an app preference, not save
data. Changing it calls `scene.restart()`.

Two interfaces, two factories:

| Interface | Defined | Factory | Implementations |
|---|---|---|---|
| `MapRenderer` — terrain, clouds, roads, borders | [MapRenderer.ts:53](../../../src/ui/MapRenderer.ts#L53) | `createMapRenderer(scene)` | `AtlasMapRenderer`, `InkMapRenderer` (inside MapRenderer.ts), `DongHoMapRenderer` |
| `MapItemRenderer` — settlements, armies, flags, badges | [MapItemRenderer.ts:20](../../../src/ui/MapItemRenderer.ts#L20) | `createMapItemRenderer(scene)` | `AtlasMapItemRenderer`, `InkMapItemRenderer`, `DongHoMapItemRenderer` |

`DongHoMapItemRenderer extends InkMapItemRenderer` and overrides only `createArmyMarker`,
`createSelectionFlag`, `addCityCluster` and a few more; carts, travellers and badges are
inherited. `InkMapItemRenderer` lives in its own module purely so the subclass can extend it
without a circular import through the factory.

`MapRenderer` has **optional hooks** — a renderer that omits them gets the scene's default
per-hex behaviour. `drawLandscape?(context)` is the big one: when present the scene skips its
entire per-hex loop and hands terrain over wholesale. Only Đông Hồ implements it. The others
(`drawZoneFill`, `drawFogRegion`, `drawForeignWash`, `drawShoreEdge`, `drawFogCell`) each exist
because the default hex-shaped fallback reads as a honeycomb.

## Colour: three layers, and one scarcity law

**Layer A — `PIGMENT`** ([src/ui/ink/palette.ts:13](../../../src/ui/ink/palette.ts#L13)). Real
Đông Hồ pigments, named in Vietnamese with tonal suffixes (`Hi`, `Lo`, `Deep`, `Pale`, `Soft`,
`Faint`, `Wash`):

```
diep   điệp — shell-coated paper       cham   chàm — indigo, water and distance
muc    mực — bamboo-soot black         giDong gỉ đồng — verdigris, growing things
son    sỏi son — red                   hoe    hoè — sophora, grain and lamplight
nau    nâu — iron-brown, timber        hide/horn — livestock
```

> **The one hard rule: `son` is spent on the player alone.** A rival flies the same standards
> desaturated through `mutePigment`. Break this and the map stops telling the player who they are.

Derive, do not invent — the stated policy is *no new hues*. Use `shadePigment(c, factor)`,
`mutePigment(c, amount)`, `mixPigment(from, to, t)`.

**Layer B — `MapThemePalette`** ([mapTheme.ts:8](../../../src/ui/mapTheme.ts#L8)). Semantic slots
(`paper`, `ink`, `terrain: Record<HexTerrainType, number>`, `water`, `fog`, `minimap`,
`mapObjects`, …), one filled instance per theme. Renderers read `this.theme.palette`, never a
literal.

**Layer C — `INK_UI`** ([InkUI.ts:73](../../../src/ui/InkUI.ts#L73)). Chrome tokens; keys keep
legacy names but the values were retargeted onto pigments. `src/ui/theme.ts` is a thin shim over
it. `COLORS` in `src/game/constants.ts` is the legacy raw palette, still used for
`COLORS.selected` and `COLORS.neutral`.

Adding a colour: pigment → `palette.ts`; a *role* on the map → add a slot to `MapThemePalette` and
fill it in **all three** themes (TypeScript fails the build until you do); chrome → `INK_UI`.
Never write a raw `0x…` at a draw site in `src/ui/ink/**`.

Three unrelated functions are named `shade` — `inkTheme.shade` (multiplicative),
`ink/palette.shadePigment` (multiplicative), `faces/palette.shade` (**additive**). Two are named
`washFill` — `ink/stroke.ts` (registration offset) and `inkTheme.ts` (rng mottling). Check which
module you imported.

## The ink primitives — `src/ui/ink/stroke.ts`

```ts
inkPath(g, points, seed, options?)      // three passes: 2.6×@0.14, 1.5×@0.2, 1×@0.88
washFill(g, points, colour, seed, alpha, registration = 1.6)
hatchPoly(g, points, angle, gap, colour, alpha, width)
printedShape(g, points, colour, seed, options?)
groundTone(g, cx, cy, radius, colour, alpha, rings = 4)
thickPath(points, widths)
mulberry32(seed)                        // all randomness comes from here
```

- `options.width` is in **screen pixels** — pass `zoom` or ink thickens as the player zooms in.
- `washFill`'s `registration` offset is the whole trick. At 0 it reads as clip-art.
- `hatchPoly` clips analytically because Phaser has no clip and a mask would not survive the bake.
- `groundTone` draws falling-alpha rings so neighbouring cells overlap into a seamless field —
  it is what stops the hex grid leaking back into the picture.
- Nothing baked through `sprites.bakeProp` may use `fillGradientStyle`.

## The vocabulary: prop vs life vs device

| Term | File | What it is |
|---|---|---|
| **prop** | `ink/props.ts` | A static silhouette drawn straight into a shared `Graphics` at an absolute position. Painted once into the static bake. Cannot move. |
| **life** | `ink/life.ts` | A prop given its own object so it can move. Home of the facing convention. |
| **device** | `ink/devices.ts` | The narrator's register — Đông Sơn bronze chrome. *Drum in the chrome, dynasty in the world.* Also hosts and seals. |

Other files: `paper.ts` (the printed ground texture), `PaperFX.ts` (full-screen post pass —
fibre, tea-stain blot, vignette, điệp tint), `settlements.ts` (arrangements: hamlet, village,
citadel by era, paddy lattice), `season.ts` (the calendar as pigment), `proportion.ts` (one scale
for everything), `storyBand.ts` (twelve generic story impressions, never one per story),
`sprites.ts` (the one baked-to-texture path).

Rules that are load-bearing:

- **Every prop's first line is `const s = unitScale('<propKey>', scale)`.** Non-negotiable.
- **Composites paint bottom-up.** `settlements.ts` collects `Standing { y, draw }` and sorts by
  ascending `y` before painting, because the eye reads a scene bottom-up. Phaser does *not* depth-
  sort `Container` children — `setDepth` inside a container is silently a no-op.
- **Use `hostSpan`, never `shape.width`/`shape.height`,** to position anything against a host
  block. Width/height are the block's *pitch* and overshoot the outermost figure by a full
  spacing. Two separate features got this wrong independently.
- **Never `setScale(-1, 1)` a baked prop** — it is rasterised large and scaled down, so mirroring
  that way shows it four times the size. Declare `setNativeFacing` and use the facing helpers.
- **Size is an instance scale, never part of a texture key.** Keying on size produced 15 textures
  for 40 animals and a batch flush per size.
- **The seal carries a drawn device, never a written character.** The game ships in English and
  quốc ngữ; a Hán glyph is decoration pretending to be information.
- **Type never sits on hatching** — put a `clearPlate` behind it.

## Seasons: two of them, live at once

`setRenderSeason()` drives the terrain **fill**; `setFoliageSeason()` drives **scenery**. Terrain
is pinned to `BAKE_SEASON = 'Spring'` (spring needs no ground cast) because a full bake costs
~1.5s, while re-inking scenery costs ~170ms. That gap is why leaves turn in a single frame.
`MenuScene` sets both to the real month. Only Winter carries a non-zero wash alpha — every other
season is stated by what grows, not by a screen-wide filter.

## Faces

74 committed SVG parts in `public/faces/`, a generated manifest at
`src/ui/faces/parts.generated.ts` (**do not edit**), and `scripts/build-faces.mjs` which authors
every part in one design space, measures each with headless Chromium `getBBox`, crops with 2px
padding, and emits both the SVGs and the manifest. `yarn faces:check` compares byte-for-byte and
exits non-zero on drift.

Parts that carry a run-chosen colour are drawn white and tinted at runtime — six skin tones are
one file. Parts with a fixed colour (gold coronet, ochre kesa, red yếm) ship their colour with
`tint: 'none'`.

> **The rule `heroLook.ts` enforces: the seed never decides who someone is.** Sex, monastic vows,
> role and rank come off the hero's own data and select a *wardrobe*; only then does the hash pick
> within it. Before this, every named female hero rendered with facial hair.

Wardrobe is keyed on **era first** — Nguyễn Phúc Khoát's 1744 reform replaced the crossed lapel of
the áo giao lĩnh with the standing collar of the áo ngũ thân, so an official in the wrong
century's collar is as plainly wrong as one in the wrong hat.

Paint order comes from `def.layer`, not the order the wardrobe pushed parts, so `heroLook` can
read as a description of a person rather than a paint sequence.

## Quality tiers — `src/game/graphicsQuality.ts`

| Tier | renderScale | paperFX | scatter | bakeScale | drops labels below zoom |
|---|---|---|---|---|---|
| low | 1 | **off** | 0.6 | 0.5 | yes, 0.85 |
| medium | 2 | on | 1 | 0.75 | no |
| high | 3 | on | 1.25 | 1 | never drops |

`RENDER_SCALE` is read **once** per session — changing quality does `window.location.reload()`,
not a scene restart, because the drawing buffer is sized at game construction.

Two things that break instantly if ignored: `applyRenderScale` sets **origin (0,0) first, then
zoom** (a Phaser camera zooms about its own centre, so without the origin a third of the layout
goes off screen); and every hit test must convert through `designPointer`/`designLength`, because
layouts are written in 390-wide design units and a raw Phaser pointer breaks the moment scale > 1.

## The bake, and the six-way signature split

Static map layers are composited into RenderTextures — one for terrain (depth 1.9), a separate
one for fog (depth 77.5). The static bake collects **every scene child with `depth <= 1.5`**,
sorts by depth, draws once, and hides the sources. It replaces roughly 160k per-frame fill
commands with one textured quad.

Repaints are gated by six independent signatures
([MapScene.ts:1871](../../../src/scenes/MapScene.ts#L1871)): `terrain`, `control`, `fog`, `roads`,
`node`, `badge`. These used to be one combined signature, so any change repainted everything —
and `isExplored` changes nothing but a fog alpha while costing a full repaint. Keep them split:

- `roads` is deliberately **not** keyed on buildings, so a granary going up does not rebuild the
  country's roads. `test_scripts/diag-build.mjs` guards this.
- `fog` gets its own texture so re-inking it does not drag ground, ranges and roads through a
  re-composite.
- `node` is per-land, so only the lands that changed are rebuilt.

`rebakeScenery()` is the cheap season turn: 110–220ms (median ~170) against 1200–1500ms for a full
refresh, on a 4×-throttled mid-tier profile. It works because the placement plan is reused, the
terrain fill is pinned to spring, and no new RenderTexture is allocated.

Diagnostic switches: `?nobake=1`, `?nofx=1`, `?nocull=1`, `?noseason=1`, `?bakescale=N`,
`?capture=1`.

## Recipes

**A new decorative prop**
1. `src/ui/ink/props.ts` — `export function myProp(g, x, y, scale, seed)`. First line
   `const s = unitScale('myProp', scale)`. Draw only with the stroke primitives. `mulberry32(seed)`
   for randomness. Read `foliagePalette()` if it grows. Never clip to a cell.
2. `src/ui/ink/proportion.ts` — add **three** entries under the same key: `UNIT`, `METRES`,
   `DRAWN`. `DRAWN` must be *measured* at `s = 1`, not guessed; three separate faults came from
   guessing. Update the doc table at the top.
3. `src/ui/DongHoMapRenderer.ts` — add to `PropKind`, give it a `FOOTPRINT`, add to the relevant
   `SCATTER[terrain].kinds`. Note `scale` in `ScatterSpec` is jitter around 1, not a size.
4. Same file — add a `case` to `drawProp`.
5. If it moves: bake it in `ink/sprites.ts` with a `PropBox` in `UNIT`-corrected units, place with
   `livingSprite`, declare `setNativeFacing`.
6. Verify with `node test_scripts/verify-ground-scale.mjs`, then screenshot via `shot-dongho.mjs`
   or `shot-art.mjs`.

**A new card icon**
1. `src/ui/CardIcons.ts` — add the id to `CardIconId`.
2. Add a `case` to `drawCardIcon`, using only `line(w)`/`fill(alpha)` in a 26-unit box centred on
   (0,0). Finer than that is mud at render size.
3. Map option ids to it in `BY_OPTION`, or add a prefix rule in `iconForOption`.
4. Ids are about **meaning, not the card that uses them** — `coin` serves bribe, tribute and
   buy-off alike; 20 glyphs cover 40-odd options. Never put icons in translated strings.

**A new theme**
1. Extend `MapThemeId` (and `MapThemeRendererId` for a new renderer family).
2. Add a `MapThemeDefinition` with a complete palette; register in `MAP_THEMES`; widen the
   `labelKey` union and the guard in `getMapTheme`.
3. `src/i18n/catalogs/core.ts` — `menu.mapTheme.<x>` in **both** en and vi.
4. Implement `MapRenderer` + `MapItemRenderer`; register in both factories.
5. `MenuScene` — add the menu-diorama branch.
6. Widen the hard `=== 'dong-ho'` checks in `MapScene` (season layers) and `FaceRenderer`
   (cartouche) if the new theme wants them.

**A new UI surface** — everything goes through `InkUI`: `.panel`, `.card`, `.button`, `.modal`,
`.scrollArea`, `.statBar`, `.slider`, `.crayonTile`. Button variants are
`primary | secondary | danger | ghost | disabled`; `primary` is sỏi son as an **outline with red
lettering, not a fill** — the scarcity law again — and `danger` is the only filled red. Any
`pointerup` inside a scroll area must call `scrollGestureConsumedTap(pointer)` first and return
early if true.

**Fonts** — `UI_FONT` is Be Vietnam Pro, `TITLE_FONT` is Source Serif 4, both self-hosted under
`public/fonts/` and refreshed by `yarn fonts`. Vietnamese stacks two marks above the letter; a
face without a real Vietnamese design collides or drops them, and a CDN link is a silent fallback
waiting to happen.
