# The harnesses

There is no test framework here. Every check drives the real game in headless Chromium, so a
"test" is a standalone `.mjs` script run with bare `node`. There are 114 of them, and they are
filed by **the question they answer** rather than by the feature they touch — a battle change
usually means running something from `verify/`, then something from `playtest/`, and those are
two different kinds of answer.

| Folder | Count | Answers | Named |
|---|---|---|---|
| [`verify/`](verify/) | 51 | *Is it broken?* — pass/fail gates worth keeping | `verify-<topic>.mjs` |
| [`shot/`](shot/) | 34 | *What does it look like?* — screenshot drivers | `shot-<topic>.mjs` |
| [`playtest/`](playtest/) | 9 | *Is it any good?* — metrics, sessions, full playthroughs | `playtest-*`, `play-*`, `battle-lab` |
| [`perf/`](perf/) | 7 | *What does it cost?* — render, bake, beat, heap | `measure-*`, `perf-*` |
| [`diag/`](diag/) | 11 | *Why is it doing that?* — prints, does not assert | `diag-<topic>.mjs`, `measure-*` |
| [`gate/`](gate/) | 2 | *Does it still boot?* — the cheapest checks | `smoke`, `check-console` |
| `scratch/` | — | throwaway probes, **gitignored** | `_<topic>.mjs` |

## Start here

A dev server must already be running — **no harness starts one** — and every script must be run
**from the repository root**, because output paths are written relative to it.

```bash
node test_scripts/gate/smoke.mjs                    # every mode boots, ticks, draws — ~40 s
node test_scripts/verify/verify-ascent.mjs          # the Dragon Ascent loop end to end
node test_scripts/playtest/playtest-metrics.mjs     # six measured preconditions of fun, /85
node test_scripts/perf/perf-bench.mjs --label wip   # auto-diffs against perf-results/baseline.json
node test_scripts/shot/shot-readme.mjs              # regenerates every picture in the root README
```

## Reading a result

**Exit codes are not reliable.** Only a minority of these scripts call `process.exit` — notably
`verify-ascent.mjs` and `verify-modes-regression.mjs` always exit 0. Parse stdout for `PASS:` /
`ok` against `FAIL:` / `CHECK:` instead, and never conclude a harness passed from its exit code
unless you have checked that that script sets one.

## Two paths that do not move with the scripts

`shots/` and `perf-results/` stay at the top of this tree. Shot scripts write to
`test_scripts/shots/…` relative to the **project root**, so a shooter works from `shot/` with no
path change — and `perf-bench.mjs` reaches back up to `perf-results/` so that `--label` keeps
diffing against the committed `baseline.json` rather than orphaning it.

`shots/` and `scratch/` are gitignored; `perf-results/` holds committed baseline data.

## Adding one

Put it in the folder matching the question, and follow the naming above. If it asserts an
invariant that could break again, it belongs in `verify/` with `ok` / `FAIL` check lines; if it
answered a one-off question, keep the number and delete the script, or leave it in `scratch/`
where it will not be committed. It must live somewhere under `test_scripts/` either way —
outside this tree `import 'playwright'` will not resolve.

The `game-harness` skill in [`.claude/skills/`](../.claude/skills/game-harness/) carries the
bootstrap boilerplate, the window hooks, the prompt-option shapes, and the traps that make a
harness silently pass while testing nothing.
