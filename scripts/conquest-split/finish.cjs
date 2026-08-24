/**
 * The tidying that follows `extract-conquest.cjs`, kept together so the whole split is one command.
 *
 * 1. drops imports the scene no longer needs (69 of its 83 statements were for code that moved),
 * 2. redraws the import punctuation the pruning left ragged,
 * 3. regroups the scene's members so the facade reads as a table of contents,
 * 4. puts the class's own doc comment back on the class — it was a free-floating block, so the
 *    extractor swept it into constants.ts along with everything else at module level.
 *
 *   node scripts/conquest-split/finish.cjs
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const SRC = 'src/scenes/ConquestUIScene.ts';
const OUT_DIR = 'src/scenes/conquest';
const CONSTANTS = path.posix.join(OUT_DIR, 'constants.ts');

const modules = [];
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.posix.join(dir.replace(/\\/g, '/'), e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.ts')) modules.push(p);
  }
};
walk(OUT_DIR);
const all = [SRC, ...modules];

const run = (script) => execFileSync(process.execPath, [script, ...all], { encoding: 'utf8' });
process.stdout.write(run('scripts/conquest-split/prune-imports.cjs').split('\n').slice(-3).join('\n') + '\n');
run('scripts/conquest-split/format-imports.cjs');

/*
 * The class doc, back where it belongs.
 *
 * In the source it was a free-floating block between two module-level helpers rather than a comment
 * attached to the class, so the extractor treats it as leading trivia of whatever declaration
 * happens to follow it — and *which* declaration that is changes with the partition. It has ridden
 * into constants.ts and into battle/clock.ts on different cuts, so this looks everywhere.
 */
const MARKER = "/**\n * Dragon Ascent's HUD scene.";
const holder = modules.find((f) => fs.readFileSync(f, 'utf8').includes(MARKER));
if (holder) {
  const constText = fs.readFileSync(holder, 'utf8');
  const start = constText.indexOf(MARKER);
  const end = constText.indexOf(' */\n', start) + ' */\n'.length;
  const doc = constText.slice(start, end);
  fs.writeFileSync(holder, (constText.slice(0, start) + constText.slice(end)).replace(/\n{3,}/g, '\n\n'));
  console.log(`class doc: lifted out of ${holder}`);

  const EXTRA = `${doc.slice(0, -4)} *
 * ## What this file is now
 *
 * It reached 11,115 lines and 152 methods before being split into \`./conquest/\`. What is left here
 * is the *scene*: every field, the Phaser lifecycle, and a forwarding method for each function
 * another module needs to reach. The drawing lives in the modules, one per area of the screen, and
 * each function there takes the scene as \`self\`.
 *
 * Three things to know before moving anything:
 *
 * - **The fields stay here on purpose.** The Playwright harnesses reach into a live scene by name —
 *   \`ui.openPromptKey\`, \`ui.modalLayer\`, \`ui.battleUi\` — so these are load-bearing property names,
 *   not private detail, whatever the encapsulation would prefer.
 * - **Modules do not import each other.** A call that crosses a module boundary goes \`self.foo()\`,
 *   through the forwarding method below, which is why the tree has no import cycles. A function used
 *   only inside its own file is not exported and is called directly as \`foo(self)\`. So a method here
 *   with no caller outside its own module does not belong here either.
 * - **The exceptions are leaves.** \`conquest/layers.ts\`, \`conquest/battle/geometry.ts\` and
 *   \`conquest/constants.ts\` import no sibling, so the modules import *them* directly rather than
 *   bouncing off the scene. Adding a sibling import to one of those three is what would start a cycle.
 */`;
  const src = fs.readFileSync(SRC, 'utf8');
  fs.writeFileSync(SRC, src.replace('export class ConquestUIScene extends Phaser.Scene {', `${EXTRA}\nexport class ConquestUIScene extends Phaser.Scene {`));
  console.log('class doc: moved back onto the class');
}

process.stdout.write(execFileSync(process.execPath, ['scripts/conquest-split/place-docs.cjs'], { encoding: 'utf8' }));
process.stdout.write(execFileSync(process.execPath, ['scripts/conquest-split/order-facade.cjs'], { encoding: 'utf8' }).split('\n')[0] + '\n');
console.log(`${SRC}: ${fs.readFileSync(SRC, 'utf8').split('\n').length} lines`);
