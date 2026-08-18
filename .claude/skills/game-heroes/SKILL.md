---
name: game-heroes
description: Add or change champions in Mandate of Đại Việt — the 104-template roster, the runtime name generator, the 125 real historical figures, the bio layer, the throne's ruler pool, and the layered SVG portrait system (heads, hair, headwear, garments, rank badges). Covers the exact files to touch in order, the i18n invariant that crashes the game at import time, the wardrobe's era rules, and how to prove a new champion actually renders. Use when adding heroes, writing bios, drawing a new hat or robe, or debugging a portrait.
---

# Adding a champion

A champion is four things in four places, and all four have to land in the same commit or the
game does not boot:

| Part | File | Fails how |
|---|---|---|
| The record | [src/data/heroes.ts](../../../src/data/heroes.ts) | Missing → nobody can draw them |
| The words | [src/i18n/catalogs/heroes.ts](../../../src/i18n/catalogs/heroes.ts) | **Import-time throw, blank screen** |
| The life | [src/i18n/catalogs/heroBios.ts](../../../src/i18n/catalogs/heroBios.ts) | Falls back to a pooled bio |
| The face | [scripts/build-faces.mjs](../../../scripts/build-faces.mjs) + wardrobe | Silently draws nothing |

Verify with `node test_scripts/verify-heroes.mjs`, which is the gate for all of it.

## The roster's two halves

**76 invented champions** carry personal names — họ · tên đệm · tên, baked once so the Codex has
something stable to record — and draw a bio from a pool of 100 (25 per office). They are the
supporting cast: the office is already printed one line under the name on every card, so the name
itself must be a *name*. `Người Giữ Đê` was the old style and it read as a job listing.

**28 people out of the record** keep their own names, their own effects and their own bios. Twelve
are Legendary, sixteen Epic. Nothing below Epic is ever a real person — a Common draw named Trần
Hưng Đạo cheapens the one thing the list is for.

On top of that, [heroFactory.ts](../../../src/data/heroFactory.ts) mints champions at runtime so a
long run cannot empty the deck, drawing real figures from
[heroNames.ts](../../../src/data/heroNames.ts) — 125 of them — at Epic and Legendary only. That
list is filtered against `heroTemplates` by **name**, so a person authored as a template can never
also be generated. Add someone to both and the filter handles it; author them with a different
spelling and you get two of them.

## Recipe: a new champion

1. **`src/data/heroes.ts`** — append to `heroTemplates`:

   ```ts
   {
     id: 'tuan-tham-song-lo',        // kebab-case; `real-<slug>` for people out of the record
     sex: 'man',                     // REQUIRED — never left to a seed, see heroLook.ts
     era: 'le',                      // optional; unset means "pick from the common eras by seed"
     name: 'Trịnh Cảnh Vĩ',          // the Vietnamese name; a personal name unless historical
     type: 'general',                // general | governor | minister | agent
     rarity: 'Rare',                 // Common | Rare | Epic | Legendary
     upkeepGold: 7,
     description: t('heroes.tuan-tham-song-lo.description'),
     effect: t('heroes.tuan-tham-song-lo.effect'),
     cardBias: 'crisis',             // optional: biases the politics draw while seated
     signatureCardId: 'spy-candidate', // optional: MUST exist in data/politicsCards.ts
     stats: { martial: 36, logistics: 38, administration: 20, diplomacy: 44, loyalty: 40, renown: 32 },
     fatigue: 0,
   },
   ```

   `effect` and `description` are **flavour text — nothing parses them.** Mechanics come from
   `type` and `stats` (see `CourtSystem.ts`: martial → army power, logistics → recruit speed,
   administration → output, diplomacy → influence). Write effect text that is directionally true
   for the stat line, or the card lies.

2. **`src/i18n/catalogs/heroes.ts`** — add `.name`, `.description`, `.effect` to **both** `enHeroes`
   and `viHeroes`. `src/i18n/index.ts` calls `validateCatalogs()` at module scope and *throws* on a
   missing Vietnamese key, so a forgotten line is a blank game, not a fallback. A Vietnamese
   personal name is the same string in both catalogs — names are not translated.

3. **`src/i18n/catalogs/heroBios.ts`** — only if the champion is a real person. Add
   `heroes.<id>.bio` in both languages. Everyone else is served automatically from
   `heroes.bio.<type>.<0..24>` by a hash of the id.

4. **Balance the deck.** Keep the rarity mix near Common 27% / Rare 31% / Epic 31% / Legendary 11%
   and the offices near even — `verify-heroes.mjs` does not police this, but the Ascent gacha
   (`SummonSystem.pickHeroOfTier`) filters the deck by rarity, so a lopsided tier starves a roll
   and falls through to `mintHeroOfTier`.

## Recipe: a new ruler

The throne is a separate pool: `KINGS` in `heroes.ts`, 24 profiles × 6 temperaments. Add
`{ slug, name, sex, era, emphasis }`, then `heroes.king.<slug>.bio` in both languages of
`heroBios.ts`. Nothing else needs touching — the founding card draws three rulers at random from
the list.

Dragon Ascent opens on **one** card offering three foundings, each a ruler *and* the champion
who rises with them:

```
AscentPrompt { kind: 'founder', options: ['<kingSlug>:<heroId>', …] }
```

One string per option, so every harness that answers a prompt with `options[0]` keeps working;
`resolveAscentPrompt` splits on the colon, seats the ruler and recruits the champion. The screen
is drawn by hand in `ConquestUIScene.foundingCard` rather than through `optionCard` — that helper
lays out one text column and pins a *single-line* note to the card's foot, and two portraits plus
a wrapped effect line both overran it.

> The hero's id is the constant `'king'`, so **anything keyed on the id is keyed on nothing.**
> `heroBio` and `resolveHeroLook` both special-case it and key on the *name* instead. Six names
> and an id-seeded portrait was why every run opened on the same face.

## The portrait system

267 SVG parts in `public/faces/`, generated from **one file** —
[scripts/build-faces.mjs](../../../scripts/build-faces.mjs) — which authors every path in a single
design space, measures each with headless Chromium `getBBox`, crops with 2px padding, and emits
both the SVGs and `src/ui/faces/parts.generated.ts`.

```
build-faces.mjs   authors the geometry          →  public/faces/*.svg + parts.generated.ts
faces/wardrobe.ts answers "what may they wear"  →  pools, keyed on era first
faces/heroLook.ts answers "who is this person"  →  picks within the pools
FaceRenderer.ts   stacks whatever it is handed  →  knows nothing about heroes
```

**Never edit `parts.generated.ts`.** Run `node scripts/build-faces.mjs`; `yarn faces:check` is the
byte-for-byte gate.

### Adding a part

1. In `build-faces.mjs`, `part(key, layer, tint, body)` inside the right family. Layers:
   `10` plate · `20` robe · `21` hem · `22` sheen · `24` pauldron · `25` neck · `28` ears ·
   `30` head · `35/36` collar · `37` sash · `38` belt & rank badge · `39` buttons · `40` hair ·
   `41` knot · `42` ornament · `50/51` headwear · `52` earring · `60` brow · `62` eyes ·
   `64` nose · `66` mouth · `70` beard · `72–74` marks · `80` rank seal.
2. `tint` is the colour slot the run multiplies the part by — draw it **white** and let the run
   colour it (`skin`, `hair`, `robe`, `robeDark`, `robeLight`, …). Only ship a fixed colour when
   the thing has one: black lacquer, a gold coronet, a red yếm. Six skin tones are one file.
3. Add it to a pool in `wardrobe.ts` — that is the only place that decides *who may wear it*.
4. `node scripts/build-faces.mjs` then `node test_scripts/verify-heroes.mjs`.
5. **Look at it**: `node test_scripts/shot-portraits.mjs` writes contact sheets to
   `output/web-game/`. Open the PNG. Every failure here is visual.

### The design space

`VIEW` is 136×174 centred on the portrait. `W`/`H` are the canonical head (58×78), `TOP` = −51 is
the crown, `CHIN` = 27, `NECK` = 37, `SHY` = 67 is the shoulder line, `EYE_Y` = −18. Anything past
±68 or above −86 escapes the plate. Positions in the manifest are *measured*, so a part can be
redrawn by hand as long as its footprint stays put.

### What actually breaks

- **A silhouette that survives at 42 px is a shape, not a drawing.** A stroked crane on a 22-unit
  rank badge averages to a grey smudge; a filled body with one distinguishing tag reads. Fourteen
  narrow lamellar plates read as a beaded tiara, four wide ones read as armour.
- **Nothing may resemble Western dress.** A black cap with an overhanging brim is a bowler. `mũ
  bình đính` is flat-topped and no wider at the base than the head.
- **Anatomy has to hold at a bust crop.** A plaque belt drawn across the chest is a necklace of
  teeth; it belongs at the bottom edge of the frame, where a waist actually is.
- **A part nothing wears is dead weight** — 267 files all load in `preloadHeroFaces`.

### The wardrobe's rules

Era first, always. Nguyễn Phúc Khoát's 1744 reform replaced the crossed lapel of the **áo giao
lĩnh** with the standing collar of the **áo ngũ thân**, so an official in the wrong century's
collar is as plainly wrong as one in the wrong hat. Trần men cropped their hair — Chinese envoys
remarked on it. The 1499 regulations wrote the dragonfly-wing length of the **mũ phốc đầu** into
law, which is why rank lengthens it. **Bổ tử** rank badges put birds on civil offices and beasts on
military ones, and only fit on the round-collar **áo viên lĩnh**, which is the point of that collar.

> **The rule `heroLook.ts` exists to enforce: the seed never decides who someone is.** Sex,
> monastic vows, office and rank come off the hero's own data and select a *wardrobe*; only then
> does the hash pick within it. Before this, every named woman in the roster rendered with a beard.

## Proving it

```bash
npx tsc --noEmit                              # ~4s; necessary, nowhere near sufficient
yarn faces:check                              # the parts on disk match the generator
node test_scripts/verify-heroes.mjs           # 15 checks: deck, wardrobe, throne, bios, founder card
node test_scripts/shot-portraits.mjs          # contact sheets — then open the PNG and look
node test_scripts/smoke.mjs                   # the game still boots in every mode
```

All of these take `DEV_URL`; port 5173 is frequently another project on this machine. Check with
`curl -s http://localhost:5173/ | grep -q "Mandate of"` before trusting it.
