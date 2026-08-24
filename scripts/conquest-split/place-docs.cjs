/**
 * Reunites doc comments with the functions they describe.
 *
 * Leading comments are trivia, not part of the syntax tree, so the extractor can only keep a block
 * with whatever declaration follows it. Where the source had two blocks stacked — a comment left
 * behind when somebody moved a method years ago — the orphan travels with its innocent neighbour,
 * and the partition decides which *file* that neighbour is in. So four of them crossed module
 * boundaries, each leaving its real owner undocumented.
 *
 * Listed here rather than fixed in the source, so a re-cut does not have to be undone by hand.
 * `finish.cjs` runs this. Each entry is asserted, so a stale one fails loudly instead of silently
 * doing nothing.
 *
 *   node scripts/conquest-split/place-docs.cjs
 */
const fs = require('fs');

const D = 'src/scenes/conquest';
const MOVES = [
  {
    what: "promptFrame's doc",
    from: `${D}/battle/shell.ts`,
    opens: '/**\n * Full-screen frame shared by every prompt.',
    blocks: 1,
    to: `${D}/prompts/frame.ts`,
    before: 'export function promptFrame(',
  },
  {
    what: "buildBattlePips' doc",
    from: `${D}/layers.ts`,
    opens: '/**\n * The round track: `totalRounds` pips',
    blocks: 1,
    to: `${D}/battle/shell.ts`,
    before: 'export function buildBattlePips(',
  },
  {
    what: "showChronicleScreen's two docs",
    from: `${D}/screens/aftermath.ts`,
    opens: '/**\n * Sử Ký — what has already happened, in past tense.',
    blocks: 2,
    to: `${D}/screens/chronicle.ts`,
    before: 'export function showChronicleScreen(',
  },
  {
    what: "the Bar screens banner and showBuildScreen's line",
    from: `${D}/lanes/frame.ts`,
    opens: '// ── Bar screens ─',
    closes: '/** Build / upgrade a district by hand, ahead of whatever the autopilot would have picked. */\n',
    to: `${D}/screens/build.ts`,
    before: 'export function showBuildScreen(',
  },
];

let moved = 0;
for (const m of MOVES) {
  const src = fs.readFileSync(m.from, 'utf8');
  const i = src.indexOf(m.opens);
  if (i < 0) throw new Error(`${m.what}: not found in ${m.from} — the partition moved it, update this list`);
  let end;
  if (m.closes) {
    const c = src.indexOf(m.closes, i);
    if (c < 0) throw new Error(`${m.what}: closing line not found in ${m.from}`);
    end = c + m.closes.length;
  } else {
    end = i;
    for (let n = 0; n < m.blocks; n++) end = src.indexOf(' */\n', end) + ' */\n'.length;
  }
  const doc = src.slice(i, end);
  fs.writeFileSync(m.from, (src.slice(0, i) + src.slice(end)).replace(/\n{3,}/g, '\n\n'));

  const dst = fs.readFileSync(m.to, 'utf8');
  const k = dst.indexOf(m.before);
  if (k < 0) throw new Error(`${m.what}: anchor "${m.before}" not found in ${m.to}`);
  fs.writeFileSync(m.to, dst.slice(0, k) + doc + dst.slice(k));
  console.log(`  ${m.what}: ${m.from} -> ${m.to}`);
  moved++;
}
console.log(`placed ${moved} orphaned doc block(s)`);
