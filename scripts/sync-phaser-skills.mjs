#!/usr/bin/env node
/**
 * Copies the agent skills that ship inside the `phaser` npm package into `.claude/skills/`.
 *
 * Phaser 4 puts 28 of them in `node_modules/phaser/skills/` — cameras, filters, render textures,
 * tilemaps, the v3→v4 migration guide, and so on. Phaser 3 shipped none. They are the engine's own
 * documentation, written for an agent to read, and they are versioned with the engine: whatever is
 * in `node_modules` is true of the version this repo actually builds against.
 *
 * They land as `.claude/skills/phaser-<name>/` so they sort together and never collide with this
 * repo's own six skills, which answer a different kind of question — `game-map` knows how *this*
 * game lays out a hex, `phaser-tilemaps` knows what a Phaser tilemap is. Engine questions go to the
 * upstream ones; game questions stay with ours.
 *
 * Committed rather than gitignored, so a fresh clone or a CI run has them without a postinstall
 * step. Re-run after a Phaser version bump:
 *
 *     yarn skills
 *     yarn skills:check     # exits 1 if the committed copies are stale
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'node_modules', 'phaser', 'skills');
const target = join(root, '.claude', 'skills');
const check = process.argv.includes('--check');

if (!existsSync(source)) {
  console.error('No node_modules/phaser/skills — install dependencies first (Phaser 3 does not ship skills).');
  process.exit(1);
}

const version = JSON.parse(readFileSync(join(root, 'node_modules', 'phaser', 'package.json'), 'utf8')).version;
const names = readdirSync(source, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && existsSync(join(source, entry.name, 'SKILL.md')))
  .map((entry) => entry.name)
  .sort();

/**
 * The upstream file with a provenance line pushed into its frontmatter description.
 *
 * The description is what an agent reads when deciding whether a skill is relevant, so saying
 * which engine version it describes belongs there rather than in a comment nobody loads. The
 * `name` is rewritten to the prefixed directory name because a skill whose folder and `name`
 * disagree is not discoverable by the name it is filed under.
 */
function stamp(body, name) {
  const prefixed = `phaser-${name}`;
  return body
    .replace(/^name:\s*.*$/m, `name: ${prefixed}`)
    .replace(/^description:\s*(["']?)(.*)$/m, (_line, quote, rest) => {
      const trimmed = quote ? rest.replace(new RegExp(`${quote}\\s*$`), '') : rest;
      return `description: ${quote}${trimmed} (Phaser ${version} engine reference, vendored from node_modules/phaser/skills/${name} — do not edit; run \`yarn skills\`.)${quote}`;
    });
}

let stale = [];
for (const name of names) {
  const body = stamp(readFileSync(join(source, name, 'SKILL.md'), 'utf8'), name);
  const dir = join(target, `phaser-${name}`);
  const file = join(dir, 'SKILL.md');
  const current = existsSync(file) ? readFileSync(file, 'utf8') : null;
  if (current === body) continue;
  stale.push(`phaser-${name}`);
  if (check) continue;
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, body);
}

// A skill left behind by a previous Phaser version is worse than a missing one: it describes an
// API that is no longer there and nothing says so.
const orphans = existsSync(target)
  ? readdirSync(target, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name.startsWith('phaser-'))
      .map((entry) => entry.name)
      .filter((dir) => !names.includes(dir.slice('phaser-'.length)))
  : [];
for (const orphan of orphans) {
  stale.push(`${orphan} (removed upstream)`);
  if (!check) rmSync(join(target, orphan), { recursive: true, force: true });
}

if (check) {
  if (stale.length) {
    console.error(`Phaser ${version} skills are out of date in .claude/skills:\n  ${stale.join('\n  ')}\nRun: yarn skills`);
    process.exit(1);
  }
  console.log(`.claude/skills is in sync with Phaser ${version} — ${names.length} skills.`);
} else {
  console.log(`Synced ${names.length} Phaser ${version} skills into .claude/skills/ (${stale.length} changed).`);
}
