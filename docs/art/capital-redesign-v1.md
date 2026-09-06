# Capital art revision 1

The user subsequently rejected the Lý, Lê and Nguyễn architecture. Those three designs and this revision's size rules are superseded by [capital correction v2](capital-redesign-v2.md). This page records the earlier pass.

All five royal capitals use a new, denser ensemble of halls, galleries and ceremonial gates. Their approved visible heights remain Đinh 50, Lý 52, Trần 52, Lê 56 and Nguyễn 52 world units, with the existing 80-unit width ceiling. Their richer roof groups are wider than the old narrow drawings while remaining within that ceiling. Ordinary settlements and standalone buildings keep their current artwork and sizes.

The [research record](../research/capital-architecture-redesign.md) separates documented features from artistic reconstruction. Early palace elevations and the condensed plans are interpretations. Lê and Nguyễn gate errors in the first generated drafts were corrected and inspected before integration.

## Assets and provenance

- Selected transparent PNGs: `public/art/conquest-capitals-v1/settlement/`.
- Runtime selection: the five capital entries in `src/ui/conquestDongHoV4Assets.json`. The v4 originals remain available for comparison or rollback.
- Generator: built-in ImageGen. [Exact prompts](capital-redesign-v1-prompts.json), [corrective prompts](capital-redesign-v1-corrections.json), [selected outputs and review log](capital-redesign-v1-generation-log.json).
- Export: `node scripts/conquest-art/capital-pack.mjs [master-directory]`. This only removes the generated neutral matte and isolated specks, crops and uniformly downsamples. Masters default to the local ignored `output/capital-redesign-v1/masters/`; a clean checkout already includes the selected runtime PNGs and does not need regeneration.
- Review: `output/capital-redesign-v1/capital-comparison.png`, paper/dark boards in `review/`, and actual game captures `map-dinh.png`, `map-tran.png`, `map-le.png`, `map-nguyen.png`. The Lý variant is checked in the comparison using loaded runtime metrics; current progression does not select that era.

## Verification

Production build passes with the existing font and bundle-size warnings. The service worker includes the new pack. All 11 settlement layout cases pass; 42 live labels avoid 35 structures and each other. All four missing/corrupt artwork fallback cases pass, including the new capital paths.

All settlement visual-scale assertions pass. The broader suite remains 15/17 with the same pre-existing farmer/traveler comparison and obsolete expected count of 45 structural assets. The installed web-game client completed two action bursts with no browser errors; its map screenshots and text state were inspected. This smoke check does not claim land-selection coverage.
