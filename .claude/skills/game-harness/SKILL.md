---
name: game-harness
description: Write and run verification scripts for Vạn Thắng. There is no test framework — every check drives the real game in headless Chromium from test_scripts/*.mjs. Covers the bootstrap boilerplate, the two run styles (headless engine vs rendered run), the window hooks, prompt-kind option shapes, pass/fail reporting conventions, and the traps that make a harness silently pass while testing nothing. Use when adding a check, debugging a failing harness, or proving a change works.
---

# Verifying this game

No Jest, no Vitest, no `npm test`. Playwright is a devDependency and every harness is a standalone
ESM script run with bare `node`. `"type": "module"` in package.json is what allows top-level
`await` in `.mjs`.

```bash
node test_scripts/verify-ascent.mjs
node test_scripts/playtest-metrics.mjs --seeds 8 --ticks 600
```

A dev server must already be running — **no harness starts one**, and if it is down `page.goto`
throws or `waitForFunction` times out after 30s. See [game-dev](../game-dev/SKILL.md) for the
server dance.

Scratch scripts must live in `test_scripts/`; anywhere else and `import 'playwright'` will not
resolve.

## The bootstrap every script repeats

Only three scripts import `playtest-lib.mjs`. The other ~60 hand-roll this:

```js
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (err) => errors.push(`PAGEERROR: ${err.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE: ${m.text()}`); });

await page.goto('http://localhost:5173/?capture=1', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(
  () => typeof window.__startBenchGame === 'function' && window.__phaserGame.scene.isActive('MenuScene'),
  null, { timeout: 30000 },
);
```

Viewport is **390×844** — the design surface. `deviceScaleFactor: 2` when the shot will be judged
by eye. Always headless. `'no console errors': errors.length === 0` is a check in nearly every
script; keep it.

**The base URL convention is not uniform.** Four coexist, so match the family you are editing:

| Env var | Used by | Default |
|---|---|---|
| `PLAYTEST_URL` | `playtest-lib.mjs` → the three `playtest-*` scripts | `http://localhost:5173` |
| `DEV_URL` | most `shot-*` and `verify-*` (`verify-scroll`, `verify-land-command`, `verify-living-map`, …) | 5173 |
| `BASE_URL` | `_attribute-frame`, `_cull-visual`, `verify-culling`, `verify-hero-*` | 5173 — **except `verify-hero-actions`/`verify-hero-events`, which default to `:5175`** |
| `--url` flag | `perf-bench`, `perf-profile` | 5173 |
| none | `verify-ascent`, `verify-economy`, `battle-lab`, `diag-*`, `check-console`, `measure-*` … | hardcoded |

New scripts should take `process.env.DEV_URL ?? 'http://127.0.0.1:5173'`.

## Two ways to run the game

**Headless engine** — import the systems and tick them with no renderer at all. Fast enough for
thousands of ticks across many seeds; this is how balance is measured. Vite serves raw TS, so
in-page dynamic import with the **`.ts` extension** is the idiom:

```js
const result = await page.evaluate(async () => {
  const { createAscentGameState } = await import('/src/state/GameState.ts');
  const { advanceAscentTick } = await import('/src/systems/ascent/AscentTick.ts');
  const { resolveAscentPrompt } = await import('/src/systems/ascent/AscentResolver.ts');
  // …seed Math.random, build state, loop…
});
```

**Rendered run** — the real scenes, so an unclickable button fails here instead of passing:

```js
await page.evaluate(() => window.__startBenchGame(1337, 'ascent'));
await page.waitForFunction(() => window.__phaserGame.scene.isActive('ConquestScene'), null, { timeout: 30000 });
await page.waitForTimeout(800);
```

`'ascent'` lands in `ConquestScene`; `'rival' | 'campaign' | 'empire'` land in `MapScene`.

Determinism is a copy-pasted mulberry32 that seeds `Math.random`:

```js
let s = 1337 >>> 0;
Math.random = () => {
  s = (s + 0x6d2b79f5) | 0;
  let t = Math.imul(s ^ (s >>> 15), 1 | s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
```

`__startBenchGame` and `playtest-lib` restore the original in a `finally`. `verify-ascent`,
`verify-economy` and `diag-ascent-seeds` clobber it for the page's lifetime on purpose.

## Answering prompts without stalling

`pendingAscentPrompt.kind` is one of: `founder`, `power-draft`, `conquer-target`,
`conquer-method`, `hero-choice`, `court-appointment`, `law-choice`, `doctrine`, `parliament`,
`envoy`, `famine`, `rival-demand`, `empire-response`, `battle`, `story-beat`, `wave-result`,
`run-over`.

**Do not read options from `render_game_to_text().ascent.prompt.options`.** Its
`describeAscentPromptOptions` ([main.ts:169-191](../../../src/main.ts#L169-L191)) has no `famine`
case and falls through to `['ok']`, an id nothing accepts — a driver using it re-answers the same
famine card forever (measured: 561 times in six minutes) and never exercises the famine system.
Use `window.__ptOptions` from `playtest-lib.mjs`, and keep it in step with
`AscentResolver.resolveAscentPrompt`.

Option ids are shaped differently per kind, and this is the #1 source of silent stalls:
`founder` carries **plain strings** where most kinds carry `{ id, affordable, cost }` objects —
reading `.id` off a string yields `undefined` and the prompt silently re-raises. `power-draft`
uses `p.cards[]` + `'skip'`; `conquer-target` uses `p.targets[].landId` + `'hold'`;
`conquer-method` uses `p.target.methods[].method` filtered on `!m.blockedReason` + `'back'`;
`law-choice` uses `` `edict:${id}` `` / `` `tax:${policy}` `` + `'hold'`; `parliament` looks its
choices up in `st.politicsDeck`.

**`run-over` is terminal** — the resolver hands it to the summary scene rather than clearing it,
so every prompt-draining loop needs a guard (`while (guard++ < 40)`) or it spins forever.

## Reporting

Two styles. Use B for anything new.

```js
// Style B — accumulator. 'ok  ' is padded to 4 so labels align.
const checks = [];
const check = (label, pass, detail = '') => {
  checks.push({ label, pass });
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${label}${detail ? `  — ${detail}` : ''}`);
};

// …probes…
check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
const failed = checks.filter((c) => !c.pass);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
console.log(failed.length === 0 ? 'PASS: <what held>' : 'FAIL: <what broke>');
process.exit(failed.length === 0 ? 0 : 1);
```

Section headers are `console.log('=== SECTION ===')`. Advisory assertions say `CHECK:` rather than
`FAIL:`.

**Only 14 of ~68 scripts call `process.exit`.** Notably `verify-ascent.mjs` and
`verify-modes-regression.mjs` **always exit 0** — you must parse stdout for `PASS:` vs
`CHECK:`/`FAIL:`. Never conclude "the harness passed" from an exit code alone unless you have
checked that that script sets one.

## Where output goes

`output/` and `test_scripts/shots/` are gitignored; `test_scripts/perf-results/` is **committed
baseline data**. Always `mkdirSync(dir, { recursive: true })` first.

| Path | From |
|---|---|
| `output/playtest/metrics.json` | `playtest-metrics.mjs` — score out of 85 across six dimensions |
| `output/playtest/session/timeline.json` + `NN-<kind>.png` | `playtest-session.mjs` |
| `output/playtest/strategies.json` | `playtest-play.mjs`, append-only ledger |
| `output/ui-sweep/*.png` | `shot-ui-sweep.mjs`, numeric-prefix grouped |
| `output/web-game/*.png` | most one-off `shot-*` scripts |
| `test_scripts/shots/*.png` | `shot-art`, `shot-prompts`, `shot-seasons`, `shot-chronicle` |
| `test_scripts/perf-results/<label>.json` | `perf-bench.mjs`; diffs against `baseline.json` |

## Traps that make a harness lie

1. **`?capture=1` or the screenshot is blank.** The drawing buffer is not retained otherwise.
2. **`MenuScene` nulls `window.__mandateState`** ([MenuScene.ts:76](../../../src/scenes/MenuScene.ts#L76))
   and stays resident behind the map, so a probe trusting that global loses the run mid-test and
   reports the game as empty. Fall back through the scene's own `.state` — see the
   `window.gameState()` shim in `verify-land-command.mjs`.
3. **Full-screen dims swallow naive taps.** Every prompt lays an interactive backdrop *first* in
   the layer, so a sweep taps that and nothing happens — exactly the silent no-op the harness
   exists to catch. Filter to `width >= 340 && height >= 300`, or to `obj.type === 'Rectangle'`,
   then sort by `y` so "first option" means topmost.
4. **Never guess UI coordinates — read the display list.** A card's rows move with the length of
   its own title; a fixed offset taps the gap between two options about a third of the time.
5. **Phaser's `worldView` is stale right after `setZoom`/`centerOn`** — it is only recomputed in
   the camera's preRender. Use `scrollX/scrollY`. Reading `worldView` threw a crop ~200px off in
   both axes. Also clamp screenshot clips to the *canvas* rect, not the window, or you capture
   letterbox bars.
6. **Chained prompts are one decision.** A conquest target followed by its method sheet must be
   collapsed or the pacing statistics are meaningless.
7. **Use absolute camera positions, not relative pans.** The camera clamps to world bounds, so a
   relative pan can silently do nothing and the check then proves only that nothing changed.
8. **Step deterministically instead of sleeping** when comparing two frames — a fixed number of
   small `game.step` calls keeps both runs at the same point in every drift tween.
9. **Headless Chromium rasterises through SwiftShader, in software.** Fill rate is charged to the
   CPU and costs far more than on a real phone GPU. Read object counts and culled fraction as the
   transferable numbers and the milliseconds as this machine's. Run-to-run spread is wide: one
   green run near the line is weak evidence, repeat it.
10. **Port pinning.** `verify-hero-actions.mjs` and `verify-hero-events.mjs` default to `:5175`,
    not 5173.
11. **In-page `import('/src/x.ts')` can hand you a second copy of a module the game already has.**
    Once a file has been edited while the dev server is up, Vite serves it to the page as
    `/src/x.ts?t=<hmr-timestamp>`; a plain import from the harness resolves to a *different*
    instance, so mutating its exports (a config object, a registry) silently changes nothing the
    game reads. Read the URL the page actually loaded from
    `performance.getEntriesByType('resource')` and import that — see `__liveSupport` in
    `shot-support.mjs`. Building fresh state through imported factories is unaffected.

## Perf method

`REALTIME_TICK_MS = 5500`, `ASCENT_TICK_MS = 3500`. Step deliberately either side of the threshold:
`game.step(now, 16)` renders without a tick; `game.step(now, 6000)` forces exactly one tick plus
one `refresh()`. Throttle with CDP `Emulation.setCPUThrottlingRate` at `rate: 4` for "mid-tier
Android".

## Scene internals harnesses reach into

A de-facto API — changing these names breaks the harnesses:

- `MapScene`: `.state`, `.refresh()`, `.landNodes`, `.landLabels`, `.viewIndex.{size,culledCount}`,
  `.renderSignatures[band]`, `.bakeStaticTerrain()`, `.repaintHexTerrain()`, `.rebakeScenery()`,
  `.setMapZoom(z)`, `.findLandIdAt(wx,wy)`, `.landscapeGeometry().centreOf(tile)`, `.drawArmies()`
- `UIScene`: `.openModal(k)`, `.closeModal()`, `.modalScreen`, `.refresh()` — keys `build`,
  `heroes`, `court`, `army`, `affairs`, `foreign-affairs`, `directives`, `event-log`, `game-menu`,
  `land-detail`
- `ConquestUIScene`: `.openLane(k)` (`build|heroes|court|army|affairs`), `.closeLane()`,
  `.modalLayer`, `.actionBar`, `.openPromptKey`, `.battleAwaitingOrder`, `.showBuildScreen()`,
  `.showGovernorPicker(landId)`, `.showCodex()`
- `ConquestScene`: `.state`, `.refresh()`
