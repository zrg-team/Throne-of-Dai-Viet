/**
 * Hands the game's shell build to this cabinet.
 *
 * Reads `dist-shell/` from the repository root — written by `yarn build:shell` up there — and
 * writes two files into `assets/`: the archive Metro embeds, and the stamp that decides whether a
 * launch needs to unpack it.
 *
 * One archive rather than 302 loose files because a *directory* is the awkward thing to get into
 * an iOS bundle: it needs a folder reference in the Xcode project, added headlessly, from a
 * machine with no Xcode on it. A single file with a known extension is just an asset.
 *
 * Run from `apps/mobile`: `yarn sync`.
 */
import { createWriteStream } from 'node:fs';
import { copyFile, mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import archiver from 'archiver';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const source = join(root, 'dist-shell');
const assets = resolve(here, '../assets');
const archive = join(assets, 'web.zip');
const stamp = join(assets, 'web-version.json');

if (!(await stat(source).catch(() => null))?.isDirectory()) {
  console.error(`No ${source}.\nRun \`yarn build:shell\` in the repository root first.`);
  process.exit(1);
}

// A stale index.html pointing at a chunk this build deleted is the one failure that looks like a
// bug in the game rather than in the sync, so the archive is replaced whole every time.
await rm(archive, { force: true });
await mkdir(assets, { recursive: true });

const zip = archiver('zip', { zlib: { level: 9 } });
const sink = createWriteStream(archive);
const closed = new Promise((done, fail) => {
  sink.on('close', done);
  sink.on('error', fail);
  zip.on('error', fail);
});
zip.pipe(sink);
zip.directory(source, false);
await zip.finalize();
await closed;

/**
 * The extraction key.
 *
 * The commit count, not a build clock — deliberately, and for the same reason the settings page
 * uses it. A timestamp changes on every rebuild of identical source, so every launch would unpack
 * 302 files again to arrive at exactly what was already on disk.
 */
const build = (() => {
  try {
    return execFileSync('git', ['rev-list', '--count', 'HEAD'], {
      cwd: root,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
  } catch {
    // A source tarball with no git. One fixed name means one unpack, ever, which is wrong only if
    // you then swap the archive underneath it — and a tree with no git is not one being iterated.
    return 'nogit';
  }
})();

await writeFile(stamp, `${JSON.stringify({ build }, null, 2)}\n`);

const bytes = (await stat(archive)).size;
console.log(`web.zip  ${(bytes / 1024 / 1024).toFixed(2)} MB  build ${build}`);

/**
 * The launcher marks, copied rather than drawn again.
 *
 * `scripts/build-icon.mjs` in the repository root cuts every size of the drum from one drawing, so
 * the app icon has a source already and a second one would be a second thing to keep in step. The
 * maskable cut is what Android's adaptive icon wants: it carries the safe margin the launcher
 * needs before it crops to whatever shape the phone uses.
 */
const marks = [
  ['icon-512.png', 'icon.png'],
  ['icon-maskable-512.png', 'adaptive-icon.png'],
  // On the ink of the splash, the drum on its sheet of paper reads as a print rather than a logo.
  ['icon-512.png', 'splash.png'],
];

for (const [from, to] of marks) {
  await copyFile(join(root, 'public', from), join(assets, to));
}
console.log(`marks    ${marks.map(([, to]) => to).join('  ')}`);
