---
description: Play Dragon Ascent for real, measure it, and grade how fun it is out of 100
argument-hint: "[quick|full] [--mode ascent]"
allowed-tools: Bash, Read, Write, Glob, Grep
---

Play this game the way a player would, measure what cannot be judged by eye, and return a
graded verdict. Argument: `$ARGUMENTS` (default `full`; `quick` skips the watched session and
the strategy iteration).

Fun is a judgement, but most of its preconditions are arithmetic. Compute those, then judge only
what is left. **Do not grade from the source code** — grade from what the harnesses report and
what the screenshots show. A system that reads well and plays badly is the exact failure this
command exists to catch.

## 1 · Bring up a server

The harnesses need a dev server. Check whether one is already serving *this* project before
starting another — port 5173 is commonly taken by something else:

```bash
curl -s http://localhost:5173/ | grep -q "Mandate of" && echo "5173 is ours" || echo "start our own"
```

If it is not ours, start one on a free port and export `PLAYTEST_URL` for every harness call:

```bash
(nohup npx vite --host 127.0.0.1 --port 5199 --strictPort > /tmp/ascent-dev.log 2>&1 &)
sleep 4 && export PLAYTEST_URL=http://127.0.0.1:5199
```

Stop any server you started when you are done.

## 2 · Measure what is measurable

```bash
node test_scripts/playtest-metrics.mjs --seeds 8 --ticks 600
```

This returns an objective score out of 85 across six dimensions — agency, divergence, pacing,
tension, economy and showpiece exposure — with the reasoning for each. Full output lands in
`output/playtest/metrics.json`.

The headline is **agency**: engaged play versus play that declines every offer. If declining
wins, stop treating anything else as the main problem and say so plainly in the verdict.

## 3 · Watch a session (skip on `quick`)

```bash
node test_scripts/playtest-session.mjs --minutes 8 --seed 1337
```

This drives the real UI with real taps at real speed, so an unclickable control fails here rather
than passing silently. It writes `output/playtest/session/timeline.json` and a screenshot of the
first sighting of each distinct screen.

**Now actually look.** `Read` every PNG under `output/playtest/session/`. For each decision
screen, answer honestly:

- Do the options differ in **kind**, or only by a number? Four provinces that vary by garrison
  size are one option presented four times.
- Could a player say *why* they picked one? If the only basis is "the first one", the card is
  a formality.
- Does the screen say what just changed on the map, and why?
- Is the most important number the one the player is actually playing against?

Also read `timeline.json` for the gaps between decisions and the `onCard` text of each prompt —
the copy tells you as much as the layout does.

## 4 · Play it yourself (skip on `quick`)

The sharpest question is whether a thinking player can get *better*. Write a strategy, run it,
read what it did, and write a better one.

```bash
node test_scripts/playtest-play.mjs --template > /tmp/attempt.json
# edit it, then:
node test_scripts/playtest-play.mjs --strategy /tmp/attempt.json --seeds 8
```

Do at least three attempts, and make each one a real hypothesis you can state in a sentence —
the `reasoning` field is not decoration, it is the thing you are testing. Use the
"most-refused options" report to see what you walked past. Then:

```bash
node test_scripts/playtest-play.mjs --leaderboard
```

Judge the **skill ceiling** from the improvement curve:

- Attempt 3 cannot beat attempt 1 → no skill expression; the game plays itself.
- Big improvement, but the winning strategy is *refusing to engage* → skill exists and rewards
  not playing. Say this outright; it is worse than no skill ceiling.
- Big improvement from a strategy that engages harder and smarter → the game has depth.

## 5 · Grade it

Objective score out of 85 comes from step 2. Add your own judgement out of 15:

| Dimension | Points | What earns them |
|---|---|---|
| Choice quality | 8 | Options differ in kind; a player can say why they picked one |
| Legibility | 7 | The screen shows what is happening, what changed, and what to do about it |

Report the total out of 100 with a grade — **A** 85+, **B** 70+, **C** 55+, **D** 40+, **F**
below — and then, in order:

1. **The verdict**, in two sentences. No hedging.
2. **The single most costly problem**, with the number that proves it.
3. **Three fixes**, ranked by how much fun each buys per unit of work, each naming the file it
   lands in.
4. **What is already good** and must not be broken while fixing the rest.

Quote real numbers throughout — `engaged 15 waves vs declining 29` is an argument, "feels
shallow" is not. If a harness contradicts your impression from the screenshots, trust the
harness and say where your impression was wrong.

Write the verdict to `output/playtest/verdict.md` as well as reporting it, so runs can be
diffed against each other after a change.
