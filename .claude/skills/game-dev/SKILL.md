---
name: game-dev
description: Start here for any code change to Vạn Thắng (this Phaser 3 + TypeScript grand-strategy game) — the build/verify gates, the dev-server dance, the design surface, the localization invariant that crashes the game at import time, and which of the deeper skills to load next. Use whenever editing src/, adding content, fixing a rendering or gameplay bug, or wiring a new screen.
---

# Developing Vạn Thắng

A one-hand, portrait-phone grand strategy game. Vite + TypeScript + Phaser 3, no test
framework — correctness is proven by driving the real game in a real browser (see
[game-harness](../game-harness/SKILL.md)).

Load the skill that matches the work:

| Working on | Load |
|---|---|
| Colors, paper/ink look, renderers, portraits, icons, quality tiers | [game-art-theme](../game-art-theme/SKILL.md) |
| Hexes, terrain, map generation, lands, culling, fog, minimap | [game-map](../game-map/SKILL.md) |
| Modes, tick loop, resources, combat, cards, stories, balance | [game-mechanics](../game-mechanics/SKILL.md) |
| Champions: the roster, bios, the throne's rulers, hero portraits | [game-heroes](../game-heroes/SKILL.md) |
| Writing or running a verification script | [game-harness](../game-harness/SKILL.md) |

## The gates

```bash
npx tsc --noEmit        # ~4s. Run this constantly.
yarn build              # tsc && vite build. The CI gate (.github/workflows/deploy-github-pages.yml).
yarn faces:check        # only if you touched public/faces/*.svg
```

`yarn build` is what GitHub Pages runs on every push to `main`. A Vite chunk-size warning about
the Phaser bundle is expected and pre-existing — it is not a failure.

Package manager is **yarn 4.18** (`nodeLinker: node-modules`), Node 22. Do not use `npm install`
here; it will fight `yarn.lock`.

## Two invariants that bite immediately

**1. Every English string needs a Vietnamese one.** `src/i18n/index.ts` calls `validateCatalogs()`
at module scope (line 45) and *throws* on a missing key:

```ts
throw new Error(`Missing Vietnamese translation for "${key}".`);
```

That is an import-time throw, so a forgotten key does not degrade the UI — it takes the whole game
down with a blank screen. Add to `enX` and `viX` in the same
[catalog file](../../../src/i18n/catalogs/) in the same edit. The catalogs are merged in
[index.ts:24-38](../../../src/i18n/index.ts#L24-L38); duplicate keys across catalogs also throw.

Never hard-code player-facing text in a scene. Use `t('some.key')`, or the typed helpers —
`resourceLabel`, `buildingLabel`, `landTypeLabel`, `heroTypeLabel`, `rarityLabel`, `seasonLabel`,
`tickLabel`, `formatResourceList`. Interpolation is `{name}` placeholders through
`t(key, { name })`.

**2. The design surface is 390 wide and a *variable* height.**
[src/game/constants.ts](../../../src/game/constants.ts#L17-L30):

```ts
export const GAME_WIDTH = 390;          // fixed — everything is laid out against it
export const GAME_HEIGHT = designHeight(); // clamp(620, 390 * aspect, 1040)
```

Height is derived from the device aspect ratio so Phaser's `Scale.FIT` scales by *width* and the
map area simply gets shorter or taller. Never write a layout that assumes 844. Anchor to
`GAME_HEIGHT`, `HEADER_HEIGHT` (52) and `ACTION_BAR_HEIGHT` (50) instead. A panel that fits your
window and clips on an iPhone SE is the single most common regression here — `verify-header-fit.mjs`,
`verify-menu-fit.mjs` and `verify-scroll.mjs` exist because of it.

## Running the game

Default dev port is 5173, and on this machine **it is frequently taken by another project**. Always
check whose it is before trusting it:

```bash
curl -s http://localhost:5173/ | grep -q "Mandate of" && echo "ours" || echo "not ours"
```

If it is not ours, run on a free port and point every harness at it:

```bash
(nohup npx vite --host 127.0.0.1 --port 5199 --strictPort > /tmp/dev.log 2>&1 &)
sleep 6 && export PLAYTEST_URL=http://127.0.0.1:5199
```

Stop any server you started when you are done.

### Query params the game reads

Six, all matched as `/[?&]name=value\b/` regexes against `window.location.search` — there is no
`URLSearchParams` anywhere, so they combine with `&` and `?capture=10` does *not* match.

| Param | Effect | Defined at |
|---|---|---|
| `capture=1` | Retains the WebGL drawing buffer. **Screenshots come back blank without it.** | [config.ts:19](../../../src/game/config.ts#L19) |
| `nocull=1` | Disables MapScene view culling — A/B the culling | [MapScene.ts:58](../../../src/scenes/MapScene.ts#L58) |
| `nobake=1` | Skips the static terrain and fog RenderTexture bakes | [MapScene.ts:1130](../../../src/scenes/MapScene.ts#L1130) |
| `nofx=1` | Disables the full-screen PaperFX pass | [PaperFX.ts:97](../../../src/ui/ink/PaperFX.ts#L97) |
| `noseason=1` / `nowinter=1` | Disables seasonal visual layers | [season.ts:335](../../../src/ui/ink/season.ts#L335) |
| `bakescale=N` | Overrides bake texture resolution, clamped to `[0.25, 1]` | [graphicsQuality.ts:131](../../../src/game/graphicsQuality.ts#L131) |

`capture=1` is off by default because retaining the drawing buffer is a real GPU-bandwidth cost on
mobile. The four `no*` switches exist to isolate a rendering cost or a visual regression: turn one
off, shoot the same frame, diff.

There is **no `?mode=` and no `?seed=`** — appending them does nothing and the game sits on the
menu. (`verify-economy.mjs` navigates to `?seed=1337`; that param is inert, and the script really
seeds in-page.) To reach a mode from a script use `window.__startBenchGame`, below.

Language is picked up from `localStorage['mandate:language:v1']` (`'en' | 'vi'`), so set it with
`page.addInitScript` before navigation, not after.

### Testing hooks on `window`

Declared in [src/main.ts:9-26](../../../src/main.ts#L9-L26). These are the whole test surface:

```ts
window.__phaserGame: Phaser.Game
window.__mandateState: GameState | undefined       // undefined on the menu
window.render_game_to_text(): string               // JSON *string*, not an object — parse it
window.advanceTime(ms: number): void               // steps game.step() at 60fps, synchronously
window.__startBenchGame(seed = 1337, mode: 'rival' | 'campaign' | 'empire' | 'ascent'): void
window.__hudTapBounds, window.__minimapInputBounds, window.__suppressMapInputUntil
```

`__startBenchGame` seeds `Math.random` before building state and restores it after, then jumps
straight into the scene — that is how a run becomes reproducible. `render_game_to_text()` returns
`{"mode":"menu",...}` until a run is started; treat "menu" as "the click-through failed", not as
state.

## Where things live

```
src/main.ts            entry; declares the window hooks
src/game/config.ts     Phaser game config, scene registration order, PaperFX pipeline
src/game/constants.ts  design surface, COLORS, REALTIME_TICK_MS, mode predicates
src/scenes/            BootScene → PreloadScene → MenuScene → {Campaign,Map+UI,Conquest+ConquestUI}
src/state/             GameState, types, save/load, legacy (meta-progression), codex
src/systems/           gameplay logic — plain functions over state, no Phaser imports
src/systems/empire/    Throne of Empires mode
src/systems/ascent/    Dragon Ascent mode
src/systems/story/     the Chronicle
src/data/              content: units, heroes, edicts, cards, lands, kingdoms, stories
src/map/               hex math, generation, terrain, boundaries, roads
src/ui/                renderers and panels (Phaser-aware)
src/i18n/              catalogs; every key needs en + vi
test_scripts/          Playwright harnesses, filed by family (see game-harness)
docs/                  design docs + generated art/story reference pages
```

Only index 0 of the `scene:` array auto-starts
([config.ts:51](../../../src/game/config.ts#L51)); everything else is registered-but-stopped and
started by name.

**Systems must not import Phaser.** They are plain functions over `GameState` so the headless
harnesses can `import('/src/state/GameState.ts')` and run thousands of ticks with no renderer. If
you find yourself reaching for `this.scene` inside `src/systems/`, the logic belongs in a
renderer instead.

## Conventions worth matching

- **Comments explain *why*, with the measurement.** This codebase's comments read like
  `44 was too short to hold what is in it` and `measured: 561 times in six minutes`. When you fix
  something subtle, record the number that proves it, not the restatement of the code.
- **Content is data, code is generic.** Adding a unit/hero/card/story should touch `src/data/` and
  a catalog, not a scene. If a change needs a `switch` in a renderer, check whether the data model
  is missing a field.
- `output/`, `dist/`, `test_scripts/shots/` and `tmp-verify.png` are gitignored — write scratch
  artifacts there freely.
- Scratch harnesses must live **inside the project** (`test_scripts/scratch/`, which is
  gitignored) or `import 'playwright'` will not resolve.

## The resume-path rule

**A throw inside one game step kills the loop for ever.** Phaser 4's rAF driver runs the step
callback *before* it requests the next frame, so an uncaught exception in update, render, a tween
or a timer callback leaves `raf.isRunning` true with nothing scheduled — and on a phone, whose
compositor drops a backgrounded canvas, that reads as a blank screen rather than a freeze.
`src/game/resilience.ts` re-arms the loop and reloads a context the GPU never returned, but it is a
net, not a licence: anything that runs on the first frame after `visibilitychange`/`focus` (the
away pause's `state-changed`, a context-restore rebake) must not throw. GPU-rendered textures
(RenderTexture, DynamicTexture) come back empty from a context restore — register a repaint with
`src/game/gpuBakes.ts`. `yarn verify:resume` is the gate.

## Before you say it works

Typecheck is necessary and nowhere near sufficient — most regressions in this game are visual or
behavioural and compile perfectly. Finish with the cheapest harness that actually exercises the
change:

```bash
/smoke                 # boots the game, fails on any console error
/shot <screen>         # screenshot it and *look* at the PNG
/verify <area>         # the matching verify-*.mjs
/funscore              # did a gameplay change help or hurt?
```

Do not grade a gameplay change by reading the diff. Grade it from what the harness reports.
