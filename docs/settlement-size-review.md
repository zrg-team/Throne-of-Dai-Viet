# Settlement size review — 6 September 2026

All 11 cutouts in `public/art/conquest-dongho-v4/settlement/` use smaller, consistent map sizes. Individual buildings are compared with the unchanged 15-unit standalone house. Capitals retain their walled compounds and distinctive halls, with less magnification of their gates and roofs.

| Settlement | Previous visible height | Revised visible height | Width limit |
| --- | ---: | ---: | ---: |
| Hamlet | 38 | 32 | 56 |
| Village | 44 | 38 | 60 |
| Market town | 48 | 40 | 62 |
| Shrine village | 52 | 44 | 64 |
| Farmstead | 34 | 28 | 56 |
| Mine camp | 38 | 32 | 56 |
| Đinh citadel | 76 | 50 | 80 |
| Lý citadel | 78 | 52 | 80 |
| Trần citadel | 78 | 52 | 80 |
| Lê citadel | 86 | 56 | 80 |
| Nguyễn citadel | 82 | 52 | 80 |

Values above record the first sizing pass. The subsequent [capital architecture correction](art/capital-redesign-v2.md) tightens capital widths to 64, lowers Lê's height ceiling to 52, and allows low compounds to fit by width. Other settlement values remain current. Values are world units measured against visible artwork, excluding transparent padding. Proportions are preserved. PNG resolution and compression do not determine the map size.

The size contracts live in `src/ui/conquestMapArt.ts`. Keep `scripts/conquest-art/sync-world-scale-contracts.mjs` in sync when changing them, then run it to update production metadata. Existing rendering, road endpoints, landscape clearance and building placement use these same metrics.

Review artifacts from this pass:

- `output/settlement-sizing/after-all-settlements.png`: all 11 original/adjusted sizes at a common zoom, with an unchanged house reference.
- `output/settlement-sizing/after-map-1.4.png` and `after-map-2.2.png`: the capital and surrounding structures in Dragon Ascent.
- `output/settlement-sizing/client/`: installed web-game client screenshots and text state.

Validation: all 11 settlement layout cases pass, with no intersections between 42 labels and 35 live structures. TypeScript and production build pass. Settlement scale assertions pass; the broader visual-scale suite remains 15/17 because its farmer/traveller comparison and structural-asset count already failed before this change. Successful gameplay captures reported no browser errors.
