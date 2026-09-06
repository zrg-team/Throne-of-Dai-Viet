# Vietnamese hero portraits: research before image generation

6 September 2026. Research only; no new image generation or renderer changes in this pass.

The visual goal remains beautiful Đông Hồ-inspired portraits consistent with the game. Historical credibility must come from Vietnamese evidence tied to the depicted person, period, place, and social context. A Vietnamese name in a generation prompt does not establish costume accuracy.

## 1. Evidence method

These sources have different jobs:

| Evidence | Appropriate use | Limit |
|---|---|---|
| Museum object records and dated photographs | Check an object's shape, wearer, location, and date | The depicted person's lifetime and the object's production date may differ |
| Historical accounts, consulted through a scholarly study | Check terminology, regulations, chronology, and described customs | A text description may not establish an exact frontal silhouette |
| Scholarly review | Check the scope and interpretation of a study | Does not replace the study's item-level evidence |
| Đông Hồ prints and craft documentation | Establish the drawing and printing language | A historical hero in a later print is not automatically a contemporary likeness |
| Modern reconstruction | Identify a proposal and its cited evidence | Invented jewelry, film armor, and restored details remain interpretations |

The museum [overview of *Ngàn năm áo mũ*](https://baotanglichsu.vn/vi/Articles/3129/14969/ngan-nam-ao-mu.html) and [Kelley's review](https://escholarship.org/uc/item/5b34s57s) were read in the preceding pass. Further targeted reading now covered tattoo placement, head wrapping, the regional 1744 reform, and the distinction between recorded features and reconstructed forms. The whole book has not been read.

## 2. What the Đông Hồ references establish

The [National Museum's collection article](https://baotanglichsu.vn/VI/Articles/3096/19432/tim-hieu-ve-dong-tranh-dan-gian-djong-ho.html) describes separate line and color blocks, dó paper with a shell-powder coating, and plant/mineral pigments. Its collection photographs were inspected in the browser, including the wrestling print and animal/procession prints.

Visual observations from those displayed examples: faces are expressed with economical marks; contours carry anatomy; large bounded color areas carry the figure; poses and expressions are legible without modeled lighting. The visible paper texture is not a reason to cover every face with dense scratches. These are observations of the inspected examples, not an exhaustive claim about all Đông Hồ work.

[Phan Cẩm Thượng's discussion, republished by the museum](https://baotanglichsu.vn/VI/Articles/3101/13861/ban-tiep-ve-nghe-thuat-in-khac-go.html), distinguishes a small set of printed colors from hand-painted tonal shading, particularly in Hàng Trống. It also acknowledges variation and later crossover. Therefore the game should specify the Đông Hồ printed-block treatment it wants, rather than treating every Vietnamese folk painting as interchangeable.

The [museum's introduction to Lê Bích's book](https://baotanglichsu.vn/vi/Articles/3129/70983/ra-mat-sach-tu-lieu-ve-tranh-djong-ho.html) mentions overprinting and other craft techniques. “Flat color” is a useful direction for this game, not a claim that traditional practice has no technical variation.

**Art direction derived for the game:** decisive dark contours, readable pigment areas, restrained interior marks, expressive human features, and subtle surface texture. Keep cinnabar, ochre, leaf green, indigo, and light paper coherent with the existing project. Exact digital colors are project choices, not measured historical pigment standards. Avoid metallic rendering, glowing gold, photorealistic facial shading, or heavy artificial aging.

## 3. People and facial appearance

There is no justified single “Vietnamese face” template. The [Vietnam Museum of Ethnology's collection guide](https://www.vme.org.vn/modules/frontend/themes/vme.org.vn/assets/files/To-roi-VN.pdf) presents cultural and portrait diversity across Vietnam's 54 recognized ethnic groups. That is modern ethnographic context, not a medieval costume catalogue. Do not mix a group's ornaments into another person's wardrobe merely because both are from Vietnam.

[Hanoi Museum's article](https://baotanghanoi.com.vn/en/phu-nu-ha-noi-trong-trang-phuc-truyen-thong-dau-the-ki-20-ve-dep-cua-su-giao-thoi/) supplies photographs credited to the Albert Kahn Museum and dated 1914–1920. The tứ thân and ngũ thân examples were visually inspected. They show different garment structures with broad hats and restrained head wrapping; the text describes loose ngũ thân construction, a low standing collar, and right-side fastening. These photographs support late northern dress, not an early Trần or Đinh wardrobe. Lighting and photographic reproduction also prevent treating sampled skin colors as exact reference pigments.

The [Cultural Heritage Department's national-treasure listing](https://dsvh.gov.vn/thu-tuong-chinh-phu-ky-quyet-dinh-cong-nhan-bao-vat-quoc-gia-nam-2020-3300) dates the Huệ Quang statue of Trần Nhân Tông to the seventeenth century. A portrait can acknowledge such later iconography, but must not present it as a verified lifetime likeness.

For generated faces: vary age, expression, proportions, and complexion without assigning ethnicity from facial geometry. Blackened teeth, particular hair arrangements, tattoos, and monastic features need contextual evidence; they must not become universal ethnic markers.

## 4. Clothing and hair: working evidence matrix

This is a scope map for further part-level decisions, not approval of every current costume.

| Group | Usable basis | Remaining restriction |
|---|---|---|
| Pre-Đinh named heroes | Person-specific historical research and explicitly identified later depictions | The game's `dinh` fallback does not date their clothing |
| Đinh / Tiền Lê | Existing dossier identifies its own reconstruction limits | Film-derived ornate armor is not verified tenth-century dress |
| Lý | Source-described closed head wrapping and documented court-cap chronology | Do not substitute a later open-crown headwrap |
| Trần | Source-described Đinh Tự caps and period hair practices; ceramic figure evidence | A description or fragment does not authenticate all helmet variants |
| Lê and Lê–Trịnh | Date-specific court regulations and commoner evidence | A centuries-long category needs finer dating for principal heroes |
| Tây Sơn | Late-eighteenth-century evidence, checked for region and occasion | Generic red warpaint and fantasy field uniforms lack support here |
| Nguyễn | Surviving garment/administrative evidence and dated photographs | Separate everyday, official, ceremonial, civil, military, and women's court dress |

The [Nguyễn clothing exhibition](https://vnmh.com.vn/vi/Articles/3091/73223/che-djo-y-quan-trieu-nguyen.html), organized with the National Archives, distinguishes rank and occasion, including different civil and military Phốc Đầu forms. A ceremonial outfit should not become every official's everyday uniform.

The [museum's discussion of Trần brown-patterned ceramics](https://baotanglichsu.vn/VI/Articles/3101/71561/dje-tai-tren-gom-hoa-nau-djai-viet-tinh-than-thuong-vo-va-khat-vong-thai-binh.html) describes bare-torso, wrapped-head martial figures alongside clothed officials. It provides a Vietnamese material reference and an interpretation of the scenes; it does not prove all soldiers lacked armor.

[The nón reconstruction account](https://baotanglichsu.vn/VI/Articles/3096/19332/dji-tim-chiec-non-co-cua-nguoi-viet.html), a craftsman interview republished by the museum, emphasizes differences by period, place, and use. Even recreating nón ba tầm required estimates from images when molds and measurements were absent. A generic conical hat is consequently not a sufficient substitute for every `hat-non-*` part.

[Đại Việt Phong Hoa's Lý–Trần hair survey](https://daivietphonghoa.wordpress.com/2021/02/06/cac-kieu-toc-cua-phu-nu-thoi-ly-tran/) is useful precisely because it states its limitations: it identifies artifact photographs but also calls particular jewelry additions creative choices and some social identifications hypotheses. Its modern finished illustrations must not be mistaken for the original objects. Use the cited artifact for the supported hair mass; do not automatically import all added ornaments.

## 5. Problems to resolve in the current asset assumptions

These are research findings, not code changes made in this pass.

| Existing behavior or claim | Why it needs review before generation |
|---|---|
| Early figures including Trưng Nữ Vương share `era: 'dinh'` | This is a software fallback spanning very different periods, not historical evidence |
| Đinh fan-scale armor, beast-mask ornament, and related parts | The local dossier traces details to a modern film. Preserve that provenance; do not promote it to fact |
| Comments call both round-collar robes and rank badges “Lê inventions” | The same wardrobe research discusses earlier round collars. Distinguish garment construction from later regulated insignia |
| `mark-tattoo-*` is applied broadly to Lý/Trần court faces | The reading distinguishes body tattoos and specific military forehead inscriptions; it does not support arbitrary cheek motifs for every court role |
| `mark-warpaint` for Tây Sơn generals | No adequate supporting source was established in this pass |
| `scalp-dots` / `scalp-dots-nine` chosen by rarity | A game rarity is not evidence of a religious initiation practice or its number of marks |
| `hat-crown-seven` and phoenix crowns in broad women's pools | Exact ornament, wearer, date, and occasion need item-level support; “high rank” is insufficient |
| One 1744 change described as a nationwide replacement | The reading concerns Đàng Trong; adoption and later changes require regional chronology |
| Preserving every current SVG silhouette as historically safe | Existing drawings are implementation artifacts. Each cultural claim still needs evidence |

Absence of support in this pass does not prove that a feature never existed. It means that feature is not ready to be represented as researched historical detail.

## 6. Requirements before a component is generated

Each historically meaningful component needs a short reference record: part ID; Vietnamese name; intended person/group; period and region; rank/occasion; source URL and object/caption or passage; what the source actually establishes; reconstruction limits; and the specific silhouette, closure, ornament, and hair arrangement to preserve.

Use two clearly labeled reference roles: **Đông Hồ drawing treatment** and **Vietnamese costume/appearance evidence**. A style image cannot authenticate clothing. A costume photograph cannot justify replacing the print treatment with photographic shading.

Do not use generic Chinese court costumes, Qing queues, drama armor, or generic Hanfu as Vietnamese substitutes. Where a historical form is shared, require evidence of its particular Vietnamese use. Likewise, reject Western crown shapes, modern salon hair, and unsupported ornate jewelry.

For assembly, preserve named parts and their meaningful distinctions. Do not collapse a large historical wardrobe into a few interchangeable generated hats. Check head, neck, collar, hair, and headwear together at actual portrait size, as well as separately. Technical compatibility and historical credibility both need review.

## Research status

The medium, source method, representative clothing distinctions, and current risk areas are now documented. Specific royal crowns, armor variants, some early-period hair, tattoo motifs, and monastic marks still need individual source records before generation. Museum print photographs and dated Hanoi clothing photographs were visually inspected; the book illustrations were not, because the PDF screenshot fetch failed. No claim is made that every existing asset has been validated.

The original raster-portrait implementation request remains outstanding. Further image generation is deferred while these reference decisions are resolved.
