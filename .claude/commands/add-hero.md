---
description: Add champions to the roster — record, words, bio and portrait — then prove they render
argument-hint: "[how many, or a description: \"3 Trần-era naval generals\"]"
allowed-tools: Bash, Read, Edit, Write, Glob, Grep, Skill
---

Add one or more champions to Mandate of Đại Việt. Request: `$ARGUMENTS`

Load the `game-heroes` skill first — it has the file order, the i18n invariant that takes the
game down at import time, the wardrobe's era rules and the portrait design space. Follow it
rather than guessing.

Work in this order and do not skip the last two:

1. **Decide what is missing.** Read `src/data/heroes.ts` and count the roster by office and
   rarity before adding. Keep the mix near Common 27% / Rare 31% / Epic 31% / Legendary 11% and
   the four offices near even — the Ascent gacha filters the deck by rarity, so a starved tier
   falls through to a generated champion instead of an authored one.

2. **Author the record** in `src/data/heroes.ts`. Invented champions get a personal name — họ ·
   tên đệm · tên — never an office label; the card already prints the office one line below.
   Only Epic and Legendary may be real people, and those use `real-<slug>` ids.

3. **Write the words** into **both** `enHeroes` and `viHeroes` in
   `src/i18n/catalogs/heroes.ts`, in the same edit. A missing Vietnamese key throws at module
   scope and the game boots to a blank screen.

4. **Write the life.** A real person gets `heroes.<id>.bio` in both languages of
   `src/i18n/catalogs/heroBios.ts`; anyone invented is served from the pooled bios automatically
   and needs nothing. Ground every historical claim in something that actually happened — the
   bios already there are the register to match.

5. **Draw anything the wardrobe lacks.** If the champion needs a hat, collar or hairstyle the
   library does not have, add it to `scripts/build-faces.mjs`, wire it into a pool in
   `src/ui/faces/wardrobe.ts`, and re-run `node scripts/build-faces.mjs`.

6. **Prove it.** `npx tsc --noEmit`, then `yarn faces:check`, then
   `node test_scripts/verify-heroes.mjs` — all 15 checks must pass.

7. **Look at it.** `node test_scripts/shot-portraits.mjs` and actually read the PNG in
   `output/web-game/`. A portrait bug compiles perfectly and passes every check; the only thing
   that catches it is your eyes on the contact sheet.

Every harness takes `DEV_URL`. Port 5173 is often a different project on this machine — check
with `curl -s http://localhost:5173/ | grep -q "Mandate of"` and use the real port if not.

Report what you added, the roster's new shape by office and rarity, and the harness results.
