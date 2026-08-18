---
description: Write a throwaway harness that answers one question about the running game, then run it
argument-hint: "<question>  e.g. does gold stay positive past wave 20 with the enrich doctrine?"
allowed-tools: Bash, Read, Write, Edit, Glob, Grep
---

Answer `$ARGUMENTS` by measuring the real game, not by reading the source. Write a script, run it,
report the number.

Load the **game-harness** skill first — it carries the bootstrap, the prompt-option shapes and the
traps. This command is the short form.

## 1 · Check one does not already exist

```bash
ls test_scripts/
```

~68 harnesses are already here. If one answers the question, run it instead of writing another.

## 2 · Write it in `test_scripts/`

It must live there or `import 'playwright'` will not resolve. Name it `diag-<topic>.mjs` for a
one-off measurement, `verify-<topic>.mjs` if it asserts something worth keeping.

Prefer the **headless engine** style — import the systems and tick them with no renderer. It runs
thousands of ticks in seconds and is how balance questions get answered:

```js
import { chromium } from 'playwright';
import { READ_OPTIONS } from './playtest-lib.mjs';

const URL = process.env.DEV_URL ?? 'http://127.0.0.1:5173';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE: ${m.text()}`); });

await page.goto(`${URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof window.__startBenchGame === 'function', null, { timeout: 30000 });
await page.evaluate(READ_OPTIONS);   // installs window.__ptOptions — without it nothing gets answered

const out = await page.evaluate(async (seed) => {
  const { createAscentGameState } = await import('/src/state/GameState.ts');
  const { advanceAscentTick } = await import('/src/systems/ascent/AscentTick.ts');
  const { resolveAscentPrompt } = await import('/src/systems/ascent/AscentResolver.ts');

  let s = seed >>> 0;                                  // mulberry32 — pin the run
  Math.random = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const st = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
  const samples = [];
  for (let i = 0; i < 600; i += 1) {
    let guard = 0;                                     // run-over is TERMINAL — always guard
    while (st.pendingAscentPrompt && guard++ < 40) {
      const options = window.__ptOptions ? window.__ptOptions(st) : null;
      if (!options?.length) break;
      resolveAscentPrompt(st, options[0]);
    }
    advanceAscentTick(st);
    samples.push({ turn: st.turn, gold: Math.round(st.resources.gold), wave: st.ascent?.wave ?? 0 });
  }
  return samples;
}, 20260808);

console.log(JSON.stringify(out.filter((_, i) => i % 50 === 0), null, 2));
console.log('errors:', errors.length ? errors.slice(0, 3) : 'none');
await browser.close();
```

That skeleton runs as written (600 ticks, ~30s, reaches wave 28 on seed 20260808). But note it
answers every prompt with `options[0]`, which is a *null policy*, not a neutral one — it declines
some offers and takes the worst of others, and a run driven that way starves. Decide the policy
the question actually needs before quoting any number off it; `DECLINE` in `playtest-lib.mjs` maps
each prompt kind to its real "refuse" id if you want a clean baseline.

Use `window.__startBenchGame(seed, mode)` + a rendered scene instead only when the question is
about the **UI** — whether a control is reachable, whether a panel clips. That is the one thing a
headless run cannot answer.

To read a live prompt's legal options, install `READ_OPTIONS` from `playtest-lib.mjs`. Do **not**
use `render_game_to_text().ascent.prompt.options` — it has no `famine` case and returns `['ok']`,
which nothing accepts, so the driver re-answers the same card forever.

## 3 · Run it, then decide whether it stays

```bash
node test_scripts/diag-<topic>.mjs 2>&1 | tail -40
```

If the answer is a one-off, delete the script and keep the number. If it encodes an invariant that
could break again, keep it, convert the output to `ok  `/`FAIL` check lines with an
`N/M checks passed` footer and a `process.exit(failed ? 1 : 0)`, and say so.

## 4 · Report

The number that answers the question, the seed and tick count it came from, and whether one seed
is enough. Anything sampled from a single seed is an anecdote — sweep 6–8 seeds before making a
balance claim.
