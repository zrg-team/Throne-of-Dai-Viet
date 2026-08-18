---
name: game-mechanics
description: Core gameplay of Mandate of Đại Việt — the four modes and their factories, both real-time tick loops in call order, the resource economy and its formulas, the three separate combat resolvers, the Dragon Ascent roguelite loop (waves, ambition, cards, gacha, doctrine, autopilot), the Chronicle story engine, and ordered recipes for adding units, heroes, edicts, cards and stories. Use when changing rules, balance, systems, or content.
---

# How the game plays

Four modes, real-time (not turn-based), all sharing one `GameState` and one systems layer.
Systems are plain functions over state with **no Phaser imports** — that is what lets the
harnesses run thousands of headless ticks.

## Modes

```ts
export type GameMode = 'rival' | 'campaign' | 'empire' | 'ascent';
```

| Mode | Factory (`src/state/GameState.ts`) | Scene | Tick |
|---|---|---|---|
| `rival` | `createInitialGameState()` | MapScene | `advanceRealtimeMonth` |
| `campaign` | `createCampaignGameState(config)` | MapScene | `advanceRealtimeMonth` |
| `empire` | `createEmpireGameState(config)` | MapScene | `advanceRealtimeMonth` |
| `ascent` | `createAscentGameState(config)` | ConquestScene + ConquestUIScene | `advanceAscentTick` |

`empire` is "Throne of Empires" — four *off-map* empires, Mandate/eras, Directives, Invasions,
Legacy perks. `ascent` is "Dragon Ascent" — it clones the empire state, sets `gameMode = 'ascent'`,
adds `state.ascent`, and clears directives.

`ConquestScene extends MapScene`, overriding only the tick, the UI scene key, `selectLand`
(read-only inspect) and the prompt bus. Two predicates in `src/game/constants.ts` gate shared
code: `isCampaignMode` (campaign|empire) and `isEndlessMode` (empire|ascent). **`isEndlessMode`
matters** — those modes have no enemy castles, so `checkVictory`'s sweep would declare victory on
the first tick.

## The loops

Both are frame-driven accumulators. A "turn" is one economy tick; a season is 2 ticks; 4 seasons a
year. `REALTIME_TICK_MS = 5500`, `ASCENT_TICK_MS = 3500`.

**`advanceRealtimeMonth`** ([RealtimeSystem.ts:27](../../../src/systems/RealtimeSystem.ts#L27)) —
income → acquisitions → builds → sieges → movement → recruitment → logistics → court → politics
cooldown → `turn += 1` + season clock → *(campaign/empire only)* events, foreign affairs, spies,
auto-defend, invasions, and for empire additionally great powers, threat director, crises,
abilities, hero actions, hero events, directives → bots → visibility → `checkVictory`.

**`advanceAscentTick`** ([AscentTick.ts:126](../../../src/systems/ascent/AscentTick.ts#L126))
repeats the mode-agnostic half verbatim, then: autopilot → standing orders → wave director →
raids → enemy command → invasions → battle (open/advance/resolve) → settle lands → detect
conquests → progress/XP → mandate → edict discovery → prompt cooldowns → stories → decision
director → defeat check → drain prompts.

Deliberately **not** called in ascent: `runBotTurns`, `tickCampaignEvents`, `tickForeignAffairs`,
`tickSpySystem`, `progressDirectives`, `checkVictory`.

Pausing: `drainAscentPrompts` sets `isPaused` whenever a prompt is live and clears it when the
queue empties. `isStrategyPause` is set by UI lane screens.

## Resources

```ts
export type ResourceKey = 'food' | 'supplies' | 'gold' | 'humans';
```

`state.resources` is stock, `state.resourceRates` is net per tick. All arithmetic is in
[ResourceSystem.ts](../../../src/systems/ResourceSystem.ts) (1600 lines).

Per-land output stacks: terrain bonuses (water, rice, mountain) + roads + building levels
(`OUTPUT_MULTIPLIERS = [1, 1.7, 2.7, 4.0, 5.6]`) × trade-network multiplier
(`1 + min(1.6, (ownedLands-1) * 0.09)`) × labour efficiency × governor × settlement loyalty.

Realm rates then subtract, in order: building upkeep, population food, army food/supplies
pressure, hero payroll, army gold upkeep — and in **ascent only** a per-host burden, a per-province
demand that ramps over the first 24 ticks, a gold soft cap above 500 (`500 + excess^0.82`) and
6%/tick graft above 4000. `state.ascentLedger` records gross/demand/net per resource, which is
what `verify-economy.mjs` asserts against.

Seasons move food: Spring ×1.1, Summer ×1.0, Autumn ×1.25, Winter ×0.8.

## Combat — three resolvers, not one

**1. Classic odds roll** — `attackLand()` in `WarSystem.ts`. The core power formula:

```
unitPower = spearmen*1 + archers*1.25 + heavyInfantry*1.8
power = unitPower * (morale/100) * (supply/100) * courtBonuses
      * (1 + (level-1)*0.08) * (1 + elite*0.18)
      * (general ? 1 + general.stats.martial/100 * 0.25 : 1)
```
`winChance = att / (att + def)`, clamped to 10–90, rolled against `Math.random()`. Stance modifies
power and losses (assault 1.18/1.4, cautious 0.85/0.6). Composition matters:
spears > heavy > archers > spears, ±0.4.

**2. Invader-vs-province threshold** — `resolveInvaderBattle()` in `InvasionSystem.ts`. Not a
ratio — a threshold with noise: attacker wins iff
`attackerPower >= defenderPower * defenderBonus * siegeMult * fuzz`, `fuzz = 0.9 + rand*0.2`. The
odds a response card quotes are derived from exactly this model.

**3. Watchable beat-by-beat battle (ascent)** — `BattleSystem.ts`. 6 beats per tick, an approach
phase of archery before contact, then per-round mutual attrition scaled by power share, charge/hold
trade multipliers, and a focus multiplier of 2.2 on the targeted host against 0.35 on the rest.
Morale falls with losses; below 32 a host routs. Player verbs: posture, focus, commit reserve,
rally. Only "worth watching" fights open, one per `wave:landId`.

`UnitCounts` has exactly **three** slots — `spearmen | archers | heavyInfantry`. The 10-value
`UnitType` union and `src/data/units.ts` are **dead data**; nothing imports them.

## Dragon Ascent

All tuning lives in one file by design: [src/game/ascentConfig.ts](../../../src/game/ascentConfig.ts).

**Waves** — every 12 ticks, boss every 4th wave, telegraphed 2 ticks ahead. Target power is
`420 * 1.11^(wave-1) * ambitionHeat * (boss ? 1.35 : 1)`; the soldier budget is whatever closes the
gap to live invader power. At most 4 live hosts.

**Ambition is the central dial.** Taking a province charges 3, a card 2, a host 1; heat is
`min(3.2, 1 + ambition*0.03)`; each wave decays ambition 45% and pays spoils proportional to
`heat - 1`. Every expansion you make raises the pressure that comes back at you — that coupling is
the mode.

**Power draft** — on level-up, 4 cards weighted `{bronze 62, silver 26, gold 10, jade 2}` × card
weight × focus bonus × doctrine lean. A completable evolution is guaranteed a slot. Taking a card
just applies a permanent `CourtModifier` labelled `asc:<id>:<n>`; evolution retires both parents by
filtering on that label prefix. Reroll price is `40 * (1 + (level-1)*0.35)`, doubling per use.

**Summon (gacha)** — weights `{bronze 70, silver 23, gold 6, jade 1}`, soft pity adds to gold/jade
per dry pull, hard pity at 8 guarantees gold-or-better. A dry ladder mints a fresh hero of the
rolled tier. Court Favor drafts take priority over the gacha on the same `hero-choice` prompt.

**Doctrine** — `fortify | expand | enrich | arm`, offered once per era, setting multipliers the
autopilot, militia capacity and card draft all read. `resolveDoctrine` always returns true on
purpose, so a bad id cannot wedge the prompt. Note there is a **second, unrelated**
`DoctrineSystem.ts` — that one reads power-card stacks for rule cards.

**Decision director** paces prompts: scheduled ones fire only in the `court` phase (between
aftermath and muster), 2 ticks apart, with per-kind cooldowns and a starvation promoter at 18
ticks. Stories are capped at 15% of a run's prompts.

**Run end** — capital held by an enemy for 6 ticks, or zero provinces. Score is
`waves*120 + peakPower/8 + peakLands*15 + cards*20 + heroes*40`; Legacy banked is `score/10`.

## The Chronicle

Ascent-only. A story is **not** a branching chain — it is a pool of fragments plus a bag of
numbers plus a salience draw ([StorySystem.ts](../../../src/systems/story/StorySystem.ts)).

Every 4 ticks the engine diffs the world (lands, heroes, gold, food, battles, waves, seats,
starving, hoarding), maybe seeds a new template (max 8 active, unseen weighted ×3.5), then for each
story that has been quiet long enough picks a fragment scored
`(weight + salience) * volumeBias / (1 + timesSaid)`. Two stories sharing a subject cannot both
speak in the same tick.

Fragment volumes: `whisper` → an immediate toast; `card`/`blow` → queued for the decision director;
`opening` → hangs an offer on the world. A `terminal` fragment writes a `ChronicleEntry` and
retires the template.

Effects go through a ~45-verb vocabulary in `src/systems/story/effects.ts` (`grantHost`,
`defectHost`, `secede`, `seizeTreasury`, `bondHeroes`, `raze`, `grantPowerCard`, …) — a story file
should never reach into `GameState` directly. Charges are sworn oaths tracked against goal kinds;
echoes persist across runs in localStorage, so a hero who left in run 3 can be named in run 5.

**The "annals"** are the fifth catalogue wave: twelve middle-length histories, each built around a
*verb* the effect vocabulary previously lacked. 48 templates total.

Story text lives **outside** the main i18n bundle in `src/i18n/story/`, and missing keys return the
key rather than throwing.

> **Never rename a fragment id.** It is an append-only save contract.

## Determinism

Two seeded PRNGs exist and **neither is used by gameplay**: `createRng` (mulberry32) for map
generation, `seededRandom` (LCG) for hero generation. Everything else calls bare `Math.random()`
across 68 sites. A run is reproducible only by monkey-patching `Math.random` before construction —
which is what `__startBenchGame` and every harness does. Even then, modifier ids use `Date.now()`,
so ids are not reproducible.

## Recipes

**A new hero** (authored)
1. `src/data/heroes.ts` — append to `heroTemplates` (`id, sex, era?, monastic?, name, type,
   rarity, upkeepGold, description: t(...), effect: t(...), stats, fatigue: 0`).
2. `src/i18n/catalogs/heroes.ts` — `heroes.<id>.description` and `.effect`, **en and vi**.
3. Optional: add to `FOUNDER_IDS`; give a `signatureCardId`.
4. Nothing else — the Codex counts `heroTemplates.length`, and the portrait derives from
   `sex`/`era`/`monastic`/name seed.

**A new edict or wonder**
1. `src/data/edicts.ts` — append to `REALM_PROJECTS` (`id, kind, branch, era, cost, unlock?,
   modifier`).
2. If the modifier key is new: add it to `CourtModifier`, to `createModifier`'s `modifierKeys`
   list in `PoliticsSystem.ts`, and to `getCourtBonuses` + the `CourtBonuses` interface in
   `CourtSystem.ts`. Miss any one and the field is stored but never read.
3. `src/i18n/catalogs/empire.ts` — `empire.project.<id>` and `.d`, en and vi.
4. Ascent picks it up automatically through `buildLawOptions`.

**A new Ascent power card**
1. `src/data/ascentCards.ts` — append a `PowerCardDef` (`id, rarity, maxStacks, levels[{effect,
   display}]`, optional `weight/requires/evolvesWith/evolvesInto/evolutionOnly/storyOnly`). Use
   `effect: { permanent: true, ... }` for a stacking card.
2. `src/i18n/catalogs/ascent.ts` — `ascent.card.<id>` and `.d` (the `.d` string interpolates the
   `display` keys), en and vi.
3. If it is a *rule* rather than a number, leave the effect empty and add a reader in
   `src/systems/ascent/DoctrineSystem.ts`, then call it from the system it modifies.
4. Evolution: set `evolvesWith`/`evolvesInto` on **both** parents and mark the result
   `evolutionOnly: true`.

**A new story**
1. `src/data/stories/<name>.ts` — export a `StoryTemplate` (`countingHouse.ts` is the minimal
   shape: seed guard, whisper → whisper → card → terminal blow).
2. `src/data/stories/index.ts` — import and add to `storyTemplates`.
3. `src/i18n/story/<name>.ts` — export `<name>En` / `<name>Vi` keyed `title`,
   `<fragmentId>.line`, `.body`, `.<optionId>`, `.advice`, `charge.<key>.{sworn,kept,broken,watching}`.
4. `src/i18n/story/index.ts` — register in `CATALOGS` under **the template id**.
5. Need a new world effect? Add a verb to `src/systems/story/effects.ts`, do not reach into state
   from the story file.

**A new unit** — there is no live unit system; `UnitCounts` is three fixed slots. Genuinely adding
a fourth arm means touching `types.ts`, `WarSystem` (power, matchup, shares, recruitment split),
`movementConfig`, `BattleSystem` (bleed, reserve split), `InvasionSystem` spawn profiles (and
re-deriving `INVADER_POWER_PER_SOLDIER`), plus every `army.units.` destructure in scenes and UI.
Confirm that is really what is wanted before starting.

## Verifying a change

Balance is measured, not reasoned about. `/funscore` for the six-dimension score before and after;
`node test_scripts/verify-economy.mjs` for the ledger; `verify-ascent.mjs` for the run loop
(**always exits 0 — parse stdout for `PASS:` vs `CHECK:`**); `verify-modes-regression.mjs` prints a
60-tick fingerprint per mode to diff across a shared-code edit. See
[game-harness](../game-harness/SKILL.md).
