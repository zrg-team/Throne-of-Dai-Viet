/**
 * Generates the hero-portrait part library: one SVG per part in `public/faces/`, plus the
 * manifest `src/ui/faces/parts.generated.ts` that tells the renderer where each part sits.
 *
 * Why a generator rather than 55 hand-written files: the parts have to agree with each other
 * to the pixel — an eye drawn against one head shape and composited onto another is the whole
 * failure mode of layered portrait art. Keeping every path in one design space here means the
 * anatomy is defined once, and the crop offsets in the manifest are *measured* from the real
 * rendered geometry rather than typed in by hand.
 *
 * Parts that carry a colour the run chooses — skin, hair, robe — are drawn in white or grey
 * and tinted at runtime, so six skin tones cost one file rather than six. Parts whose colour is
 * fixed (gold coronet, black lacquer turban) are drawn in their own colour and never tinted.
 *
 * Output is committed. Re-run with `node scripts/build-faces.mjs` after editing a path; an
 * artist can also replace any single SVG by hand as long as its footprint does not move.
 *
 * Usage: node scripts/build-faces.mjs [--check]
 *   --check  verify the committed output matches what this script would emit, and fail if not
 */
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const OUT_SVG = 'public/faces';
const OUT_MANIFEST = 'src/ui/faces/parts.generated.ts';
const CHECK = process.argv.includes('--check');

// ── design space ────────────────────────────────────────────────────────────
// Every part is authored in this one coordinate system, origin at the portrait's centre.
// The renderer never needs to know these numbers: it reads the measured box from the manifest.
const VIEW = { x: -68, y: -88, w: 136, h: 174 };
const W = 58;                    // canonical head width
const H = 78;                    // canonical head height
const TOP = -12 - H / 2;         // crown          = -51
const CHIN = -12 + H / 2;        // chin           =  27
const NECK = CHIN + 10;          // base of throat =  37
const SHY = NECK + 30;           // shoulder line  =  67
const EYE_Y = -18;
const EX = 12.5;                 // eye centre offset from midline

/** Head silhouette. `jaw` narrows the lower half; `wide`/`tall` resize the whole skull. */
function headPath(wide = 0, tall = 0, jaw = 1) {
  const w = W + wide, h = H + tall;
  const x = w / 2, y = h / 2, j = x * jaw;
  return `M ${-x} ${-y * 0.18}
    C ${-x} ${-y * 0.78}, ${-x * 0.56} ${-y}, 0 ${-y}
    C ${x * 0.56} ${-y}, ${x} ${-y * 0.78}, ${x} ${-y * 0.18}
    C ${x} ${y * 0.36}, ${j * 0.9} ${y * 0.82}, 0 ${y}
    C ${-j * 0.9} ${y * 0.82}, ${-x} ${y * 0.36}, ${-x} ${-y * 0.18} Z`;
}

/** One eye, drawn to the left of the midline; the renderer mirrors it for the right. */
function eyeArt(lid, iris = '#171310') {
  return `
    <path d="M -8 ${lid * 0.4} q 4 ${-4.6 - lid} 8.6 ${-0.6} q -3.6 5.2 -8.6 0.6 Z" fill="#ffffff" opacity=".82"/>
    <path d="M -8.4 ${lid * 0.4} q 4.2 ${-5.2 - lid} 9 ${-0.8}" stroke="${iris}" stroke-width="2" fill="none" stroke-linecap="round"/>
    <circle cx="-2.6" cy="-1.6" r="2.5" fill="${iris}"/>`;
}
const pairEyes = (lid) =>
  `<g transform="translate(${-EX},${EY_T})">${eyeArt(lid)}</g>` +
  `<g transform="translate(${EX},${EY_T}) scale(-1,1)">${eyeArt(lid)}</g>`;
const EY_T = EYE_Y;

/** Both brows, mirrored, drawn white so the run's hair colour tints them. */
function brows(curve, drop) {
  const one = `<path d="M -10 ${-9 + drop} q 5 ${curve} 10.5 1.5" stroke="#ffffff" stroke-width="2.6" fill="none" stroke-linecap="round"/>`;
  return `<g transform="translate(${-EX},${EYE_Y})">${one}</g><g transform="translate(${EX},${EYE_Y}) scale(-1,1)">${one}</g>`;
}

// ── the part library ────────────────────────────────────────────────────────
// `tint` names the colour slot the renderer multiplies this part by. 'none' ships its own
// colour. `layer` is the paint order, low to high.
const PARTS = [];
const part = (key, layer, tint, body) => PARTS.push({ key, layer, tint, body });

// 10 · plate — the lacquered ground and its border. Rank warms the ground and gilds the edge.
for (const [name, ground, edge, weight] of [
  ['common', '#2a241a', '#5a4c33', 1.8],
  ['rare', '#2a2a1a', '#6c5a37', 1.8],
  ['epic', '#2f2618', '#8a6f3c', 1.8],
  ['legendary', '#3a2c14', '#c8a24e', 2.6],
]) {
  part(`plate-${name}`, 10, 'none',
    `<rect x="-66" y="-84" width="132" height="166" rx="3" fill="${ground}"/>
     <rect x="-66" y="-84" width="132" height="166" rx="3" fill="none" stroke="${edge}" stroke-width="${weight}"/>`);
}

// 20 · robe body. White, so the realm's colour tints it.
const shoulders = `M -46 ${SHY + 26} C -44 ${SHY - 14}, -20 ${NECK + 2}, 0 ${NECK + 2}
  C 20 ${NECK + 2}, 44 ${SHY - 14}, 46 ${SHY + 26} Z`;
part('robe-body', 20, 'robe', `<path d="${shoulders}" fill="#ffffff"/>`);
part('robe-armour', 20, 'robe',
  `<path d="${shoulders}" fill="#ffffff"/>
   <path d="M -40 ${SHY + 4} L 40 ${SHY + 4} M -40 ${SHY + 11} L 40 ${SHY + 11} M -40 ${SHY + 18} L 40 ${SHY + 18}"
     stroke="#9a9a9a" stroke-width="2.4"/>`);

// 22 · robe highlight, one step lighter than the body.
part('robe-sheen', 22, 'robeLight',
  `<path d="M 6 ${NECK + 2} C 26 ${NECK + 6}, 44 ${SHY - 8}, 46 ${SHY + 26} L 18 ${SHY + 26} Z" fill="#ffffff" opacity=".5"/>`);

// 25 · neck
part('neck', 25, 'skinShadow', `<rect x="-9" y="${NECK - 12}" width="18" height="22" fill="#ffffff"/>`);

// 30 · head shapes and ears
for (const [name, wide, tall, jaw] of [
  ['oval', 0, 0, 1], ['narrow', -4, 4, 0.82], ['broad', 6, -3, 1.12], ['square', 2, 0, 1.2], ['soft', -2, -2, 0.88],
]) {
  part(`head-${name}`, 30, 'skin', `<path d="${headPath(wide, tall, jaw)}" transform="translate(0,-12)" fill="#ffffff"/>`);
}
part('ears', 28, 'skinShadow',
  `<ellipse cx="${-W / 2 - 1}" cy="-10" rx="5.5" ry="11" fill="#ffffff"/>
   <ellipse cx="${W / 2 + 1}" cy="-10" rx="5.5" ry="11" fill="#ffffff"/>`);

// 35 · collars. The crossed lapel of the áo giao lĩnh is the strongest line in the portrait,
// so it gets its two halves as separate tint slots — dark under, light over.
part('collar-giaolinh', 35, 'robeDark',
  `<path d="M -26 ${NECK - 4} L 2 ${NECK + 22} L 2 ${NECK + 40} L -34 ${NECK + 10} Z" fill="#ffffff"/>`);
part('collar-giaolinh-over', 36, 'robeLight',
  `<path d="M 26 ${NECK - 4} L -2 ${NECK + 22} L -2 ${NECK + 40} L 34 ${NECK + 10} Z" fill="#ffffff"/>`);
part('collar-twoflap', 35, 'robeDark',
  `<path d="M -30 ${NECK + 2} L 0 ${NECK + 26} L 0 ${NECK + 40} L -34 ${NECK + 14} Z" fill="#ffffff"/>`);
part('collar-twoflap-over', 36, 'robeLight',
  `<path d="M 30 ${NECK + 2} L 0 ${NECK + 26} L 0 ${NECK + 40} L 34 ${NECK + 14} Z" fill="#ffffff"/>`);
part('sash-ochre', 37, 'none', `<rect x="-24" y="${NECK + 30}" width="48" height="5" rx="2" fill="#b07a24"/>`);
part('sash-baldric', 37, 'none', `<path d="M -34 ${NECK + 22} L 34 ${NECK + 34}" stroke="#d9b35a" stroke-width="5"/>`);

// Áo ngũ thân — the 1744 reform: a standing collar closing to the right, five buttons.
part('collar-nguthan', 35, 'robeLight',
  `<path d="M -16 ${NECK - 6} L 16 ${NECK - 6} L 16 ${NECK + 4} L -16 ${NECK + 4} Z" fill="#ffffff"/>`);
part('collar-nguthan-body', 36, 'robe',
  `<path d="M -16 ${NECK + 2} C -6 ${NECK + 12}, 10 ${NECK + 10}, 20 ${NECK + 4} L 24 ${NECK + 40} L -20 ${NECK + 40} Z" fill="#ffffff"/>`);
part('buttons-five', 37, 'none',
  [0, 1, 2, 3, 4].map((i) => `<circle cx="19" cy="${NECK + 8 + i * 7}" r="1.7" fill="#d9b35a"/>`).join(''));

// Áo yếm — the diamond bodice, tied at neck and back; worn by every class.
part('collar-yem-wrap', 35, 'robeLight',
  `<path d="M -20 ${NECK - 2} C -10 ${NECK + 16}, 10 ${NECK + 16}, 20 ${NECK - 2} L 26 ${NECK + 6} C 12 ${NECK + 28}, -12 ${NECK + 28}, -26 ${NECK + 6} Z" fill="#ffffff"/>`);
part('yem', 36, 'none',
  // Outlined in cream: on a nâu robe the red separates on its own, but on a vermilion one —
  // which is what a Legendary woman wears — red on red is mud without an edge.
  `<path d="M 0 ${NECK + 2} L 13 ${NECK + 15} L 0 ${NECK + 32} L -13 ${NECK + 15} Z" fill="#b8443a" stroke="#e8ddc4" stroke-width="1.4"/>
   <path d="M -13 ${NECK + 15} L -20 ${NECK + 8} M 13 ${NECK + 15} L 20 ${NECK + 8}" stroke="#e8ddc4" stroke-width="1.6"/>`);
part('sash-waist', 37, 'none', `<rect x="-22" y="${NECK + 32}" width="44" height="5" rx="2" fill="#d9b35a"/>`);

// Áo nhật bình — the Nguyễn court robe. Its rectangular collar panel is the read.
// A yoke that wraps the throat and runs down the front, not a panel laid on the chest — the
// rectangular *collar* is what names the garment, and a plain filled rectangle reads as a
// signboard hung round the neck.
const NHAT_BINH_YOKE = `M -32 ${NECK - 8} L 32 ${NECK - 8} L 32 ${NECK + 24} L 13 ${NECK + 24}
  L 13 ${NECK + 1} C 13 ${NECK - 3}, -13 ${NECK - 3}, -13 ${NECK + 1}
  L -13 ${NECK + 24} L -32 ${NECK + 24} Z`;
part('collar-nhatbinh', 35, 'robeDark', `<path d="${NHAT_BINH_YOKE}" fill="#ffffff"/>`);
part('collar-nhatbinh-trim', 36, 'none',
  `<path d="${NHAT_BINH_YOKE}" fill="none" stroke="#d9b35a" stroke-width="1.8" stroke-linejoin="round"/>
   <path d="M -27 ${NECK + 14} q 4 -7 8.5 -1.5 q 4 -6.5 8.5 0.5" stroke="#d9b35a" stroke-width="1.3" fill="none" opacity=".95"/>
   <path d="M 18.5 ${NECK + 14} q 4 -7 8.5 -1.5" stroke="#d9b35a" stroke-width="1.3" fill="none" opacity=".95"/>`);

// Kesa — the monk's, and nobody else's.
part('kesa', 35, 'none',
  `<path d="M -30 ${NECK + 4} L 0 ${NECK + 30} L 30 ${NECK + 4} L 34 ${NECK + 14} L 0 ${NECK + 42} L -34 ${NECK + 14} Z" fill="#b07a24"/>`);

// 40 · hair, white so the run's hair colour tints it (and greys it with age).
const fringe = (drop, lift) =>
  `<path d="M ${-W / 2 - 1} ${TOP + drop} C ${-W / 2 - 3} ${TOP - 5}, ${W / 2 + 3} ${TOP - 5}, ${W / 2 + 1} ${TOP + drop}
    C ${W / 2 - 4} ${TOP + lift}, ${-W / 2 + 4} ${TOP + lift}, ${-W / 2 - 1} ${TOP + drop} Z" fill="#ffffff"/>`;
part('hair-crown', 40, 'hair', fringe(22, 8));
part('hair-cropped', 40, 'hair', fringe(18, 9));
part('hair-long', 40, 'hair',
  fringe(30, 10)
  + `<path d="M ${-W / 2 - 1} ${TOP + 24} C ${-W / 2 - 6} ${TOP + 46}, ${-W / 2 - 4} ${CHIN - 6}, ${-W / 2 + 3} ${CHIN + 2}
       C ${-W / 2 + 7} ${CHIN - 10}, ${-W / 2 + 6} ${TOP + 40}, ${-W / 2 - 1} ${TOP + 24} Z" fill="#ffffff"/>
     <path d="M ${W / 2 + 1} ${TOP + 24} C ${W / 2 + 6} ${TOP + 46}, ${W / 2 + 4} ${CHIN - 6}, ${W / 2 - 3} ${CHIN + 2}
       C ${W / 2 - 7} ${CHIN - 10}, ${W / 2 - 6} ${TOP + 40}, ${W / 2 + 1} ${TOP + 24} Z" fill="#ffffff"/>`);
part('topknot', 41, 'hair', `<ellipse cx="0" cy="${TOP - 6}" rx="10" ry="8" fill="#ffffff"/>`);
part('topknot-tall', 41, 'hair', `<ellipse cx="0" cy="${TOP - 9}" rx="12" ry="10" fill="#ffffff"/>`);
part('bun-high', 41, 'hair', `<ellipse cx="0" cy="${TOP - 8}" rx="15" ry="10" fill="#ffffff"/>`);
part('bun-low', 41, 'hair', `<ellipse cx="0" cy="${TOP - 3}" rx="13" ry="9" fill="#ffffff"/>`);
part('hairpin', 42, 'none', `<rect x="-3" y="${TOP - 20}" width="6" height="12" rx="2" fill="#b07a24"/>`);

// 50 · headwear. This is the silhouette that has to survive at 42 px, so it is the richest
// group in the library and the one worth an artist's time first.
part('hat-khanvan', 50, 'none',
  [0, 1, 2].map((k) => {
    const y = TOP + 16 - k * 6;
    return `<path d="M ${-W / 2 - 3} ${y} C ${-W / 2 - 2} ${y - 14}, ${W / 2 + 2} ${y - 14}, ${W / 2 + 3} ${y}
      C ${W / 2 - 1} ${y - 6}, ${-W / 2 + 1} ${y - 6}, ${-W / 2 - 3} ${y} Z" fill="#1b1a17" opacity="${0.96 - k * 0.06}"/>
      <path d="M ${-W / 2 + 2} ${y - 4} C -14 ${y - 11}, 14 ${y - 11}, ${W / 2 - 2} ${y - 4}" stroke="#57524a" stroke-width="1" fill="none" opacity="${0.85 - k * 0.18}"/>`;
  }).join(''));
part('hat-khandong', 50, 'none',
  `<path d="M ${-W / 2 - 4} ${TOP + 14} C ${-W / 2 - 4} ${TOP - 8}, ${W / 2 + 4} ${TOP - 8}, ${W / 2 + 4} ${TOP + 14} Z" fill="#1b1a17"/>
   <path d="M ${-W / 2 - 4} ${TOP + 14} C ${-W / 2 - 4} ${TOP + 4}, ${W / 2 + 4} ${TOP + 4}, ${W / 2 + 4} ${TOP + 14} Z" fill="#2d2a24"/>
   <path d="M -8 ${TOP + 1} l 8 -7 l 8 7" stroke="#57524a" stroke-width="1.2" fill="none"/>`);
// Phốc đầu / mũ cánh chuồn. Wing length carried rank in the 1499 regulations, so it is three
// parts rather than one.
for (const [name, wing, boss] of [['short', 17, false], ['long', 26, false], ['grand', 34, true]]) {
  part(`hat-phocdau-${name}`, 50, 'none',
    `<path d="M -25 ${TOP + 10} L -25 ${TOP - 12} C -25 ${TOP - 20}, 25 ${TOP - 20}, 25 ${TOP - 12} L 25 ${TOP + 10} Z" fill="#191713"/>
     <rect x="-29" y="${TOP + 6}" width="58" height="8" rx="2" fill="#191713"/>
     <path d="M -27 ${TOP + 2} q ${-wing} -3 ${-wing} 3 q 0 6 ${wing} 3 Z" fill="#191713"/>
     <path d="M 27 ${TOP + 2} q ${wing} -3 ${wing} 3 q 0 6 ${-wing} 3 Z" fill="#191713"/>
     ${boss ? `<rect x="-7" y="${TOP - 16}" width="14" height="7" rx="2" fill="#d9b35a"/>` : ''}`);
}
part('hat-helm', 50, 'none',
  `<path d="M -30 ${TOP + 12} C -32 ${TOP - 16}, 32 ${TOP - 16}, 30 ${TOP + 12} Z" fill="#6a6f66"/>
   <rect x="-32" y="${TOP + 8}" width="64" height="7" rx="2" fill="#26313c"/>
   <path d="M 0 ${TOP - 14} L 0 ${TOP - 26}" stroke="#aa3a2c" stroke-width="3"/>
   <ellipse cx="0" cy="${TOP - 27}" rx="5" ry="4" fill="#aa3a2c"/>`);
part('hat-non', 50, 'none',
  `<path d="M -46 ${TOP + 12} C -30 ${TOP - 26}, 30 ${TOP - 26}, 46 ${TOP + 12} Z" fill="#c9a860"/>
   <path d="M -34 ${TOP + 6} C -22 ${TOP - 14}, 22 ${TOP - 14}, 34 ${TOP + 6}" stroke="#9c7f3f" stroke-width="1" fill="none"/>`);
part('hat-moqua', 50, 'none',
  `<path d="M ${-W / 2 - 4} ${TOP + 34} C ${-W / 2 - 6} ${TOP - 8}, ${W / 2 + 6} ${TOP - 8}, ${W / 2 + 4} ${TOP + 34}
    L ${W / 2 - 4} ${TOP + 34} C ${W / 2 - 2} ${TOP + 6}, 0 ${TOP + 4}, 0 ${TOP + 18}
    C 0 ${TOP + 4}, ${-W / 2 + 2} ${TOP + 6}, ${-W / 2 + 4} ${TOP + 34} Z" fill="#1b1a17"/>`);
part('hat-coronet', 50, 'none',
  `<path d="M -22 ${TOP + 8} L -22 ${TOP - 4} L -11 ${TOP - 14} L 0 ${TOP - 6} L 11 ${TOP - 14} L 22 ${TOP - 4} L 22 ${TOP + 8} Z" fill="#d9b35a"/>
   <circle cx="0" cy="${TOP - 2}" r="3.4" fill="#aa3a2c"/>`);
part('hat-crown-nhatbinh', 50, 'none',
  `<path d="M -24 ${TOP + 6} L -24 ${TOP - 8} L -12 ${TOP - 18} L 0 ${TOP - 9} L 12 ${TOP - 18} L 24 ${TOP - 8} L 24 ${TOP + 6} Z" fill="#d9b35a"/>
   <circle cx="0" cy="${TOP - 4}" r="3.6" fill="#aa3a2c"/>
   <circle cx="-13" cy="${TOP - 6}" r="2.2" fill="#aa3a2c"/><circle cx="13" cy="${TOP - 6}" r="2.2" fill="#aa3a2c"/>`);
part('hat-band', 50, 'none',
  `<rect x="${-W / 2 - 3}" y="${TOP + 2}" width="${W + 6}" height="10" rx="3" fill="#aa3a2c"/>
   <path d="M ${W / 2 - 2} ${TOP + 12} q 12 10 6 24" stroke="#aa3a2c" stroke-width="4" fill="none"/>`);
part('scalp-shaven', 50, 'skinLight',
  `<path d="M ${-W / 2 + 1} ${TOP + 20} C ${-W / 2 - 1} ${TOP - 2}, ${W / 2 + 1} ${TOP - 2}, ${W / 2 - 1} ${TOP + 20}
    C ${W / 2 - 5} ${TOP + 12}, ${-W / 2 + 5} ${TOP + 12}, ${-W / 2 + 1} ${TOP + 20} Z" fill="#ffffff" opacity=".55"/>`);
part('scalp-dots', 51, 'skinShadow',
  [0, 1, 2].map((i) => `<circle cx="${-8 + i * 8}" cy="${TOP + 8}" r="2" fill="#ffffff" opacity=".5"/>`).join(''));

// 60 · brows, eyes, nose, mouth
part('brow-flat', 60, 'hair', brows(-4, 0));
part('brow-arched', 60, 'hair', brows(-6, 2));
part('brow-angled', 60, 'hair', brows(-2, -2));
part('eyes-almond', 62, 'none', pairEyes(0));
part('eyes-wide', 62, 'none', pairEyes(-1.4));
part('eyes-narrow', 62, 'none', pairEyes(1.2));
// A bridge that fades and a single nostril turn. Longer strokes read as a hook at 1.16×.
const nose = (drop, flick) =>
  `<path d="M -1 ${EYE_Y + 5} q -1.6 ${drop} 1.2 ${drop + 2} q ${flick} 0.8 ${flick + 0.8} -1.4"
     stroke="#ffffff" stroke-width="1.3" fill="none" stroke-linecap="round" opacity=".85"/>`;
part('nose-straight', 64, 'skinShadow', nose(7, 2.4));
part('nose-long', 64, 'skinShadow', nose(10, 2.6));
part('nose-soft', 64, 'skinShadow', nose(5, 2.2));
const MY = CHIN - 12;
part('mouth-neutral', 66, 'none', `<path d="M -5 ${MY} q 5 2 10 0" stroke="#6b3226" stroke-width="2" fill="none" stroke-linecap="round"/>`);
part('mouth-smile', 66, 'none', `<path d="M -6.5 ${MY} q 6.5 3.4 13 0" stroke="#6b3226" stroke-width="2" fill="none" stroke-linecap="round"/>`);
// Barely curved rather than dead straight: a perfectly flat stroke reads as a dash, and it
// also measures as a zero-height box, which the crop below cannot size.
part('mouth-firm', 66, 'none', `<path d="M -6.5 ${MY} q 6.5 0.6 13 0" stroke="#6b3226" stroke-width="2" fill="none" stroke-linecap="round"/>`);
// Nhuộm răng đen — lacquered teeth, a beauty standard for centuries, not a defect.
part('mouth-lacquered', 66, 'none',
  `<path d="M -7.5 ${MY - 0.5} q 7.5 3.6 15 0 q -7.5 -1.6 -15 0 Z" fill="#15120f"/>
   <path d="M -8 ${MY - 1} q 8 4.4 16 0" stroke="#6b3226" stroke-width="1.5" fill="none" stroke-linecap="round"/>`);

// 70 · facial hair
part('beard-moustache', 70, 'hair', `<path d="M -11 ${MY - 5} q 11 -4 22 0 q -11 6 -22 0 Z" fill="#ffffff"/>`);
part('beard-goatee', 70, 'hair', `<path d="M -7 ${MY + 5} q 7 10 14 0 q -7 -4 -14 0 Z" fill="#ffffff"/>`);
part('beard-long', 70, 'hair',
  `<path d="M -11 ${MY - 5} q 11 -4 22 0 q -11 6 -22 0 Z" fill="#ffffff"/>
   <path d="M -9 ${MY + 4} q 9 26 18 0 q -9 -5 -18 0 Z" fill="#ffffff" opacity=".92"/>`);
part('beard-full', 70, 'hair',
  `<path d="M -17 ${MY - 6} C -19 ${MY + 22}, 17 ${MY + 22}, 17 ${MY - 6} C 8 ${MY + 2}, -8 ${MY + 2}, -17 ${MY - 6} Z" fill="#ffffff" opacity=".9"/>`);

// 72 · marks the run earns or the era demands
part('mark-age', 72, 'skinShadow',
  `<path d="M -22 ${EYE_Y + 12} q 4 3 8 1" stroke="#ffffff" stroke-width="1" fill="none" opacity=".6"/>
   <path d="M 22 ${EYE_Y + 12} q -4 3 -8 1" stroke="#ffffff" stroke-width="1" fill="none" opacity=".6"/>
   <path d="M -14 ${TOP + 30} q 14 -3 28 0" stroke="#ffffff" stroke-width="1" fill="none" opacity=".45"/>`);
part('mark-scar', 72, 'skinShadow', `<path d="M ${-EX - 6} ${EYE_Y - 12} l -3 16" stroke="#ffffff" stroke-width="1.8" opacity=".9"/>`);
// Court tattoo. Under the Lý and Trần this was the price of entry to the palace — borne by
// emperors, every mandarin and the women of the harem alike, in patterns the sources compare
// to the designs on Đông Sơn bronze drums.
part('mark-tattoo', 73, 'none',
  // On the throat and the outer temple, clear of the eye. An earlier placement ran a stroke
  // straight across the left eye, which reads as a smudge on the lens rather than as ink.
  // Small and low-contrast on purpose. Spanning the throat, this read as a wrinkled neck
  // rather than as ink, and at 0.32× any busy face marking is simply noise.
  `<path d="M 6.5 ${NECK - 7} q 3.2 4 0 8" stroke="#26313c" stroke-width="1.2" fill="none" opacity=".5" stroke-linecap="round"/>`);
part('mark-tattoo-court', 74, 'none',
  `<circle cx="-20" cy="${TOP + 30}" r="2.4" fill="none" stroke="#26313c" stroke-width="1.2" opacity=".5"/>`);

// 80 · rank seal. Deliberately a notched lacquer chop rather than a written character — the
// portrait should not depend on a script the player may not read.
for (const [name, notches] of [['rare', 1], ['epic', 2], ['legendary', 3]]) {
  part(`rank-${name}`, 80, 'none',
    `<rect x="44" y="60" width="16" height="16" rx="2" fill="#aa3a2c"/>
     ${Array.from({ length: notches }, (_, i) =>
       `<rect x="47" y="${63 + i * 4}" width="10" height="2" rx="1" fill="#f3e6c4" opacity=".92"/>`).join('')}`);
}

// ── measure, crop, emit ─────────────────────────────────────────────────────
const svgDoc = (body, view) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${view.x} ${view.y} ${view.w} ${view.h}" width="${view.w}" height="${view.h}">${body}</svg>`;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(
  `<body style="margin:0">${svgDoc(
    PARTS.map((p) => `<g id="m-${p.key}">${p.body}</g>`).join(''),
    VIEW,
  )}</body>`,
);
const boxes = await page.evaluate((keys) => {
  const out = {};
  for (const k of keys) {
    const el = document.getElementById('m-' + k);
    const b = el.getBBox();
    out[k] = { x: b.x, y: b.y, w: b.width, h: b.height };
  }
  return out;
}, PARTS.map((p) => p.key));
await browser.close();

mkdirSync(OUT_SVG, { recursive: true });
const PAD = 2;                    // room for stroke caps, which getBBox does not include
const manifest = [];
const written = new Set();

for (const p of PARTS) {
  const b = boxes[p.key];
  if (!b || (b.w === 0 && b.h === 0)) throw new Error(`part "${p.key}" measured empty — check its paths`);
  // `getBBox` measures geometry, not ink: a stroked path extends half its width past the box
  // on every side, and a flat one measures zero in the thin axis. Both are handled by padding
  // and a floor, or strokes get clipped at the crop.
  const view = {
    x: Math.floor(b.x - PAD), y: Math.floor(b.y - PAD),
    w: Math.max(4, Math.ceil(b.w + PAD * 2)), h: Math.max(4, Math.ceil(b.h + PAD * 2)),
  };
  const file = join(OUT_SVG, `${p.key}.svg`);
  const svg = svgDoc(p.body, view) + '\n';
  if (CHECK) {
    if (!existsSync(file) || readFileSync(file, 'utf8') !== svg) {
      console.error(`stale: ${file}`);
      process.exitCode = 1;
    }
  } else {
    writeFileSync(file, svg);
  }
  written.add(`${p.key}.svg`);
  // Centre of the part in design space — what the renderer positions the Image at.
  manifest.push({ key: p.key, layer: p.layer, tint: p.tint, cx: view.x + view.w / 2, cy: view.y + view.h / 2, w: view.w, h: view.h });
}

// Sweep files the library no longer defines, so a renamed part cannot linger and get loaded.
if (!CHECK) {
  for (const f of readdirSync(OUT_SVG)) {
    if (f.endsWith('.svg') && !written.has(f)) unlinkSync(join(OUT_SVG, f));
  }
}

const ts = `/* eslint-disable */
// GENERATED by scripts/build-faces.mjs — do not edit. Run \`node scripts/build-faces.mjs\`.
//
// \`cx\`/\`cy\` are the part's centre in portrait design space, measured from its real rendered
// bounding box, so the renderer can place every layer with a single \`setPosition\` and no
// per-part fudging. \`tint\` names the colour slot the run multiplies the part by.

export type FaceTintSlot = 'none' | 'skin' | 'skinShadow' | 'skinLight' | 'hair' | 'robe' | 'robeDark' | 'robeLight';

export interface FacePartDef {
  key: string;
  /** Paint order, low to high. */
  layer: number;
  tint: FaceTintSlot;
  cx: number;
  cy: number;
  w: number;
  h: number;
}

export const FACE_PART_DEFS: readonly FacePartDef[] = ${JSON.stringify(manifest, null, 2)} as const;

/** Design-space bounds every part is authored against. */
export const FACE_VIEW = ${JSON.stringify(VIEW)} as const;
`;

if (CHECK) {
  if (!existsSync(OUT_MANIFEST) || readFileSync(OUT_MANIFEST, 'utf8') !== ts) {
    console.error(`stale: ${OUT_MANIFEST}`);
    process.exitCode = 1;
  }
  if (!process.exitCode) console.log(`faces up to date — ${PARTS.length} parts`);
} else {
  mkdirSync('src/ui/faces', { recursive: true });
  writeFileSync(OUT_MANIFEST, ts);
  console.log(`wrote ${PARTS.length} parts → ${OUT_SVG}/  and  ${OUT_MANIFEST}`);
}
