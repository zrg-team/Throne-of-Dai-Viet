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
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
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
 * The launcher marks, cut rather than drawn again.
 *
 * `scripts/build-icon.mjs` in the repository root draws the drum once and rasterises it at any
 * size asked for, so the app icon has a source already and a second one would be a second thing
 * to keep in step. Its `--mobile` mode cuts the three marks this cabinet bundles, straight into
 * `assets/`, under the names `app.json` points at.
 *
 * These used to be copies of the 512s out of `public/`. They are cut at 1024 now because Apple's
 * marketing slot is 1024x1024 and Expo's prebuild upscales a smaller source rather than refusing
 * it — so the old copy shipped a soft icon and said nothing about it. The size lives over there
 * with the drawing, not here.
 *
 * Spawned rather than imported: this script runs under `apps/mobile`'s npm tree, and playwright
 * is in the repository root's. `cwd` is what puts the right `node_modules` in scope.
 */
execFileSync(process.execPath, [join(root, 'scripts', 'build-icon.mjs'), '--mobile', assets], {
  cwd: root,
  stdio: 'inherit',
});
