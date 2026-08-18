---
description: Screenshot a screen of the game and actually look at it
argument-hint: "<screen>  e.g. map | menu | ui-sweep | prompts | seasons | art | battle | chronicle"
allowed-tools: Bash, Read, Glob, Write
---

Capture `$ARGUMENTS` and **Read the PNGs**. A visual change is not verified until the image has
been looked at — this game's regressions are overwhelmingly things that compile, run, log nothing,
and look wrong.

## 1 · Server

```bash
curl -s http://localhost:5173/ | grep -q "Mandate of" && echo "ours" || echo "start our own"
(nohup npx vite --host 127.0.0.1 --port 5199 --strictPort > /tmp/dev.log 2>&1 &)
sleep 6 && export DEV_URL=http://127.0.0.1:5199 SHOT_OUT=output/shots
```

## 2 · Pick a shooter

| Ask | Script | Lands in |
|---|---|---|
| every screen in one sweep | `shot-ui-sweep.mjs` | `output/ui-sweep/` |
| the map / art direction | `shot-art.mjs [seed]`, `shot-dongho.mjs` | `test_scripts/shots/`, `output/dongho/` |
| the four seasons | `shot-seasons.mjs` | `test_scripts/shots/season-*` |
| ascent decision cards | `shot-prompts.mjs [seed]` | `test_scripts/shots/prompt-*` |
| a battle opening | `shot-battle-open.mjs`, `shot-assault.mjs` | `output/web-game/` |
| the Chronicle | `shot-chronicle.mjs` | `test_scripts/shots/` |
| hero picker / faces | `shot-hero-picker.mjs` | `output/web-game/` |
| army orders, flags | `shot-army-orders.mjs`, `shot-army-flag.mjs` | `output/web-game/` |
| all modes, quickly | `smoke.mjs --shots` | `output/smoke/` |

`Glob test_scripts/shot-*.mjs` if none of those match. Prefer an existing shooter over a new one.

## 3 · If nothing fits, write one

Six lines, in `test_scripts/` (anywhere else and `import 'playwright'` will not resolve):

```js
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
mkdirSync('output/shots', { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await page.goto(`${process.env.DEV_URL ?? 'http://127.0.0.1:5173'}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof window.__startBenchGame === 'function', null, { timeout: 30000 });
await page.evaluate(() => window.__startBenchGame(1337, 'ascent'));
await page.waitForFunction(() => window.__phaserGame.scene.isActive('ConquestScene'), null, { timeout: 30000 });
await page.waitForTimeout(900);
await page.screenshot({ path: 'output/shots/scratch.png' });
await browser.close();
```

Three things will silently ruin it: dropping `?capture=1` gives a blank canvas; guessing UI
coordinates taps the gap between two options about a third of the time (read the display list
instead); and `camera.worldView` is stale right after `setZoom`/`centerOn` — use `scrollX/scrollY`.

To open a specific surface, drive the scene directly:
`UIScene.openModal('build'|'heroes'|'court'|'army'|'affairs'|'directives'|'event-log'|'land-detail')`
or `ConquestUIScene.openLane('build'|'heroes'|'court'|'army'|'affairs')`.

## 4 · Look, then report

`Read` every PNG produced. Then say, concretely: what is on screen, whether the thing that changed
is visible and correct, and anything clipped, overlapping, mis-registered or off-palette.

Check the layout at the small end too — `GAME_HEIGHT` is derived from the device aspect ratio and
clamps to 620 on a wide window, which is where panels clip. A 1512×900 viewport forces that
minimum deliberately; `verify-scroll.mjs` uses it for exactly this reason.

Stop any server you started.
