# Đông Hồ hero parts — v1

This earlier hero pack uses `public/faces-dongho-v1/` and remains selectable. [V2](hero-dongho-v2.md) is now the default and redraws the entire wardrobe. The original `public/faces/` SVG drawings and atlas are preserved. This is a modular game illustration pack informed by the Vietnamese research, not a set of authenticated historical likenesses.

## Contents and switching

- **296 individually editable PNG parts:** 187 newly drawn with built-in ImageGen; 109 raster exports of the existing wardrobe/accessory drawings, explicitly labeled `legacy-raster-compatibility` in `provenance.json`.
- Generated groups: 16 head shapes, 6 neck/ear pieces, 28 eye/brow pairs, 28 nose/mouth pieces, 14 facial-hair pieces, 40 hair/bun pieces, 39 cloth components, and 16 headwrap/cap components.
- `atlas.png` and `atlas.json` are the only portrait resources requested during normal loading. No SVG portrait decoding or individual-part requests occur for this pack.
- Open `?heroArt=dongho-v1` for the new version or `?heroArt=legacy` for the previous one. Append with `&` if the URL already has a query.
- Set `VITE_HERO_FACE_ART_PACK=legacy` for a build default. The code default is `DEFAULT_HERO_FACE_ART_PACK` in `src/ui/faces/artPack.ts`.
- The optional `setHeroFaceArtPack()` helper persists a selection for the next reload. Priority is URL → saved selection → build setting → code default. Selecting portrait art does not switch map art or rewrite hero saves.

## Research and component decisions

The [research findings](research/vietnamese-portrait-research-findings.md) and [acceptance rules](research/dong-ho-hero-art-direction.md) govern this pass. The project's `petition-v1.webp` was supplied to ImageGen **only as a drawing-style reference**. Existing component sheets supplied alignment and shape constraints; they were not treated as primary historical evidence.

| Components | Reference record and limits | Preserved constraints |
|---|---|---|
| Head, neck, ears, eyes, brows, nose, mouth, beard | Human anatomy and the museum Đông Hồ print observations in the research report. No ethnic identity, precise age, or lifetime likeness is inferred from face geometry. Lacquered-mouth variants retain black teeth; their inherited assignment rules are not new historical validation. | Distinct proportions, paired spacing, expression, separate layers, opaque skin masks, no added ornaments |
| Hair masses, knots and buns | [Vietnamese wardrobe dossier](research/vietnamese-hero-wardrobe.md), with the expanded report's cautions about reconstructed Lý–Trần arrangements. Current assignments are retained; exact reconstructions remain provisional. | Front/rear separation, partings, knot position and silhouette; no new pins, jewelry or modern salon details |
| Crossed, round, open-panel and standing collars; robe bases | Clothing construction discussed in the wardrobe dossier. The [Hanoi Museum photographs](https://baotanghanoi.com.vn/en/phu-nu-ha-noi-trong-trang-phuc-truyen-thong-dau-the-ki-20-ve-dep-cua-su-giao-thoi/) are late northern evidence, not medieval dating. | Original crossed-lapel direction, right fastening, round/standing distinction, panel holes, neck/shoulder attachment; no new heraldry |
| Yếm and monastic cloth components | Context and limits in the research dossier; simplified components inherit existing role assignments. These are illustrations, not claims of surviving complete outfits. | Straps, panel openings, separate overlays, limited pigment colors |
| `hat-khanvan*`, `hat-khandong`, `hat-khanxep`, `hat-moqua*` | Late Vietnamese head-wrapping references in the report and the existing Nguyễn/late-era resolver. Their exact simplified silhouettes remain game reconstructions. | Open wound cloth distinct from closed cloth; fold count/height, brown/indigo variants, scarf opening and tie |
| `hat-khanvuong` | Source-described closed hair covering in the Lý wardrobe study; not a later open Nguyễn wrap. | Closed form and rear cloth extension |
| `hat-dinhtu*` | Trần source descriptions consulted in *Ngàn năm áo mũ*: raised front, rear curve and described streamers; exact frontal drawing remains a reconstruction. | Shape, rear extension, muted purple/blue streamers only on the streamer variant |
| `hat-phocdau-*` | Vietnamese court-use chronology in the dossier and Nguyễn exhibition distinctions. Shared historical forms require Vietnamese-use evidence; no Chinese drama reference was supplied. | Each original wing length and cap proportion; no added dragon or phoenix ornament |
| Other armor, nón, ceremonial garments and accessories | **Compatibility drawings, not newly generated or newly authenticated.** This includes film-derived Đinh armor and other unresolved details identified in research. | Original IDs and geometry remain available; provenance records every entry |

The new renderer omits arbitrary court tattoos, warpaint, branding, scalp initiation dots, and unsupported coronet/crown overlays. The hero creator filters those unsupported headwear options too, so its stepper does not offer invisible choices. The old shaven-scalp highlight is also omitted because the new complete head silhouette already supplies a bald scalp. Legacy rendering retains the original behavior. Source/saved part lists are not mutated.

## Assembly and performance

Individual PNGs retain 3× source detail. The packed atlas is 2× at **2048 × 1422**, using about **11.1 MiB** of RGBA texture memory versus **16 MiB** for the old 2048-square atlas, a 30.6% reduction. The new PNG download is larger than the compact old SVG atlas. Runtime SVG parsing is eliminated; loading-speed changes have not been benchmarked.

Completed hero portraits still bake once into a single cached image at 1.5×. Cache keys include the art-pack version, map theme, hero identity and customized founder look. PNG components keep the original named part IDs and design-space centers. A future version can be registered independently without overwriting this one.

The service worker treats runtime face atlases as optional art and excludes the editable source PNGs/provenance from precaching, avoiding a second download of the same artwork.

## Rebuild and review

- `npm run faces:dongho` repacks the committed PNG parts. It works without ImageGen, original generated masters or an API key.
- `node scripts/faces/dongho-pack.mjs prepare` recreates alignment sheets under `output/hero-dongho-v1/references/`.
- `node scripts/faces/dongho-pack.mjs export` recuts the reviewed ImageGen masters under `output/hero-dongho-v1/masters/`. The script only extracts production mattes, separates components, resizes and packs; artwork is generated by the built-in tool.
- [Prompt set](hero-dongho-v1-prompts.json) and [selected generation log](hero-dongho-v1-generation-log.json) record generation inputs and replacements. Hollow heads, an incomplete eye pair and incorrect tooth colors were rejected and regenerated. Early pre-research drafts remain excluded.
- `npm run verify:face-art` verifies both pack loaders, all PNG/frame IDs, cache reuse, non-mutating saved-look previews, version selection and gameplay/roster rendering. Set `DEV_URL` if the dev server is not on port 5180.
- Visual review captures are in `output/hero-dongho-v1/review/`, including matching legacy/new portraits and real roster screens.
- Final checks passed: production build, both-pack verification, the web-game smoke client, and all three portrait-fit checks across 35 worn parts (worst overhang 11, within the existing 12-unit budget). No browser errors appeared in those checks. Build emitted the existing font-path and bundle-size warnings.

The wider `verify-heroes.mjs` suite currently stops in its old opening-flow test at `first.options[0]`, after a coronation that no longer supplies that expected prompt. This is outside the portrait loader checks; the dedicated face-art suite tests the actual current game flow separately.
