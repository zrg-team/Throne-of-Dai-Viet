# Conquest traveller styles, version 1

Five new civilian silhouettes join the original red-clad road worker: an indigo basket carrier,
a moss-green fisherman, an ochre cloth merchant, a brown-robed pilgrim, and a plum-clad wood gatherer.
Each has its own still and four walking poses, preserving the existing Đông Hồ print style.

Road appearances use a deterministic shuffle seeded by the map seed and road identity. The two
or three travellers sharing a road receive different looks. Refreshing the map preserves existing
objects and appearances. Settlement wanderers use the same six-style pool with their position seed.
The existing distance-driven gait, human scale, pace variation, facing, pause and culling remain shared.
Missing walk sheets fall back to the matching still; missing new art falls back to the original worker.

## Artwork and generation

- Runtime assets: `public/art/conquest-travelers-v1/life/traveler-{basket,fisher,merchant,pilgrim,woodcutter}.png`
  and their corresponding `-walk.png` sheets (ten files, about 6.2 MB total).
- Registration and paths: `src/ui/conquestTravelerVariants.json`.
- Generator: built-in `image_gen`, one call per style, using the original traveller sheet as reference.
- Exact prompt set: [conquest-traveler-variants-prompts.json](./conquest-traveler-variants-prompts.json).
- Packing tool: `scripts/conquest-art/traveler-variants.mjs`. Pass a directory containing the five
  reviewed masters named `basket.png`, `fisher.png`, `merchant.png`, `pilgrim.png`, `woodcutter.png`.
- The revised masters arrived with a pale neutral checkerboard; the packer clears that matte
  while retaining warm cloth and skin. All poses are registered by face centre and planted-foot
  baseline on 627px cells.

## Low-step correction, 2026-09-06

The initial fourth pose lifted the knee too high. All five sheets now use a close-legged passing
pose with the free foot just above the ground. The other support leg stays extended, the body
keeps its standing height, and the existing distance-driven timing and random appearances remain.

Built-in ImageGen edited the existing designs. The first revision lowered the knees but repeated
the same forward support foot; it was rejected. A targeted second edit used the original worker's
low fourth pose as a motion reference. Exact prompts are in
[the revision log](./conquest-traveler-low-step-prompts.json) and
[the selected final prompt](./conquest-traveler-low-step-final-prompts.json).
Selected masters are in `output/traveler-low-step/reviewed-masters/` and were packed into the
runtime files above. The earlier runtime PNGs are preserved under `output/traveler-low-step/before/`.

Measured free-foot clearance in the fourth pose, in source pixels at approximately 550px body height:

| Traveller | Previous | Updated |
| --- | ---: | ---: |
| Basket carrier | 77 | 9 |
| Fisherman | 100 | 20 |
| Cloth merchant | 57 | 10 |
| Pilgrim | 42 | 9 |
| Wood gatherer | 52 | 13 |

The updated foot-clearance check fails all five old sheets and passes all five replacements.
Support is checked within each pose rather than requiring a large horizontal shift between poses:
short passing steps bring the ankles close together while still switching the supporting leg.

## Verification

- `npx tsc --noEmit` and `npm run build` pass.
- `verify-conquest-walk-sheets.mjs`: 47/47 checks, including four distinct, padded alpha frames,
  alternating planted feet, and the new maximum foot-clearance check for all five new styles.
- `verify-conquest-traveler-variety.mjs`: 62 populated Conquest roads, all six looks, no duplicates
  within a busy road, settlement variety, identity stability across refresh, equal human scale,
  four distance-driven poses, both facing directions, pause/cull/resume, and missing-art fallbacks.
- Light/dark contact sheet and live Conquest captures at map zoom 1.2 and 2.4 were visually inspected.
  Runtime checks reported no browser errors. Review artifacts are in `output/traveler-variants/`.
- The low-step correction was rechecked in Conquest with all six styles, frame cycling, scale,
  refresh, facing, pause/culling and fallbacks. Production build passes with existing font/chunk warnings.
  `output/traveler-low-step/walk-comparison.html` is a self-contained playable before/after view;
  the corresponding `.webm` and `before-after.png` show the revised gait and low passing pose.
