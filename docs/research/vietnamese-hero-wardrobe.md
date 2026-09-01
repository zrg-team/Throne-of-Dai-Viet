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

### Women's hair

Hair cannot be reconstructed as one timeless “Vietnamese bun.” The surviving record changes in
both form and quality by period, so the renderer uses complete hairstyles rather than randomly
combining a fringe, a loose fall, and a bun.

- **Đinh and earlier figures — low confidence:** surviving period-specific evidence is too thin
  to justify court fantasy. The portrait pool stays compact: a small coil, smooth centre part,
  face-framing hair, or a restrained nape knot. Trưng-era figures use this as an explicitly
  conservative bridge, not as a claim that tenth-century Đinh fashion describes the first century.
- **Lý — artifact-led:** decorated bricks, glazed amulet heads, and sculpted heads associated
  with Lý–Trần contexts preserve tall fan-shaped masses, large spiral/“snail” coils, hair hugging
  the sides of the face, and several centre-parted side-loop arrangements. The two-side form is
  kept to young portraits because the best reconstruction treats it as a possible attendant,
  servant, or child style rather than a universal adult fashion. See the artifact catalogue and
  reconstruction notes in [Đại Việt Phong Hoa's Lý–Trần survey](https://daivietphonghoa.wordpress.com/2021/02/06/cac-kieu-toc-cua-phu-nu-thoi-ly-tran/).
- **Trần — text-led:** Trần Cương Trung described women cutting the hair, retaining roughly three
  *thốn*, tying it at the crown, bending the end backward, binding it like a writing brush, and
  leaving no temple or nape fall. The game therefore weights a compact crown-tied brush and also
  allows the older coil or a braid wrapped around the head. The description and citations are
  reproduced in [*Ngàn năm áo mũ*, p. 73](https://dilib.vn/img/pdf/10952-ngan-nam-ao-mu-thuviensach.vn.pdf)
  and summarized against archaeological material by [Đại Việt Cổ Phong](https://daivietcophong.com/trang-phuc-va-trang-suc-thoi-ly-tran-qua-tu-lieu-khao-hoc/).
- **Lê — mixed short and long evidence:** a 1513 account describes hair slightly covering the
  forehead and reaching the nape, and post-Ming Lê policy explicitly restored short local hair.
  Later Lê–Trịnh images also support loose long hair. The pool consequently mixes a tapered
  neck-length cut, smooth nape knot, wrapped crown, and a restrained long centre-parted fall.
- **Tây Sơn — medium/low confidence:** the short reign does not support a precise court hair
  system. Late-eighteenth-century portraits share only conservative long, wrapped, and low-nape
  forms with the adjacent Lê and Nguyễn evidence.
- **Nguyễn — regional/photographic evidence:** northern women commonly smoothed and wrapped long
  hair around the head beneath silk or velvet cloth, while the low rear chignon remained a strong
  southern form. Early twentieth-century Hanoi photographs confirm the wrapped head treatment
  with traditional dress ([Hanoi Museum](https://baotanghanoi.com.vn/en/phu-nu-ha-noi-trong-trang-phuc-truyen-thong-dau-the-ki-20-ve-dep-cua-su-giao-thoi/));
  the game offers a wrapped crown, subtle nape bun, and occasional loose hair for younger/private
  portraits rather than one generic long curtain.

Rendering rule: rear coils and nape buns are painted behind the head, hairlines and face-framing
locks in front, and pins are anchored to the matching crown, band, brush, or left/right nape
location. A crown, coronet, or `nón` suppresses the extra pin so two ornaments cannot collide.

## What the generated images contribute

The two generated files are material studies, not costume evidence:

- `scripts/faces/materials/handwoven-cloth.png` — neutral ramie/hemp/plain-silk weave.
- `scripts/faces/materials/lacquered-gauze.png` — neutral tight gauze and brushed lacquer.

They were created with the built-in image generator as seamless, grayscale, object-free textures.
`scripts/build-faces.mjs` downsamples them, clips them into reviewed vector silhouettes, and
embeds the result once in `public/faces/atlas.svg`. Generated pixels may add fiber and lacquer
grain; they never choose a garment, change a silhouette, add an emblem, or assign an era.

This boundary is deliberate: surviving evidence is strong enough to constrain the shape and
chronology, while generated texture is useful only for the surface character that historical
texts usually do not preserve.

## Runtime contract

- Editable source: 295 measured SVG parts in `public/faces/`.
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
