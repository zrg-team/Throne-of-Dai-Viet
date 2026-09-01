# Vietnamese hero wardrobe: evidence and rendering rules

This note records the evidence used by the modular hero portrait system in `public/faces/` and
`src/ui/faces/wardrobe.ts`. It separates documented silhouettes from interpretation so later art
passes do not turn a plausible reconstruction into an uncited “fact.”

## Source method

The main synthesis is Trần Quang Đức's *Ngàn năm áo mũ* (2013), checked against the Vietnam
National Museum of History's description of the book and Liam C. Kelley's peer-reviewed review.
Kelley stresses that the book works from scattered Vietnamese, Chinese, European, and Korean
records, and that Vietnamese courts repeatedly made deliberate choices among earlier Song and
Ming forms. “Influenced by China” is therefore not a useful single costume category; date,
office, and occasion still matter.

- [Trần Quang Đức, *Ngàn năm áo mũ* — searchable scan](https://dilib.vn/img/pdf/10952-ngan-nam-ao-mu-thuviensach.vn.pdf)
- [Vietnam National Museum of History overview](https://baotanglichsu.vn/vi/Articles/3129/14969/ngan-nam-ao-mu.html)
- [Liam C. Kelley, “A History of Court and Commoner Clothing in Vietnam”](https://escholarship.org/uc/item/5b34s57s)

Museum object/exhibition descriptions are preferred for Nguyễn material, where more garments
and administrative records survive:

- [Vietnam National Museum of History: Nguyễn clothing regulations](https://vnmh.com.vn/vi/Articles/3091/73223/che-djo-y-quan-trieu-nguyen.html)
- [Hanoi Museum: early twentieth-century women's dress](https://baotanghanoi.com.vn/en/phu-nu-ha-noi-trong-trang-phuc-truyen-thong-dau-the-ki-20-ve-dep-cua-su-giao-thoi/)

## Era rules used in portraits

### Đinh and Tiền Lê, 968–1009 — low confidence

The evidence is too thin for a large, precise court wardrobe. Portraits therefore use topknots,
simple closed cloth, bands, two-flap wraps, rope or plain sashes, and a small conservative armor
pool. The specialized Đinh helm is explicitly a reconstruction, not an excavated uniform. It is
weighted for generals but never used as the sole historical signal.

Rule: prefer simple body fastenings and hair; treat detailed armor as interpretation.

### Lý, 1009–1225 — medium/high confidence for hair and court caps

Eleventh-century descriptions record dark clothing, blackened teeth, topknots, bare feet, and a
gold pin distinguishing the ruler in ordinary dress. Court regulation introduced Phốc Đầu and
boots for officials in 1059. The closed hair cloth described for Lý wear is not the later,
open-crown Nguyễn `khăn vấn`.

Rule: common portraits favor a visible topknot, bare head, or closed `khăn vuông`; ministers
favor Phốc Đầu. Open-crown `khăn vấn` is excluded from the Lý pool.

### Trần, 1225–1400 — high confidence for the main silhouette

Accounts describe ordinary black, four-panel, round-collar robes. Men commonly cut or shaved
their hair; officials covered the head with dark cloth. In 1301 the court standardized the
`mũ Đinh Tự`, replacing the Lý Phốc Đầu for ordinary court wear. A 1293 description gives the
visual recipe: dark blue lacquered silk, wired at the brow, high in front and curved back to the
nape; higher office added purple-blue streamers.

Rule: round collars, cropped/shaven heads, and weighted `mũ Đinh Tự`; no Lý Phốc Đầu in the
Trần minister pool and no later `khăn vấn` default.

### Lê, 1428–1789 — high confidence for regulated court dress

The court adopted new Ming-referenced ceremonial and working dress in stages: revised court
forms in 1437, rank badges (`bổ tử`) in 1471, Ô Sa rules in 1486, and revised Phốc Đầu wings and
ornament around 1500. Civilian dress continued to include cross-collared `áo giao lĩnh`, round
collars, simpler caps, bare heads, and many forms of `nón`.

Rule: this is the first portrait era allowed to attach bird/beast rank squares to a round-collar
robe. Ministers weight Phốc Đầu; governors and commoners can use Đinh Tự, Ô Sa, a plain cloth,
bare hair, or weather hats.

### Tây Sơn, 1778–1802 — medium/low confidence

Dedicated uniform evidence is much thinner than for the adjacent Lê and Nguyễn courts. The
game uses a conservative late-eighteenth-century field vocabulary: headbands, bare or simply
wrapped hair, conical hats, cross-collared garments, baldrics, and restrained armor options.

Rule: the field silhouette carries the era; avoid pretending a complete court system survives.

### Nguyễn, 1802–1945 — high confidence

Clothing was closely ranked by material, color, ornament, belt, badge, and cap. The National
Museum records round Phốc Đầu for civil officials and square Phốc Đầu for military officials;
most soldiers wore `nón` and went barefoot. The standing-collar, right-fastened five-panel
`áo ngũ thân`, folded/wound headcloth, and women's Nguyễn court dress are appropriate here.
Hanoi Museum's 1914–1920 photographs confirm a loose, low-standing-collar `áo ngũ thân`, head
wrap, and broad, flat `nón ba tầm` for late everyday/formal northern dress.

Rule: reserve `khăn đóng`, `khăn xếp`, great court wraps, `áo ngũ thân`, and `áo nhật bình` for
the Nguyễn era. A late photograph may validate a Nguyễn silhouette but cannot date it backward.

## Women's clothing

Yếm, skirt, cross/round-collar outer robes, and later four-panel forms provide the conservative
base vocabulary. Office is a weaker predictor of women's historical headwear than region,
occasion, and court status. The portrait rules therefore make visible hair and simple bands the
early default, introduce northern-delta `mỏ quạ` and broad festival hats only in later pools,
and reserve the largest court wraps and Nhật Bình ensemble for Nguyễn rank.

## What the generated images contribute

The two generated files are material studies, not costume evidence:

- `art_sources/faces/materials/handwoven-cloth.png` — neutral ramie/hemp/plain-silk weave.
- `art_sources/faces/materials/lacquered-gauze.png` — neutral tight gauze and brushed lacquer.

They were created with the built-in image generator as seamless, grayscale, object-free textures.
`scripts/build-faces.mjs` downsamples them, clips them into reviewed vector silhouettes, and
embeds the result once in `public/faces/atlas.svg`. Generated pixels may add fiber and lacquer
grain; they never choose a garment, change a silhouette, add an emblem, or assign an era.

This boundary is deliberate: surviving evidence is strong enough to constrain the shape and
chronology, while generated texture is useful only for the surface character that historical
texts usually do not preserve.

## Runtime contract

- Editable source: 279 measured SVG parts in `public/faces/`.
- Runtime source: `public/faces/atlas.svg` plus `atlas.json` — two requests, one GPU texture.
- Composition: `resolveHeroLook` chooses a documented pool, then the hero seed chooses within it.
- Display: the first composition is baked to one hero texture; subsequent render sites use one
  Phaser Image rather than rebuilding 10–20 hat, hair, garment, face, and mark objects.
- Theme and identity are part of the cache key, including the ruler's name, so a fixed `king` id
  cannot reuse the wrong face or the wrong cartouche after a theme change.

## Claims intentionally not made

- A modern film or reenactment is not primary evidence.
- A reconstructed helmet is not labeled an excavated Đại Việt uniform.
- One elite court outfit does not stand for all commoners or all women.
- `khăn vấn`, `áo dài`, `nón ba tầm`, and Nguyễn court crowns are not projected backward across
  the whole thousand-year roster.
