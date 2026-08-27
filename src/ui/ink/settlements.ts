import Phaser from 'phaser';
import { PIGMENT } from './palette';
import { hatchPoly, inkPath, mulberry32, printedShape, washFill, type Pt } from './stroke';
import {
  areca, bamboo, banyan, bep, boThoc, chuongTrau, dinh, gieng, groundShadow, hayStack, house, thap, tree,
} from './props';
import { seasonalStage } from './season';

/**
 * Places people live, and the fields that feed them.
 *
 * A village is an **arrangement**, not a scatter: pond in front, houses in a row facing it across
 * the swept yard, bamboo hedge closing the back, areca down one side. Throwing the same parts
 * around at random — which the first pass did — reads as clutter, which is what a village is the
 * opposite of.
 */

type G = Phaser.GameObjects.Graphics;

export type Era = 'dinh' | 'ly' | 'tran' | 'le' | 'nguyen';

/**
 * The century the map is being drawn in.
 *
 * `citadel` has taken an era since it was written and the Đông Hồ renderer passed the literal
 * `'le'` to it, so every seat in every mode has been stuck in the fifteenth century — the host
 * outside the walls advanced through four dynasties while the walls themselves never moved.
 *
 * Held here rather than threaded through `addCityCluster`, which is four signatures deep in an
 * interface three renderers implement and carries no state at all. `getActiveMapTheme()` is the
 * same shape and the same reason. `SettlementRenderer` sets it from the run's own mandate as it
 * builds each cluster, which is the one place that has both the state and the drawing.
 */
let drawnEraValue: Era = 'le';
export function setDrawnEra(era: Era): void { drawnEraValue = era; }
export function drawnEra(): Era { return drawnEraValue; }

/**
 * One thing standing on the ground, and the line it stands on.
 *
 * The eye reads a scene bottom-up: what is lower on the sheet is nearer, and nearer things cover
 * farther ones. Every composite in this file collects its parts as these and paints them in `y`
 * order, rather than in the order the code happens to mention them — which is how a banyan at
 * `y − 7s` ended up drawn over houses a full 14·s in front of it.
 *
 * Ground itself — a swept yard, a pond, a field — is not standing and is painted before the lot.
 */
interface Standing {
  y: number;
  draw: () => void;
}

function paintStanding(parts: Standing[]): void {
  parts.sort((a, b) => a.y - b.y);
  for (const part of parts) {
    part.draw();
  }
}

/**
 * A knot of roofs at slightly different angles, packed the way houses that grew up together sit.
 *
 * Everything standing here goes into **one** list sorted by the ground it stands on. The houses were
 * already sorted among themselves; the three trees and the haystack were then painted over the lot
 * with no comparison at all, and a tree's ground line can be 19·s *behind* the roofs. That is the
 * single most visible ordering fault on the map — a tree drawn over the house it stands behind.
 */
/**
 * Keeps standing props off each other's ground.
 *
 * A settlement's props were each placed by one roll of the dice and drawn wherever it landed, so
 * two roofs could be dealt the same patch of earth and a tree could be dealt a roof — which is
 * what the villages kept coming out as: a house behind a house behind a canopy, none of them
 * whole. Painting order fixed which one was in front; it could not stop them being on top of each
 * other in the first place.
 *
 * The footprints are ELLIPSES, not circles, and much wider than they are tall, because everything
 * here is drawn in oblique: two roofs a roof's width apart read as two houses, and two roofs the
 * same distance apart *vertically* read as one house behind another. Circles would space the
 * village out along a dimension it is not seen in.
 */
export class GroundSpacer {
  private readonly taken: Array<{ x: number; y: number; rx: number; ry: number }> = [];

  /** Whether this footprint clears everything already standing. */
  free(x: number, y: number, rx: number, ry: number): boolean {
    return !this.taken.some((other) => {
      const dx = (x - other.x) / (rx + other.rx);
      const dy = (y - other.y) / (ry + other.ry);
      return dx * dx + dy * dy < 1;
    });
  }

  claim(x: number, y: number, rx: number, ry: number): void {
    this.taken.push({ x, y, rx, ry });
  }

  /**
   * The first candidate position that clears the ground, claimed. `undefined` when the village is
   * full — and the caller is expected to DROP that prop rather than force it in. A hamlet of four
   * houses that all read is worth more than one of six where two are a smear.
   */
  fit(next: () => { x: number; y: number }, rx: number, ry: number, tries = 14): { x: number; y: number } | undefined {
    for (let attempt = 0; attempt < tries; attempt += 1) {
      const at = next();
      if (this.free(at.x, at.y, rx, ry)) {
        this.claim(at.x, at.y, rx, ry);
        return at;
      }
    }
    return undefined;
  }
}

export function hamlet(g: G, x: number, y: number, s: number, seed: number, count = 6): void {
  const rand = mulberry32(seed);
  const standing: Standing[] = [];
  // Every prop here asks the ground for room before it takes it, and gives up its place rather
  // than stand on somebody. The disc is wider than it was — houses that have to clear each other
  // need somewhere to go, and a hamlet crowded into the old radius simply lost half its roofs.
  const spacer = new GroundSpacer();

  for (let index = 0; index < count; index += 1) {
    const at = spacer.fit(() => {
      const angle = rand() * Math.PI * 2;
      const distance = Math.sqrt(rand()) * 56 * s;
      return { x: x + Math.cos(angle) * distance * 1.4, y: y + Math.sin(angle) * distance * 0.55 };
    }, 15 * s, 5.5 * s);
    if (!at) {
      continue;
    }
    const hs = s * (0.95 + rand() * 0.1);
    const hseed = seed + index * 37;
    standing.push({
      y: at.y,
      draw: () => {
        groundShadow(g, at.x + 13 * hs, at.y + 1, 17 * hs, 0.08);
        house(g, at.x, at.y, hs, hseed);
      },
    });
  }

  // A tree standing ON a roof was the other half of it — and the canopy is the biggest thing in a
  // hamlet, so it took the whole house with it. Trees claim more ground than a house does.
  for (let index = 0; index < 3; index += 1) {
    const at = spacer.fit(
      () => ({ x: x + (rand() - 0.5) * 116 * s, y: y + (rand() - 0.5) * 42 * s }),
      17 * s,
      7 * s,
    );
    if (!at) {
      continue;
    }
    // Jitter only — variety between the three trees, not a size of their own.
    const ts = s * (0.9 + rand() * 0.2);
    standing.push({ y: at.y, draw: () => tree(g, at.x, at.y, ts, seed + 500 + index) });
  }

  const stackY = y + 10 * s;
  spacer.claim(x - 58 * s, stackY, 11 * s, 5 * s);
  standing.push({ y: stackY, draw: () => hayStack(g, x - 58 * s, stackY, s, seed + 600) });

  paintStanding(standing);
}

/**
 * Làng — the village as an arrangement, with its lũy tre: the bamboo hedge round the settlement,
 * the single most defining silhouette in the north.
 */
export function village(g: G, x: number, y: number, s: number, seed: number): void {
  const rand = mulberry32(seed);
  const baseY = y + 7 * s;

  // ── ground first: a yard is swept earth and a pond is a hole in it, and nothing standing on
  // either belongs underneath them.
  const yard: Pt[] = [
    { x: x - 27 * s, y: baseY + 3 * s }, { x: x + 27 * s, y: baseY + 2 * s },
    { x: x + 24 * s, y: baseY + 13 * s }, { x: x - 24 * s, y: baseY + 14 * s },
  ];
  washFill(g, yard, PIGMENT.diepLo, seed + 2, 0.4);
  inkPath(g, yard, seed + 3, { width: 0.6, alpha: 0.28, wobble: 0.5, step: 10, closed: true });

  // The ao. Where it sits and how big it is varies, and a village on high ground has none at all —
  // it used to be the same ellipse in the same place in every village in the country.
  const hasPond = rand() > 0.22;
  const pondX = x + (rand() - 0.5) * 26 * s;
  const pondR = 12 * s + rand() * 7 * s;
  const pondY = y + 25 * s;
  if (hasPond) {
    const pond: Pt[] = [];
    for (let index = 0; index <= 14; index += 1) {
      const angle = (index / 14) * Math.PI * 2;
      pond.push({
        x: pondX + Math.cos(angle) * pondR * (0.9 + rand() * 0.2),
        y: pondY + Math.sin(angle) * pondR * 0.42,
      });
    }
    printedShape(g, pond, PIGMENT.chamWash, seed + 4, {
      width: 0.75, alpha: 0.5, colour: PIGMENT.cham, wobble: 0.4, step: 7, fillAlpha: 0.62,
    });
  }

  // ── then everything standing on it, back to front. The lũy tre closes the back at −26·s, the
  // cây đa stands at −7·s, the roofs at +7·s, the cau and the cây rơm at +24·s. Painted in the
  // order they are mentioned — which is what this used to do — the hedge is correct by luck and
  // the banyan, the largest prop on the map, covers three houses standing in front of it.
  const standing: Standing[] = [];

  /**
   * Every village used to be the same picture.
   *
   * Three roofs on one line at a fixed 34·s pitch, all thatch, all one size, behind a five-clump
   * hedge at a fixed 31·s — so the only thing a seed decided was whether the edge tree was a cây đa
   * or a clump of cau. Forty-two provinces of that reads as one village drawn forty-two times.
   *
   * The spacer is the same one `hamlet()` has always used: a prop asks the ground for room and is
   * **dropped** rather than forced in, because four roofs that read beat six where two are a smear.
   * `village()` simply never asked for it.
   */
  const spacer = new GroundSpacer();
  // The pond and the hedge are ground that is already spoken for; claiming them is what stops a
  // roof being planted in the water or inside the bamboo.
  if (hasPond) {
    spacer.claim(pondX, pondY, pondR, pondR * 0.42);
  }

  // Everything standing here is drawn at the settlement's own `s` and nothing else. The per-prop
  // multipliers that used to sit here — bamboo 0.72, areca 0.72, banyan 0.85, cây rơm 0.9 — were
  // each other's neighbours being talked down to fit, and they fought the corrections in `UNIT`
  // that already carry how big these things really are. A lũy tre is twelve metres because bamboo
  // is twelve metres, not because a village looks tidier that way.
  // The lũy tre closes the back. Kept as a HEDGE — evenly pitched, full-size clumps — with only a
  // little play in the step and the standing line. An earlier pass gave it random gaps and a size
  // jitter and it stopped being a hedge: thin, patchy, and no longer the wall a làng sits behind.
  const clumps = 5;
  for (let index = 0; index < clumps; index += 1) {
    const bx = x - 62 * s + index * 31 * s + (rand() - 0.5) * 5 * s;
    const by = y - 26 * s + (index % 2) * 5 * s + (rand() - 0.5) * 3 * s;
    spacer.claim(bx, by, 7 * s, 4 * s);
    standing.push({ y: by, draw: () => bamboo(g, bx, by, s, seed + 20 + index) });
  }

  /**
   * The roofs, in a ROW facing the yard — which is what this file's header says a village is, and
   * what an earlier pass of mine threw away.
   *
   * Scattering the houses over the yard with a random offset does not read as a natural village; it
   * reads as litter, because a row of roofs along a lane is the arrangement a real làng has and the
   * eye knows it. So the arrangement is kept and the VARIATION happens inside it: how many roofs,
   * how wide the street is, which of them are tiled, how big each is, and a small stagger off the
   * line. Same grammar, different sentence.
   */
  const roofs = 3 + Math.floor(rand() * 2);
  const pitch = (30 + rand() * 8) * s;
  const rowX = x - pitch * (roofs - 1) * 0.5;
  for (let index = 0; index < roofs; index += 1) {
    const hs = s * (0.9 + rand() * 0.22);
    const tiled = rand() < 0.32;
    const hseed = seed + 10 + index;
    // A street is not a ruler: a few units of stagger off the line, and no more.
    const hx = rowX + index * pitch + (rand() - 0.5) * 5 * s;
    const hy = baseY + (index % 2 === 1 ? 3 * s : 0) + (rand() - 0.5) * 3 * s;
    // The spacer is a backstop here rather than the placement rule — the row already clears itself,
    // and this only catches a roof that would land in the ao or the hedge.
    if (!spacer.free(hx, hy, 14 * s, 6 * s)) {
      continue;
    }
    spacer.claim(hx, hy, 14 * s, 6 * s);
    standing.push({ y: hy, draw: () => house(g, hx, hy, hs, hseed, tiled) });
  }
  // The stand at the village's edge: a cây đa OR a clump of cau, never both. They were drawn at
  // +46 and +54 — inside the last roof at +34 and on top of each other — so a village came out
  // with palms growing through its houses and the banyan growing through the palms. One tall thing
  // at the edge, and it starts clear of the last house rather than in it.
  // +76, not +62: the lũy tre's last clump stands at +62, so the edge tree was being planted in
  // the hedge as well as in the houses.
  // The rest of a làng. Each is rolled per village, so no two hold the same set — a village with a
  // byre and no well is a different place from one with a well and no byre, and that difference is
  // most of what stops forty-two provinces reading as one settlement drawn forty-two times.
  /**
   * The outbuildings take DELIBERATE stations, not random ones — a kitchen sits behind the row, a
   * byre and a bin at the ends of it, the well out on the yard. Rolled for presence, placed by
   * rule: which of them a village has is what varies, not where they land.
   */
  const outbuilding = (
    chance: number,
    ox: number,
    oy: number,
    rx: number,
    ry: number,
    draw: (ax: number, ay: number) => void,
  ): void => {
    if (rand() > chance) {
      return;
    }
    const ax = x + ox + (rand() - 0.5) * 6 * s;
    const ay = baseY + oy + (rand() - 0.5) * 3 * s;
    if (!spacer.free(ax, ay, rx, ry)) {
      return;
    }
    spacer.claim(ax, ay, rx, ry);
    standing.push({ y: ay, draw: () => draw(ax, ay) });
  };
  const endSign = rand() < 0.5 ? -1 : 1;
  // The kitchen stands off the main house because of the cooking fire, so it sits behind the row.
  outbuilding(0.7, endSign * 22 * s, -11 * s, 9 * s, 5 * s, (ax, ay) => bep(g, ax, ay, s, seed + 60));
  outbuilding(0.55, -endSign * 62 * s, 4 * s, 11 * s, 5 * s, (ax, ay) => chuongTrau(g, ax, ay, s, seed + 70));
  outbuilding(0.6, endSign * 58 * s, 1 * s, 5 * s, 4 * s, (ax, ay) => boThoc(g, ax, ay, s, seed + 80));
  outbuilding(0.45, -endSign * 30 * s, 12 * s, 6 * s, 4 * s, (ax, ay) => gieng(g, ax, ay, s, seed + 90));

  // The edge stand sits outside the yard, so it is placed rather than fitted — but it claims its
  // ground all the same, in case anything else ever wants to stand out there.
  const edgeX = x + 82 * s;
  const hasBanyan = rand() > 0.5;
  if (hasBanyan) {
    const banyanY = y - 7 * s;
    spacer.claim(edgeX, banyanY, 20 * s, 9 * s);
    standing.push({ y: banyanY, draw: () => banyan(g, edgeX, banyanY, s, seed + 50) });
  } else {
    for (let index = 0; index < 3; index += 1) {
      const ax = edgeX + index * 8 * s;
      const ay = y + 24 * s - index * 9 * s;
      spacer.claim(ax, ay, 6 * s, 5 * s);
      standing.push({ y: ay, draw: () => areca(g, ax, ay, s, seed + 30 + index) });
    }
  }
  // The cây rơm keeps its station at the end of the yard, with a little play.
  const stackY = y + 24 * s + (rand() - 0.5) * 4 * s;
  const stackX = x - 50 * s + (rand() - 0.5) * 10 * s;
  if (spacer.free(stackX, stackY, 5 * s, 4 * s)) {
    spacer.claim(stackX, stackY, 5 * s, 4 * s);
    standing.push({ y: stackY, draw: () => hayStack(g, stackX, stackY, s, seed + 40) });
  }

  paintStanding(standing);
}

/**
 * Thành — a walled seat in oblique. The dynasties do not differ by a label:
 *
 *  · Đinh strings a short **earth-and-timber** rampart between the karst, with a plain beam
 *    over the gate and no tower at all — Hoa Lư was built in ten years by a state that had
 *    just finished a civil war, and it is the only seat here narrower than its own village
 *  · Lý and Trần raise **rammed-earth** ramparts with a tower over the gate
 *  · Lê builds a **brick** rectangle with a two-tier gatehouse
 *  · Nguyễn builds **Huế** — a low, broad Vauban work with an angled bastion and the long,
 *    three-arched Ngọ Môn carrying a pavilion
 *
 * If they read the same, the drawing has failed.
 */
export function citadel(g: G, x: number, y: number, s: number, era: Era, seed: number): void {
  const brick = era === 'le' || era === 'nguyen';
  const w = (era === 'nguyen' ? 104 : era === 'le' ? 86 : era === 'dinh' ? 62 : 74) * s;
  const depth = 30 * s;
  const wallH = (era === 'nguyen' ? 8 : era === 'tran' ? 14 : 11) * s;
  const dx = depth * 0.62;
  const dy = depth * -0.42;
  const faceLight = brick ? PIGMENT.diepLo : PIGMENT.diepHi;
  const faceDark = brick ? PIGMENT.nau : PIGMENT.diepLo;
  const hatchGap = brick ? 3.4 : 5;

  groundShadow(g, x + w * 0.5, y + 3 * s, w * 0.62, 0.09);

  // what stands inside, drawn first so the rampart is in front of it
  // What stands inside is drawn at the citadel's own `s`, like every other roof on the map. The
  // halved scales that used to sit here were the buildings being talked down to fit inside the
  // rampart, which made a seat's houses smaller than the hamlet's outside its gate.
  if (era === 'ly') {
    thap(g, x + w * 0.5, y + dy * 0.4 - wallH * 0.1, s, seed + 300, 7);
  } else if (era === 'nguyen') {
    dinh(g, x + w * 0.16, y + dy * 0.55 - wallH * 0.3, s, seed + 300);
    house(g, x + w * 0.62, y + dy * 0.5 - wallH * 0.3, s, seed + 310, true);
  } else {
    dinh(g, x + w * 0.2, y + dy * 0.55 - wallH * 0.4, s, seed + 300);
    house(g, x + w * 0.66, y + dy * 0.5 - wallH * 0.4, s, seed + 310, true);
  }

  const side: Pt[] = [
    { x: x + w, y }, { x: x + w + dx, y: y + dy },
    { x: x + w + dx, y: y + dy - wallH }, { x: x + w, y: y - wallH },
  ];
  washFill(g, side, faceDark, seed + 1, 0.9);
  hatchPoly(g, side, 0.95, hatchGap, PIGMENT.mucSoft, brick ? 0.2 : 0.13, 0.55);
  inkPath(g, side, seed + 2, { width: 1.0 * s, alpha: 0.68, wobble: 0.12 * s, step: 7, closed: true });

  if (era === 'nguyen') {
    const bastion: Pt[] = [
      { x: x - 1 * s, y }, { x: x - 15 * s, y: y - 6 * s },
      { x: x - 15 * s, y: y - 6 * s - wallH }, { x: x - 1 * s, y: y - wallH },
    ];
    washFill(g, bastion, faceLight, seed + 5, 0.94);
    hatchPoly(g, bastion, 0.95, 3.4, PIGMENT.mucSoft, 0.18, 0.55);
    inkPath(g, bastion, seed + 6, { width: 1.1 * s, alpha: 0.82, wobble: 0.14 * s, step: 7, closed: true });
  }

  const front: Pt[] = [{ x, y }, { x: x + w, y }, { x: x + w, y: y - wallH }, { x, y: y - wallH }];
  washFill(g, front, faceLight, seed + 3, 0.95);
  hatchPoly(g, front, 0.95, hatchGap, PIGMENT.mucSoft, brick ? 0.17 : 0.11, 0.55);
  inkPath(g, front, seed + 4, { width: 1.2 * s, alpha: 0.85, wobble: 0.16 * s, step: 9, closed: true });
  inkPath(g, [{ x: x + 1 * s, y: y - wallH * 0.28 }, { x: x + w - 1 * s, y: y - wallH * 0.3 }], seed + 7, {
    width: 0.7 * s, alpha: 0.3, wobble: 0.1 * s, step: 9,
  });

  const rand = mulberry32(seed + 90);
  const merlons = Math.max(3, Math.round(w / (7.5 * s)));
  for (let index = 0; index < merlons; index += 1) {
    const mx = x + 3 * s + (index * (w - 6 * s)) / (merlons - 1);
    const mh = (2.2 + rand() * 0.9) * s;
    inkPath(
      g,
      [
        { x: mx - 1.7 * s, y: y - wallH }, { x: mx - 1.7 * s, y: y - wallH - mh },
        { x: mx + 1.7 * s, y: y - wallH - mh }, { x: mx + 1.7 * s, y: y - wallH },
      ],
      seed + 20 + index, { width: 0.7 * s, alpha: 0.62, wobble: 0.08 * s, step: 4 },
    );
  }

  const towerW = (era === 'tran' ? 15 : 11) * s;
  const towerH = (era === 'nguyen' ? 8 : era === 'tran' ? 18 : 13) * s;
  for (const px of [x - (era === 'nguyen' ? 12 : 2) * s, x + w - towerW + 2 * s]) {
    const body: Pt[] = [
      { x: px, y: y + 1 * s }, { x: px + towerW, y: y + 1 * s },
      { x: px + towerW, y: y - wallH - towerH }, { x: px, y: y - wallH - towerH },
    ];
    washFill(g, body, faceLight, seed + 60 + px, 0.96);
    hatchPoly(g, body, 0.95, hatchGap, PIGMENT.mucSoft, brick ? 0.16 : 0.1, 0.5);
    inkPath(g, body, seed + 61 + px, { width: 1.0 * s, alpha: 0.8, wobble: 0.12 * s, step: 7, closed: true });
    const ry = y - wallH - towerH;
    printedShape(
      g,
      [
        { x: px - 3 * s, y: ry }, { x: px + towerW + 3 * s, y: ry },
        { x: px + towerW * 0.72, y: ry - 4.6 * s }, { x: px + towerW * 0.28, y: ry - 4.6 * s },
      ],
      PIGMENT.mucSoft, seed + 62 + px, { width: 0.9 * s, alpha: 0.8, wobble: 0.1 * s, step: 5, fillAlpha: 0.92 },
    );
  }

  const gateW = (era === 'nguyen' ? 44 : era === 'le' ? 24 : 20) * s;
  const gateH = (era === 'le' ? 20 : era === 'nguyen' ? 12 : 15) * s;
  const gx = x + w * 0.42 - gateW * 0.2;
  const gate: Pt[] = [
    { x: gx, y: y + 1 * s }, { x: gx + gateW, y: y + 1 * s },
    { x: gx + gateW, y: y - wallH - gateH }, { x: gx, y: y - wallH - gateH },
  ];
  washFill(g, gate, faceLight, seed + 80, 0.97);
  hatchPoly(g, gate, 0.95, hatchGap, PIGMENT.mucSoft, brick ? 0.15 : 0.09, 0.5);
  inkPath(g, gate, seed + 81, { width: 1.15 * s, alpha: 0.86, wobble: 0.14 * s, step: 8, closed: true });

  const arches = era === 'nguyen' ? 3 : 1;
  for (let index = 0; index < arches; index += 1) {
    const ax = gx + gateW * (arches === 1 ? 0.5 : 0.22 + index * 0.28);
    const aw = gateW * (arches === 1 ? 0.3 : 0.15);
    const arch: Pt[] = [];
    for (let step = 0; step <= 12; step += 1) {
      const angle = Math.PI + (step / 12) * Math.PI;
      arch.push({ x: ax + Math.cos(angle) * aw * 0.5, y: y - 3.5 * s + Math.sin(angle) * aw * 0.6 });
    }
    arch.push({ x: ax + aw * 0.5, y: y + 1 * s }, { x: ax - aw * 0.5, y: y + 1 * s });
    printedShape(g, arch, PIGMENT.muc, seed + 82 + index, {
      width: 0.8 * s, alpha: 0.7, wobble: 0.1 * s, step: 5, fillAlpha: 0.72,
    });
  }

  const gy = y - wallH - gateH;
  if (era === 'dinh') {
    // A beam, not a gatehouse. Every other era here puts a roof over the gate; the one that
    // cannot is what says "this was raised in a hurry, by soldiers".
    printedShape(
      g,
      [
        { x: gx - 5 * s, y: gy }, { x: gx + gateW + 5 * s, y: gy },
        { x: gx + gateW + 5 * s, y: gy - 2.6 * s }, { x: gx - 5 * s, y: gy - 2.6 * s },
      ],
      PIGMENT.nau, seed + 91, { width: 1.0 * s, alpha: 0.8, wobble: 0.12 * s, step: 5, fillAlpha: 0.9 },
    );
  } else if (era === 'ly') {
    printedShape(
      g,
      [
        { x: gx - 4 * s, y: gy }, { x: gx + gateW + 4 * s, y: gy },
        { x: gx + gateW * 0.72, y: gy - 4.4 * s }, { x: gx + gateW * 0.28, y: gy - 4.4 * s },
      ],
      PIGMENT.mucSoft, seed + 91, { width: 1.0 * s, alpha: 0.82, wobble: 0.1 * s, step: 5, fillAlpha: 0.92 },
    );
  } else if (era === 'tran') {
    printedShape(
      g,
      [{ x: gx - 6 * s, y: gy }, { x: gx + gateW + 6 * s, y: gy }, { x: gx + gateW * 0.5, y: gy - 10 * s }],
      PIGMENT.mucSoft, seed + 91, { width: 1.15 * s, alpha: 0.84, wobble: 0.12 * s, step: 5, fillAlpha: 0.92 },
    );
  } else if (era === 'le') {
    for (let tier = 0; tier < 2; tier += 1) {
      const ry = gy - tier * 8 * s;
      const rw = gateW * (1 - tier * 0.22);
      printedShape(
        g,
        [
          { x: gx + (gateW - rw) / 2 - 5 * s, y: ry }, { x: gx + (gateW + rw) / 2 + 5 * s, y: ry },
          { x: gx + (gateW + rw) / 2 - 1.5 * s, y: ry - 5.4 * s }, { x: gx + (gateW - rw) / 2 + 1.5 * s, y: ry - 5.4 * s },
        ],
        PIGMENT.mucSoft, seed + 93 + tier, { width: 1.0 * s, alpha: 0.82, wobble: 0.1 * s, step: 5, fillAlpha: 0.92 },
      );
    }
  } else {
    dinh(g, gx + 1 * s, gy, s * 0.62, seed + 96);
  }
}

/** Where the gate's standard should be planted, so a caller can hang a live flag off it. */
export function citadelStandardAnchor(x: number, y: number, s: number, era: Era): Pt {
  const w = (era === 'nguyen' ? 104 : era === 'le' ? 86 : era === 'dinh' ? 62 : 74) * s;
  const wallH = (era === 'nguyen' ? 8 : era === 'tran' ? 14 : 11) * s;
  const gateW = (era === 'nguyen' ? 44 : era === 'le' ? 24 : 20) * s;
  const gateH = (era === 'le' ? 20 : era === 'nguyen' ? 12 : 15) * s;
  return { x: x + w * 0.42 - gateW * 0.2 + gateW * 0.5, y: y - wallH - gateH - 4 * s };
}

// ── fields ────────────────────────────────────────────────────────────────────

export interface FieldPlot {
  points: Pt[];
  /** 0–1. Below 0.32 flooded, below 0.68 transplanted, above that ripe. */
  stage: number;
  seed: number;
}

export interface PaddyLatticeOptions {
  /** Region the lattice covers, in the caller's own coordinates. */
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  /** Row height, and the unit plot widths are drawn from. */
  cell: number;
  seed: number;
  /** Safety valve for a very large region. */
  maxRows?: number;
  /** Called with each candidate plot's centre; return false to leave that ground unfarmed. */
  keep?: (x: number, y: number) => boolean;
}

/**
 * One wandering lattice of paddy plots over a region.
 *
 * The bund lines run the full width and every plot in a row is cut from the strip between two of
 * them, so **neighbouring plots share their bunds** and the field system ends raggedly at whatever
 * boundary `keep` describes. This is the whole difference between a delta and a patchwork blanket:
 * a set of independently-placed rectangles, each with its own outline and its own random size,
 * reads as loose paper scraps thrown on the ground no matter how nicely each one is drawn.
 *
 * Lives here rather than in the map renderer because the menu's far bank is the same country.
 */
export function paddyLattice(options: PaddyLatticeOptions): FieldPlot[] {
  const { x0, x1, y0, y1, cell, seed, maxRows = 400, keep } = options;
  const rand = mulberry32(seed);
  const rowCount = Math.min(maxRows, Math.ceil((y1 - y0) / cell) + 1);

  const lines: Pt[][] = [];
  for (let index = 0; index <= rowCount; index += 1) {
    const yy = y0 + index * cell;
    const line: Pt[] = [];
    for (let node = 0; node <= 26; node += 1) {
      line.push({
        x: x0 + ((x1 - x0) * node) / 26,
        y: yy + Math.sin(node * 0.62 + index * 1.21) * cell * 0.2 + (rand() - 0.5) * cell * 0.12,
      });
    }
    lines.push(line);
  }

  const heightAt = (line: Pt[], x: number): number => {
    const t = Math.max(0, Math.min(1, (x - line[0].x) / (line[26].x - line[0].x || 1)));
    const index = Math.min(25, Math.floor(t * 26));
    const fraction = t * 26 - index;
    return line[index].y + (line[index + 1].y - line[index].y) * fraction;
  };

  const plots: FieldPlot[] = [];
  for (let row = 0; row < rowCount; row += 1) {
    let x = x0 + (rand() - 0.5) * cell;
    while (x < x1) {
      const width = cell * (0.8 + rand() * 1.0);
      const mx = x + width / 2;
      const my = (heightAt(lines[row], mx) + heightAt(lines[row + 1], mx)) / 2;
      if (!keep || keep(mx, my)) {
        plots.push({
          points: [
            { x: x + 1, y: heightAt(lines[row], x) + 1 },
            { x: x + width - 1, y: heightAt(lines[row], x + width) + 1 },
            { x: x + width - 1, y: heightAt(lines[row + 1], x + width) - 1 },
            { x: x + 1, y: heightAt(lines[row + 1], x) - 1 },
          ],
          stage: rand(),
          seed: Math.round(mx * 7 + my * 13),
        });
      }
      x += width;
    }
  }
  return plots;
}

/**
 * Ruộng — wet paddy.
 *
 * What makes a delta beautiful from above is that the plots are at different **stages**: some
 * flooded and holding the sky, some green with transplanted rows, some gold and ready. Flat washes
 * of one colour, which the first pass drew, look like a patchwork blanket.
 *
 * The bund is drawn as **two lines**, because a raised path has two edges.
 */
export function drawFieldPlot(g: G, plot: FieldPlot): void {
  // Five states, not three. A delta seen from above is a patchwork precisely because its plots are
  // out of step with each other: one under water, one just turned and bare, one in ordered rows,
  // one gold, one under a seedling nursery's fine lattice. Three states over a whole map still read
  // as a repeating pattern, which is the failure the stages exist to avoid.
  //
  // The season shifts which of the five dominate without collapsing the patchwork — see
  // `seasonalStage`. On the map this resolves to the fixed bake season; on the menu, to the month
  // the player actually opened the game in.
  const stage = seasonalStage(plot.stage);
  const flooded = stage < 0.28;
  const fallow = !flooded && stage < 0.4;
  const nursery = stage > 0.9;
  const ripe = !nursery && stage > 0.68;

  const fill = flooded ? PIGMENT.chamWash
    : fallow ? PIGMENT.diepLo
      : nursery ? PIGMENT.tramPale
        : ripe ? PIGMENT.hoePale : PIGMENT.tramPale;
  washFill(g, plot.points, fill, plot.seed, flooded ? 0.6 : fallow ? 0.5 : 0.78);
  inkPath(g, plot.points, plot.seed + 1, { width: 0.7, alpha: 0.52, wobble: 0.5, step: 12, closed: true });

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const point of plot.points) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }

  if (flooded) {
    for (let line = 0; line < 2; line += 1) {
      const wy = minY + (maxY - minY) * (0.38 + line * 0.28);
      inkPath(g, [{ x: minX + 3, y: wy }, { x: minX + 3 + (maxX - minX) * 0.5, y: wy }], plot.seed + 2 + line, {
        width: 0.6, alpha: 0.42, colour: PIGMENT.cham, wobble: 0.2, step: 7,
      });
    }
    return;
  }

  // Turned earth: a couple of plough lines and nothing growing.
  if (fallow) {
    for (let line = 0; line < 3; line += 1) {
      const fy = minY + (maxY - minY) * (0.28 + line * 0.24);
      inkPath(g, [{ x: minX + 2, y: fy }, { x: maxX - 2, y: fy - 0.6 }], plot.seed + 4 + line, {
        width: 0.5, alpha: 0.3, colour: PIGMENT.nau, wobble: 0.25, step: 9,
      });
    }
    return;
  }

  // A seedling bed: a fine lattice, which is the one field pattern that reads as *worked* rather
  // than merely planted, and the thing the reference prints wherever a village keeps a nursery.
  if (nursery) {
    const cols = Math.max(3, Math.round((maxX - minX) / 4.5));
    const rows = Math.max(2, Math.round((maxY - minY) / 4.5));
    for (let column = 1; column < cols; column += 1) {
      const px = minX + ((maxX - minX) / cols) * column;
      inkPath(g, [{ x: px, y: minY + 1.5 }, { x: px, y: maxY - 1.5 }], plot.seed + 20 + column, {
        width: 0.4, alpha: 0.34, colour: PIGMENT.tram, wobble: 0.1, step: 6,
      });
    }
    for (let row = 1; row < rows; row += 1) {
      const py = minY + ((maxY - minY) / rows) * row;
      inkPath(g, [{ x: minX + 1.5, y: py }, { x: maxX - 1.5, y: py }], plot.seed + 40 + row, {
        width: 0.4, alpha: 0.34, colour: PIGMENT.tram, wobble: 0.1, step: 6,
      });
    }
    return;
  }

  // Transplanted rice stands in ordered rows, not scattered.
  const columns = Math.max(3, Math.round((maxX - minX) / 5));
  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const px = minX + 3 + ((maxX - minX - 6) / Math.max(1, columns - 1)) * column;
      const py = minY + ((maxY - minY) / 4) * (row + 1);
      inkPath(g, [{ x: px, y: py }, { x: px + 0.3, y: py - (ripe ? 2.8 : 2.1) }], plot.seed + column * 7 + row, {
        width: 0.5, alpha: ripe ? 0.55 : 0.44, wobble: 0,
      });
    }
  }
}
