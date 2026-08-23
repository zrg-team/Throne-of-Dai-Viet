# Splitting ConquestUIScene

`src/scenes/ConquestUIScene.ts` reached 11,115 lines and 152 methods. These scripts are how it
became 842 lines and 36 modules under `src/scenes/conquest/`, and how the result was proved to be
the same code in different places rather than a rewrite.

They are one-shot: the split has happened. They are kept because the partition is the interesting
part, and because re-cutting it later — moving three functions into a new module — is a matter of
editing `partition.json` and running the two commands again, rather than a fortnight of hand edits.

## The shape it produced

The class keeps every field, the Phaser lifecycle, and a one-line forwarding method for each
function another module needs to reach. Each module function takes the scene as `self`.

| kind | where | called how |
|---|---|---|
| facade | exported from its module, forwarded by the class | `self.showBattle()` |
| local | not exported, only its own file calls it | `showBattle(self)` |
| leaf | `constants.ts`, `layers.ts`, `battle/geometry.ts` — these import no sibling | imported directly |

Cross-module calls hop through the class, which is why nothing under `src/scenes/conquest/` imports
a sibling except the three leaves. That is the whole cycle-avoidance strategy, and `verify.cjs`
enforces it as a rule — a fourth file acquiring importers fails the check, not just a cycle.

## What has to stay on the class

Two things, and both were learnt by getting them wrong:

**The fields.** The Playwright harnesses reach into a live scene by name — `ui.openPromptKey`,
`ui.modalLayer`, `ui.battleUi` — so those are load-bearing property names, not private detail.

**Any method a harness names.** The first cut exported on "another *module* calls it" alone, and ten
methods the harnesses drive by name — `renderActionBar`, `tourStages`, `battleScaleAt`,
`drainBattleBeat`, `showBuildOptions`, `showGovernorPicker`, `showClaimTargets`, `showSeatPicker`,
`showMethodActorPicker`, `stampFormationChip` — stopped existing on the class. Three of those call
sites guard with `typeof … === 'function'`, so they did not fail: they skipped, and the harness
passed while testing nothing. `extract.cjs` now greps `test_scripts/` and forces a forwarder for
every method it finds named there.

## Re-running it

The extractor reads the *pristine* file, so recover it from git first:

```bash
git show <commit-before-the-split>:src/scenes/ConquestUIScene.ts > /tmp/ConquestUIScene.orig.ts
cp /tmp/ConquestUIScene.orig.ts src/scenes/ConquestUIScene.ts
rm -rf src/scenes/conquest

node scripts/conquest-split/headers.cjs save /tmp/headers.json
node scripts/conquest-split/extract.cjs scripts/conquest-split/partition.json
node scripts/conquest-split/finish.cjs
node scripts/conquest-split/headers.cjs restore /tmp/headers.json
node scripts/conquest-split/verify.cjs /tmp/ConquestUIScene.orig.ts PORTRAIT_W,PORTRAIT_TOP,BATTLE_STRIP_LABEL
```

`extract.cjs --dry` prints the partition without writing anything: which methods become facade,
which become module-local, which become leaves, and what the class keeps.

`headers.cjs` exists because re-running regenerates the placeholder module headers and would
otherwise throw away the hand-written ones. `restore` names any file it had no header for — a new
module, or one whose contents changed enough that its header wants rereading.

One thing it cannot restore is a doc comment's *owner*. Leading comments are trivia, not part of the
syntax tree, so a block sitting above the wrong declaration travels with whatever code lands next to
it — and the partition decides what that is. The class's own doc has ridden into two different
modules on two different cuts (`finish.cjs` hunts it down and puts it back); four more orphans had to
be moved by hand. After a re-cut, look for stacked `*/` `/**` pairs.

## Why the AST and not sed

Three things a textual pass gets wrong, all of them present in this file:

- Fields and getters are interleaved among the methods (a field at line 1379, another at 4052), so
  line ranges do not partition the class.
- `this` appears inside comments, and inside a type query (`typeof this.state.resources`) where it
  parses as a plain identifier rather than a `ThisKeyword`.
- 18 template literals carry real newlines in their *string* spans. Every method lost two columns of
  indentation in the move, and dedenting those lines would have quietly changed text the game prints.

## What verify.cjs proves

It parses the pristine file and the split tree and compares every method body as a syntax tree,
after undoing the three rewrites the extractor is allowed to make (`this`→`self`, the de-facaded
call form, and `ConquestUIScene.ICON_GUTTER`→`ICON_GUTTER`). It also checks that every forwarding
method really just forwards, that the top-level declarations still say what they said, that no
string literal changed, and that the module import graph has no cycles.

It is not a behaviour test. `test_scripts/gate/smoke.mjs` and the `test_scripts/verify/` family are.
