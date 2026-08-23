// The house voice, kept honest.
//
// The Chronicle is ~5,000 authored strings across two languages, Vietnamese first, and it grew by
// about eleven thousand words a language in one pass. At that volume the register drifts unless
// something watches it, and the thing that drifts first is not the structure — `verify-chronicle`
// already guards that — but the *voice*: essay connectives, emotions named instead of shown,
// closing sentences that explain what the scene meant, and modern Vietnamese in an annalistic
// register.
//
// This reads the catalogue files directly rather than through the game, because it is about the
// prose as written and has nothing to do with whether a run reaches it.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = 'src/i18n/story';

/**
 * Signatures, not style opinions. Each entry is something that is either wrong in this register or
 * a tell that a line was composed in English and rendered into Vietnamese afterwards.
 *
 * Kept deliberately narrow: a guard that fires on ordinary good writing gets switched off.
 */
const BANNED = [
  // Essay connectives. Nobody in an annal says "moreover".
  [/\b(moreover|furthermore|indeed|ultimately|in a very real sense|it is worth noting|needless to say)\b/i, 'essay connective'],
  // Emotions named rather than shown.
  [/\b(felt (proud|desperate|heartbroken|determined|afraid|relieved))\b/i, 'names the emotion'],
  [/\b(a chill ran|the air was thick with|heart(s)? (sank|soared)|a wave of (relief|fear|emotion))\b/i, 'body-language shorthand'],
  // The rhetorical tic, at volume.
  [/\bnot just [^,.]{2,40} but\b/i, '"not just X but Y"'],
  // Modern Vietnamese in an annalistic register.
  [/(chiến lược gia|áp lực|tình hình căng thẳng|động lực|khủng hoảng tâm lý|năng lượng tích cực)/i, 'modern Vietnamese register'],
];

/** Keys whose length is contractual. `.chronicle` is an annal entry; inflating it kills the point. */
const MAX_WORDS = { chronicle: 14, line: 26 };

let pass = 0;
let fail = 0;
const check = (name, ok, note = '') => {
  console.log(`${ok ? ' ok  ' : 'FAIL '} ${name}${note ? '  — ' + note : ''}`);
  ok ? pass += 1 : fail += 1;
};

const files = readdirSync(DIR).filter((f) => f.endsWith('.ts') && f !== 'index.ts' && f !== 'types.ts');

// Pull `'key': 'value',` pairs, tolerating escaped quotes and wrapped values.
const BS = String.fromCharCode(92);
const PAIR = new RegExp(
  "'([a-z0-9][a-zA-Z0-9._-]*)':" + String.raw`\s*(?:\r?\n\s*)?` + "'((?:[^'" + BS + BS + "]|" + BS + BS + '.)*)' + "'",
  'g',
);

const banned = [];
const long = [];
let strings = 0;

for (const file of files) {
  const text = readFileSync(join(DIR, file), 'utf8');
  for (const m of text.matchAll(PAIR)) {
    const [, key, raw] = m;
    const value = raw.replace(new RegExp(BS + "'", 'g'), "'");
    strings += 1;

    for (const [pattern, why] of BANNED) {
      if (pattern.test(value)) {
        banned.push(`${file} ${key}: ${why} — "${value.slice(0, 70)}"`);
        break;
      }
    }

    const suffix = key.split('.').pop();
    const cap = MAX_WORDS[suffix];
    if (cap) {
      const words = value.split(/\s+/).filter(Boolean).length;
      if (words > cap) long.push(`${file} ${key}: ${words} words (max ${cap})`);
    }
  }
}

console.log(`── ${strings} strings across ${files.length} catalogue files ──\n`);

check('no essay connectives, named emotions or modern register', banned.length === 0,
  banned.slice(0, 5).join(' | '));
if (banned.length > 5) console.log(`      …and ${banned.length - 5} more`);

// Reported, not failed. `.chronicle` at fifteen words instead of fourteen is worth re-reading and
// is not worth a red gate — and every line currently over the mark predates this guard. A check
// that arrives red is a check that gets ignored; this one exists to catch the next drift.
if (long.length > 0) {
  console.log(` note  ${long.length} lines over their length guidance — worth re-reading, not a failure`);
  for (const entry of long.slice(0, 8)) console.log(`         ${entry}`);
  if (long.length > 8) console.log(`         …and ${long.length - 8} more`);
} else {
  console.log(' ok   every annal line is still an annal line');
}

// A whisper with no scene behind it is a line the strip can open onto nothing.
const scenes = new Set();
const lines = new Set();
for (const file of files) {
  const text = readFileSync(join(DIR, file), 'utf8');
  for (const m of text.matchAll(PAIR)) {
    const key = m[1];
    if (key.endsWith('.scene')) scenes.add(key.slice(0, -'.scene'.length));
    if (key.endsWith('.line')) lines.add(key.slice(0, -'.line'.length));
  }
}
const noScene = [...lines].filter((stem) => !scenes.has(stem));
check('every whisper has a scene to open onto', noScene.length === 0,
  `${noScene.length} without: ${noScene.slice(0, 4).join(', ')}`);

console.log(`\n${pass}/${pass + fail} checks passed`);
console.log(fail === 0
  ? 'PASS: the catalogue still sounds like itself'
  : 'FAIL: the register has drifted');
process.exit(fail === 0 ? 0 : 1);
