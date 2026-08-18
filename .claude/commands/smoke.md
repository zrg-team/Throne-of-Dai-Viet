---
description: 40-second gate — boots every mode in a real browser and fails on console errors or a blank frame
argument-hint: "[--modes ascent,empire] [--shots] [--seed 1337]"
allowed-tools: Bash, Read
---

The cheapest check that can still fail honestly. A typecheck proves almost nothing about this
game — most regressions compile perfectly and then throw on boot, render an empty screen, or leave
a mode unreachable. Run this before saying a change works.

Arguments: `$ARGUMENTS` (passed to the harness).

## Run it

A dev server must be up. Port 5173 is often another project's, so check whose it is:

```bash
curl -s http://localhost:5173/ | grep -q "Mandate of" && echo "ours" || echo "start our own"
```

If it is not ours:

```bash
(nohup npx vite --host 127.0.0.1 --port 5199 --strictPort > /tmp/dev.log 2>&1 &)
sleep 6 && export DEV_URL=http://127.0.0.1:5199
```

Then:

```bash
npx tsc --noEmit && node test_scripts/smoke.mjs $ARGUMENTS
```

Stop any server you started afterwards.

## What it asserts

Per mode (`ascent`, `empire`, `campaign`, `rival`): the scene is reached, `advanceTime` moves the
tick counter, state has provinces, and the drawn frame is not one flat colour. Plus one global
check for console errors. It exits non-zero on failure, so `&&` chaining is safe.

Pass `--shots` to also write `output/smoke/<mode>.png`, and **Read the PNGs** if the change was
visual — a non-blank frame is a liveness check, not a judgement about whether it looks right.

## Report it

One line per failing check with the detail string, then the state fingerprint. If everything
passes, say so in a sentence and give the fingerprint — `turn`, `lands`, `armies` per mode is
exactly what diffs usefully across a shared-code change.

If a mode fails to reach its scene, that is almost always a throw during state construction: get
the console error out of the harness output rather than guessing from the diff.

This command is a gate, not an investigation. If it goes red, name the failing mode and the error;
use `/verify` or the matching harness to dig.
