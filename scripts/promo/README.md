# The promo film

A ~57-second animated trailer for Vạn Thắng, drawn by the game.

Nothing here is a screenshot and nothing is a slide of text. Every house, tree, buffalo, farmer,
soldier, banner and seal in the film comes out of `src/ui/ink/` — the same procedural Đông Hồ
drawing code the map uses, at the same proportions — through a Canvas2D shim. Two title lines at
the very end are the only lettering in it.

## What it shows

The third Mongol war, 1284–1288, in seven plates:

| | plate | |
|---|---|---|
| 1 | **Giấy điệp** | the country is drawn — coastline, three rivers, Thăng Long, and the Bạch Đằng estuary marked before anyone knows it matters |
| 2 | **Đồng bằng** | the delta, before: paddy, a village inside its lũy tre, a boy on a buffalo |
| 3 | **Bắc phương** | the Yuan come down over the bund the buffalo walked |
| 4 | **Sát Thát** | the host forms up in the dark, and sỏi son spreads through the ranks man by man |
| 5 | **Vườn không nhà trống** | the same village, emptied and burned, and a column arriving into nothing |
| 6 | **Bạch Đằng** | stakes driven at low water, the flood that hides them, the fleet drawn in, the ebb |
| 7 | **Vạn Thắng** | the realm restored, the drum, the title |

Plate 5 is the same village as plate 2 from roughly the same camera; that repetition is the whole
reason the emptiness lands.

## Running it

Needs a dev server and an ffmpeg.

```sh
yarn dev                                    # or any port, and pass --origin
node scripts/promo/stills.mjs               # contact sheet of the whole film, for looking at
node scripts/promo/montage.mjs              # lays those stills on one page
node scripts/promo/build-promo.mjs          # renders + encodes 1080x1920
node scripts/promo/build-promo.mjs --w 1920 --h 1080
```

ffmpeg is found from `--ffmpeg`, `$FFMPEG`, `PATH`, or a nearby `ffmpeg-static`. It is deliberately
**not** a dependency of this repo: 70 MB of binary that exists to cut one marketing asset should
not be in every contributor's install.

Useful flags: `--from`/`--to` render a slice (one plate at a time while tuning), `--keep` leaves the
PNG frames, `--fps`, `--origin`.

## How it is put together

| file | |
|---|---|
| `inkCanvas.ts` | the Canvas2D stand-in for `Phaser.GameObjects.Graphics`. Eleven methods, taken by grepping every call site under `src/ui/ink/` |
| `sheet.ts` | giấy điệp, ported from `src/ui/ink/paper.ts`; the night wash, the vignette, the registration wobble |
| `atlas.ts` | Đại Việt in 1288 and the seaboard, as real degrees projected once |
| `world.ts` | the handful of things the map never had to draw: water, tide, stakes, a war junk, a skiff, fire, smoke, banners |
| `ease.ts` | timing |
| `film.ts` | the seven plates |
| `stage.ts` | the projector: canvas, camera, pass order, `window.__promo` |

### Two things worth knowing before editing

**Every frame is a pure function of one number.** No wall clock, no rAF accumulator, no tween
manager. The driver asks for `render(t)` and gets the same pixels every time, so a frame that takes
400 ms to draw still lands on the timeline at its own thirtieth of a second. Keep it that way: the
moment anything accumulates, the film stops being renderable out of order and the encode starts
depending on how fast the machine is.

**The frame is a square, and the rest is weather.** Each plate names a square of world
(`Shot.half`) that every aspect ratio is guaranteed to show. A 9:16 render then has three quarters
of a square-side spare above and below. So every ground plate is built as a landscape — sky and
hills well above the subject, a foreground bank well below — and nothing that matters is ever
placed in the spare. That is what lets one set of drawings cut for a phone and for a laptop.

### The traps this hit, so the next person does not

- **`figure` pitch.** `drawHost` in `devices.ts` spaces men at 1.33 × their scale, which is right
  for a 40-pixel host on a province and catastrophic at film size — the ranks merge into a black
  bar. The `host()` helper here uses roughly double, plus per-plate overrides, and paints back ranks
  first.
- **Ink width is in *screen* pixels** unless the caller passes `zoom`. The atlas is drawn at
  K = 132 units per degree so the map plates run at a camera scale near 1:1; at the first K = 22 the
  coastline came out as a rope.
- **`litFrom` is absolute film seconds**, not plate-local. Passing a local value lit the village at
  t = 2 s and burnt it out twenty-five seconds before its own plate opened.
- **Smoke has no contour.** A soot puff given a soot outline reads as a stone.
- **The drum is `favicon.svg`, not `icon.svg`** — the icon carries its own sheet of paper, which
  arrives as a pale square around the mark.
- **Vite's dep optimizer.** A long-running dev server can serve `504 (Outdated Optimize Dep)` for
  `phaser.js` forever; the page is blank and nothing says why. `openStage.mjs` reloads through it;
  if that fails, restart the dev server (or run a second one on another port with `--force`).
