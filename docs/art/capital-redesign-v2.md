# Capital architecture correction v2

The user rejected the Lý, Lê and Nguyễn designs as unreal and potentially oversized. The correction replaces those three drawings and caps all five capital widths at 64 visible world units. Height is a ceiling, not a required size: broad, low compounds stop growing when they reach the width cap. Lê's height ceiling also falls from 56 to 52. Đinh and Trần retain their v1 drawings.

## What changed

- Lý: removed the rear building, tall ornamental posts and exaggerated roof spirals. A low main hall, two side halls and a modest gate form a readable courtyard.
- Lê: removed the rear palace tier and surplus pavilions. The main hall sits on one low foundation, with three stair approaches/four dragon rails; the front gate has five arches.
- Nguyễn: removed the rear palace, rear corner pavilions and raised stone connections. A low audience hall and the gateway share a ground-level courtyard. A corrective edit closed the incorrectly forward-facing wing arches.

The [research record](../research/capital-architecture-redesign.md) remains the evidence base. Official Thăng Long and Huế sources were checked again, and the existing official Ngọ Môn photograph was used as an architectural reference. Lost palace elevations, compressed plans and small ornaments remain artistic interpretations.

## Measured map size

These dimensions exclude transparent padding and come from the renderer's visible-art metrics.

| Capital | Previous width × height | Current width × height |
| --- | ---: | ---: |
| Đinh | 60.5 × 50.0 | 60.5 × 50.0 |
| Lý | 63.3 × 52.0 | 64.0 × 39.9 |
| Trần | 66.2 × 52.0 | 64.0 × 50.3 |
| Lê | 68.0 × 56.0 | 64.0 × 39.6 |
| Nguyễn | 70.7 × 52.0 | 64.0 × 45.5 |

Widths now differ by under 6%; the three revised compounds are 13–29% shorter. The scale regression check now compares visible width and area, with explicit width/height ceilings, so it does not force low architecture to grow to match a deeper compound's height. Original v1 measurements fail the new width limits.

## Files and checks

- New runtime assets: `public/art/conquest-capitals-v2/settlement/`; three selected paths in `src/ui/conquestDongHoV4Assets.json`. Older drawings remain preserved.
- Built-in ImageGen [prompts](capital-redesign-v2-prompts.json), [corrective prompt](capital-redesign-v2-corrections.json), and [generation/review log](capital-redesign-v2-generation-log.json).
- Export: `node scripts/conquest-art/capital-pack.mjs output/capital-redesign-v2/masters conquest-capitals-v2 ly,le,nguyen`. Masters are local ignored output; committed runtime PNGs do not need regeneration on a clean checkout.
- Comparison: `output/capital-redesign-v2/capital-comparison.png`; real game captures and runtime metrics in the same directory.

Build and all 11 settlement layouts pass; 42 labels avoid all 35 structures. All four missing/corrupt-art fallback cases pass. All settlement scale checks pass; the broader suite remains 15/17 with the existing farmer/traveler and stale structural-count failures. Installed web-game client screenshots and state were inspected with no browser errors. Lý is measured and reviewed in the comparison; current era progression does not select it.
