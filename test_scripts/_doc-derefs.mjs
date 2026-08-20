// Swap the doc's embedded base64 for the webp assets beside it, the way every other doc here works.
import { readFileSync, writeFileSync, statSync } from 'node:fs';
const p = process.argv[2];
let h = readFileSync(p, 'utf8');
const map = [
  ['The southern two thirds of the campaign map', 'd-whole-map'],
  ['The river at mid zoom', 'a-river-mid'],
  ['The river running past a settled province', 'c-settled-ground'],
  ['The current generator at this framing', 'd-current-wide'],
  ['The proposed map', 'e-proposed-wide'],
  ['Two provinces either side', 'z-crossing'],
  ['Close-up of a timber bridge', 'g-bridge-close'],
];
for (const [alt, name] of map) {
  const re = new RegExp('<img src="data:image\/png;base64,[^"]*" alt="' + alt);
  if (!re.test(h)) { console.error('MISS', alt); continue; }
  h = h.replace(re, `<img src="readme/water-${name}.webp" alt="${alt}`);
}
writeFileSync(p, h);
const left = (h.match(/data:image\/png;base64/g) || []).length;
console.log('remaining embedded images:', left, '| size', (statSync(p).size / 1024).toFixed(0), 'KB');
