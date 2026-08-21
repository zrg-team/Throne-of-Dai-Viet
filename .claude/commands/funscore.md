---
description: Fast objective gameplay score — run before and after a change to see if it helped
argument-hint: "[--seeds 8] [--ticks 600]"
allowed-tools: Bash, Read
---

The cheap half of `/playtest`: no rendering, no screenshots, no judgement. Just the six
measurable preconditions of fun, in about a minute. Run it before a gameplay change and again
after, and compare.

Arguments: `$ARGUMENTS` (passed through to the harness).

## Run it

Make sure a dev server for *this* project is up, then:

```bash
node test_scripts/playtest/playtest-metrics.mjs $ARGUMENTS
```

If port 5173 belongs to another project, start one and point the harness at it:

```bash
(nohup npx vite --host 127.0.0.1 --port 5199 --strictPort > /tmp/ascent-dev.log 2>&1 &)
sleep 4 && PLAYTEST_URL=http://127.0.0.1:5199 node test_scripts/playtest/playtest-metrics.mjs $ARGUMENTS
```

Stop any server you started afterwards.

## Report it

Give the score out of 85, the per-dimension breakdown, and — this is the point of the command —
**what moved since last time**. `output/playtest/metrics.json` holds the previous run; read it
before overwriting if you want a comparison, or ask the user for the earlier numbers.

Lead with **agency**. Everything else is secondary while a player who declines every offer
outlives one who engages: that single ratio decides whether the game rewards being played.

Keep it short. This command is a gauge, not an essay — one screen of numbers and one sentence
saying whether the change helped, hurt, or did nothing measurable.

If any dimension scores zero, name the one line of code responsible if you can find it quickly;
do not go hunting. `/playtest` is where investigation belongs.
