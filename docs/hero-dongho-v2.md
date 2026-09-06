# Đông Hồ hero wardrobe — v2

`public/faces-dongho-v2/` is the default portrait pack. It preserves the accepted v1 faces and hairstyles and redraws **all 140 clothing, headwear and accessory parts** with built-in ImageGen. `public/faces-dongho-v1/` and the original SVG pack remain available.

## What changed

- Soft headbands have folded fabric, side knots and tapered tails, including the replacement for `hat-band.png`.
- Fourteen primary garments are complete bust assemblies: continuous collars, neck openings, shoulders and drape. The renderer selects one coherent outfit instead of layering unrelated collar strips over a rounded torso. Open-panel garments retain a separate under-robe.
- Armour, caps, nón, sashes, belts, fasteners, insignia, pins, combs and earrings have generated PNG resources. Circular earrings are packed independently within their pair so their proportions survive changes in spacing.
- New headwear anchors fit the actual drawings. The wide quai-thao hat has long side ribbons meeting beneath the chin; its ribbons no longer cross the eyes. The tied mỏ-quạ kerchief uses a side knot.
- Nguyễn generals receive period-appropriate cloth/lacquer headwear and robes instead of automatic medieval armour. Early rank badges and the generic civil dragon badge are excluded or replaced in the new presentation. Lý/Trần court-cap pools have a narrower evidence-based selection.

## Vietnamese research

Read [the v2 research and limitations](research/vietnamese-wardrobe-v2.md) alongside the [earlier findings](research/vietnamese-portrait-research-findings.md). New work included the National Museum's Nguyễn garment collection, actual catalogue photographs and additional targeted armour/cap sections in *Ngàn năm áo mũ*. The project's petition print supplies drawing style only.

These are historically informed game illustrations. Exact early armour shapes remain uncertain, broad era pools simplify regional/ceremonial differences, and game rarity does not establish a historical court grade. Unsupported crown IDs have conservative generated compatibility resources but remain excluded from normal Đông Hồ presentation. No Chinese costume image was used as a Vietnamese clothing reference.

## Switching and saved looks

- `?heroArt=dongho-v2` — new wardrobe.
- `?heroArt=dongho-v1` — previous Đông Hồ pack.
- `?heroArt=legacy` — original SVG art.

Use `&heroArt=...` when the URL already contains a query. `VITE_HERO_FACE_ART_PACK` sets a build default; `setHeroFaceArtPack()` persists a selection for the next reload. URL selection wins over saved selection, then build setting, then code default.

All **296 saved part IDs** remain valid. The new wardrobe presentation operates on a copy and does not rewrite stored looks. Source geometry is in `src/ui/faces/dongho-v2.defs.json`; `src/ui/faces/donghoFit.ts` fits it to the selected head. Earlier packs keep their original geometry.

## Fit correction after creator review

- All 46 supported hats use explicit head-facing band landmarks and the measured forehead edges of all 16 generated head shapes. Transparent canvas padding, side knots and wings do not determine hat size. Crown height stays inside the portrait; kerchief side folds and cheek guards clear the eyes.
- Phốc đầu caps fit their crowns separately from their wings, using three atlas slices before the usual portrait bake. Long wings remain within the cartouche on broad heads.
- Hair, eyebrows and facial features follow head width. Ears and earrings move independently without stretching their shapes. Closed headwear hides crown buns and ornaments; open khăn vấn and cloth bands retain visible tied hair.
- All seven sash exports use taller attachment canvases, restoring folds and hanging ends from the existing reviewed ImageGen master. They sit at the lower torso and no longer stack over an unrelated second waist belt. No new costume design or historical attribution was introduced by this placement correction.
- Creator captions and garment-grid labels describe the visible v2 garment, including armour and Nguyễn robe substitutions. Stored choices and the two earlier art versions remain intact.

## Special historical heroes

All 143 special-hero entries now use deliberate period and life-stage profiles, with consistent faces across alternate titles and rarity levels. Read the [historical review and evidence limits](research/special-hero-portraits.md), [complete inventory](research/special-hero-portrait-inventory.md), or open the [searchable portrait gallery](../output/hero-dongho-v2/special/gallery.html). Rebuild the review with `npm run verify:special-heroes`.

## Resources and performance

The pack contains 272 ImageGen-origin PNGs: **140 wardrobe pieces redrawn in v2**, plus 132 accepted v1 anatomy/hair components. Another 24 non-wardrobe compatibility resources are inherited unchanged, including unused plates/marks. All 156 non-wardrobe PNGs are byte-identical to v1. Per-part origins and source bounds are recorded in `provenance.json`.

Normal portrait loading requests only `atlas.png` and `atlas.json`. Individual source PNGs are excluded from service-worker precaching. The atlas is **2048 × 1636**, approximately **12.78 MiB** of RGBA texture memory, compared with 16 MiB for the original SVG atlas after decoding. The PNG download is larger; no loading-speed improvement is claimed. Each completed hero remains one cached image.

## Rebuild and review

- `npm run faces:dongho-v2` repacks the committed PNGs without ImageGen or an API key.
- `node scripts/faces/dongho-v2-pack.mjs prepare` recreates alignment guides and the initial prompt manifest.
- `node scripts/faces/dongho-v2-pack.mjs export` cuts the reviewed masters in `output/hero-dongho-v2/masters/`. Production processing extracts magenta, discards the isolated jewellery-sheet grid, skips one surplus wrap cell, preserves earring aspect ratios, removes residual matte pixels and packs the PNGs. It does not draw the artwork.
- [Initial prompts](hero-dongho-v2-prompts.json), [initial generation log](hero-dongho-v2-generation-log.json), [reviewed master selection](hero-dongho-v2-reviewed-masters.json) and [final tied-headwear correction](hero-dongho-v2-fit-refinement.json) record generation and refinement. The latter runs last and replaces two earlier cuts.
- `npm run verify:face-art` checks all three loaders, frame coverage, version switching, cache reuse, saved-look immutability and current gameplay/roster screens.
- `npm run verify:wardrobe-v2` checks 140 changed wardrobe PNGs, 156 unchanged inherited PNGs, opaque artwork/transparency, residual magenta, 367 sampled outfits and all **10,304 combinations of 16 heads × 46 supported hats × 14 eye styles** using fitted pixel masks. This expands the earlier sampled eye-only check, which missed head-width problems.
- `npm run verify:hero-fit-v2` checks **53,232 creator combinations** across sex, age, era, court/war register, rank, hat, hair and face choices (cycling all eight dresses). It captures all hats on narrow, ordinary and broad heads, renders three actual creator screens and exercises face-grid selection. Review outputs: `output/hero-dongho-v2/fit/`.
- The original layered-collar fit test remains explicitly scoped to v1/legacy. Its geometric model does not apply to the new complete-garment frames.

Reviewed captures are in `output/hero-dongho-v2/review/`. The larger gallery includes women, monks, Nguyễn examples and generated heroes; small roster sheets were also inspected. The broad pre-existing `verify-heroes` opening-flow incompatibility documented in the v1 notes is not represented as a passing check here.
