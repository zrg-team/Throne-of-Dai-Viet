# Cờ hiệu: evidence and banner-editor direction

Researched 6 September 2026 for the Cờ Hiệu page. “Co Hieu” in the request is understood from the screenshot as **cờ hiệu**, identifying or signalling banners, rather than the name of a kingdom.

## What the sources support

- **Royal signalling:** the Vietnam National Authority of Tourism's [Kỳ Đài Huế entry](https://vietnamtourism.vn/index.php/tourism/items/445/5) describes flags signalling ceremonies, court celebrations, royal journeys and urgent reports under the Nguyễn. This supports the role of a standard as an identifier and signal. The indexed entry was readable; the full-page fetch failed. It does not establish one shared design across Vietnamese dynasties.
- **Living ceremonial use:** the Ministry of Culture's [account of the Tiên Công procession](https://bvhttdl.gov.vn/quang-ninh-doc-dao-le-hoi-ruoc-nguoi-song-len-mieu-tien-cong-20190212142310378.htm) describes two rows of ngũ sắc flags in a local procession. This corroborates ceremonial practice, not the exact appearance of a medieval military flag.
- **Shape and bands:** the Ngô family association's [discussion of ngũ sắc and lineage flags](https://ngotoc.vn/Nghien-cuu-Trao-doi/ban-ve-co-ngu-sac-va-co-ho-toc-315.html) describes a square flag, concentric coloured bands, and flame-shaped fringe. It also discusses variation in centre colours and small triangular flags. This is a contemporary community interpretation, not an excavated object or a court regulation. Its speculative early origin and assertions about universal colour order are not adopted here. Modern Ngô lineage practice is not evidence for Ngô Quyền's flag.
- **A documented Vietnamese motif:** the National Museum of History's [Ngọc Lũ bronze drum catalogue](https://baotanglichsu.vn/vi/Articles/1001/19707/bao-vat-quoc-gia-viet-nam-trong-djong-ngoc-lu.html) identifies an Đông Sơn object approximately 2,000–2,500 years old, with a fourteen-ray sun and surrounding decorative bands. The editor's drum adapts the sun and geometric rings. This is evidence for the motif, not evidence that the Ngô, Đinh, Lý or Trần flew this device on a flag.

## Decisions applied to the page

The standard is a game design inspired by Vietnamese ceremonial cloth: square field, a pole, nested border bands and a flame-cut perimeter. Two player-selected colours are retained. It is deliberately described as inspired by cờ lễ Việt, **not** labelled an authentic five-colour ngũ sắc flag or a historical national flag.

The old downward-pointing shield outline and generic card glyphs are replaced by a dedicated set of six illustrated devices: bronze drum, command flag, sword, rice, bamboo and sacred turtle. Their short meanings are game writing. They do not claim a historic dynasty-to-emblem mapping. No invented Hán characters, dragon rank claims or modern national flags are used.

The old saved `crown` slot now displays the bronze drum, replacing the Western-looking crown in this editor. The other five identifiers, all stored colour values, and both earned unlocks retain their existing keys. Other uses of the tactical crown icon are unchanged. Older or unfamiliar emblem ids render a drum as a safe fallback. There is no storage migration.

The sentence implying Nhà Ngô historically used Đinh-style troops is removed from this page. The underlying army-era assignment remains the game's visual convention. House colours are likewise game defaults, freely adjustable by the player.

## Implementation and review

- Dedicated vector devices use the existing ink/pigment palette and Phaser renderer; no new downloads or image atlas are needed.
- A larger banner is paired with the house name and selected motif. Named swatches, ticks, a labelled 3×2 motif grid, visible earned-lock conditions and a compact page heading improve recognition at phone size.
- Edits keep the scroll position in both the Temple and coronation hosts. Saving explicitly says “Giữ thay đổi” / “Save changes”.
- The shared house-banner renderer carries the revised art into the Dynasty and coronation/next-reign surfaces. Army-map standards still use their existing system.
- Visuals and interaction reports are saved under `output/banner-editor/`. Run `test_scripts/verify/verify-banner-editor.mjs` against the project's development server to reproduce the editor checks.
