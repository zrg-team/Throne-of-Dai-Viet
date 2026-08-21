---
description: Run the verify-*.mjs harnesses that cover a given area and report what actually passed
argument-hint: "<area>  e.g. ascent | economy | map | ui | modes | all"
allowed-tools: Bash, Read, Glob, Grep
---

Run the real verification harnesses for the area named in `$ARGUMENTS` and report the result
honestly. These drive the game in headless Chromium; they are the only thing in this repo that
proves behaviour.

## 1 · Server

```bash
curl -s http://localhost:5173/ | grep -q "Mandate of" && echo "ours" || echo "start our own"
```

If it is not ours, start one and export **both** names — the harness families disagree about which
env var they read:

```bash
(nohup npx vite --host 127.0.0.1 --port 5199 --strictPort > /tmp/dev.log 2>&1 &)
sleep 6 && export DEV_URL=http://127.0.0.1:5199 BASE_URL=http://127.0.0.1:5199 PLAYTEST_URL=http://127.0.0.1:5199
```

Note `verify-hero-actions.mjs` and `verify-hero-events.mjs` default to port **5175**, not 5173, so
they need `BASE_URL` set even when 5173 is ours.

## 2 · Pick the harnesses

| Area | Run |
|---|---|
| `ascent` | `verify-ascent.mjs`, `verify-economy.mjs` |
| `economy` | `verify-economy.mjs` |
| `story` / `chronicle` | `verify-chronicle.mjs` |
| `combat` / `battle` | `verify-combat.mjs`, `playtest/battle-lab.mjs` |
| `map` / `render` | `verify-culling.mjs`, `verify-living-map.mjs`, `verify-ground-scale.mjs`, `verify-render-scale.mjs` |
| `ui` / `layout` | `verify-scroll.mjs`, `verify-header-fit.mjs`, `verify-menu-fit.mjs`, `verify-land-command.mjs` |
| `empire` | `verify-empire-revamp.mjs`, `verify-edicts-ascension.mjs`, `verify-living-empires.mjs`, `verify-crisis-vassal.mjs` |
| `hero` | `verify-hero-actions.mjs`, `verify-hero-events.mjs` |
| `modes` / `regression` | `verify-modes-regression.mjs` |
| `all` | every `test_scripts/verify/*.mjs` |

If the argument does not match, `Glob test_scripts/verify/*.mjs` and pick by name rather than
guessing. If the user named a *file they changed* instead of an area, grep the harnesses for the
symbols that file exports and run the ones that touch it.

Run them one at a time so a hang is attributable:

```bash
node test_scripts/verify/verify-ascent.mjs 2>&1 | tail -60
```

## 3 · Read the result correctly

**Exit codes are not reliable here.** Only 14 of ~68 scripts call `process.exit`. In particular
`verify-ascent.mjs` and `verify-modes-regression.mjs` **always exit 0**. Judge from stdout:

- `ok  <label>` / `FAIL <label>` lines, and the `N/M checks passed` footer
- a final `PASS: …` versus `CHECK: …` or `FAIL: …`
- `verify-modes-regression.mjs` asserts nothing — it prints a per-mode JSON fingerprint meant to be
  **diffed** across a change. Compare it to the previous run and say what moved.

A harness that prints no checks at all did not run: the server was down, or `waitForFunction`
timed out at 30s. Say that rather than reporting a pass.

## 4 · Report

Lead with the verdict: which harnesses ran, how many checks passed, what failed. Quote the failing
`FAIL` lines verbatim with their detail strings — they carry the numbers.

For each real failure, name the file and the likely cause in one sentence. Do not fix anything
unless asked; this command reports.

Stop any server you started.
