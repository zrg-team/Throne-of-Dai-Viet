/**
 * Pulls the finished EAS artefacts down into the submission kit, named by version and build.
 *
 * The last manual step of a release used to be finding two build pages in a browser, downloading
 * two files with opaque hashed names, and renaming them by hand so you could tell which was which
 * three weeks later. `eas build:list --json` already knows the version, the build number and the
 * artefact URL, so none of that needs a human.
 *
 *   node scripts/fetch-builds.mjs [--profile production] [--platform ios|android|all]
 *
 * Files land in `apps/mobile/store/<platform>/builds/`, which `.gitignore` keeps out of the
 * repository — they are tens of megabytes and reproducible from a commit.
 */
import { execFileSync } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const app = join(root, 'apps', 'mobile');

const arg = (flag, fallback) => {
  const at = process.argv.indexOf(flag);
  return at >= 0 ? process.argv[at + 1] : fallback;
};

const profile = arg('--profile', 'production');
const only = arg('--platform', 'all');
const platforms = only === 'all' ? ['ios', 'android'] : [only];

/** The newest build EAS has for a platform on this profile, or undefined. */
const latest = (platform) => {
  let raw;
  try {
    raw = execFileSync(
      'eas',
      ['build:list', '--platform', platform, '--buildProfile', profile, '--limit', '1', '--json', '--non-interactive'],
      { cwd: app, stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 32 * 1024 * 1024, shell: process.platform === 'win32' },
    ).toString();
  } catch {
    return undefined;
  }
  // The CLI prints progress on stdout before the JSON on some versions; take the array it ends with.
  const at = raw.indexOf('[');
  if (at < 0) return undefined;
  try {
    return JSON.parse(raw.slice(at))[0];
  } catch {
    return undefined;
  }
};

const mb = (n) => `${(n / 1024 / 1024).toFixed(1)} MB`;

let fetched = 0;
let skipped = 0;

for (const platform of platforms) {
  const build = latest(platform);

  if (!build) {
    console.log(`  ${platform.padEnd(8)} no build found on profile "${profile}"`);
    skipped += 1;
    continue;
  }
  if (build.status !== 'FINISHED') {
    console.log(`  ${platform.padEnd(8)} latest build is ${build.status}, not FINISHED — nothing to fetch`);
    skipped += 1;
    continue;
  }

  const url = build.artifacts?.applicationArchiveUrl ?? build.artifacts?.buildUrl;
  if (!url) {
    console.log(`  ${platform.padEnd(8)} finished, but carries no artefact URL`);
    skipped += 1;
    continue;
  }

  // The extension is the artefact's, not a guess: production yields .aab and preview .apk on
  // Android, and a simulator build yields .tar.gz rather than .ipa on iOS.
  const ext = (url.match(/\.([a-z0-9.]+)$/i)?.[1] ?? 'bin').replace(/^tar\.gz$/, 'tar.gz');
  const name = `van-thang-${build.appVersion}-${build.appBuildVersion}.${ext}`;
  const dir = join(app, 'store', platform, 'builds');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, name);

  if (existsSync(file)) {
    console.log(`  ${platform.padEnd(8)} ${name}  already here (${mb(statSync(file).size)})`);
    skipped += 1;
    continue;
  }

  process.stdout.write(`  ${platform.padEnd(8)} ${name}  downloading…`);
  const response = await fetch(url);
  if (!response.ok) {
    console.log(` failed: ${response.status} ${response.statusText}`);
    skipped += 1;
    continue;
  }
  await pipeline(Readable.fromWeb(response.body), createWriteStream(file));
  console.log(` ${mb(statSync(file).size)}`);
  fetched += 1;
}

console.log(`\n  ${fetched} fetched, ${skipped} skipped — apps/mobile/store/*/builds/`);
