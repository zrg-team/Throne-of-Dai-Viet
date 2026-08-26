/**
 * One command from a clean checkout to a file you can upload to App Store Connect.
 *
 *   npm run ipa:check    everything below except the two slow steps — run this first
 *   npm run ipa      the whole thing, ending in a signed .ipa
 *
 * macOS only, and not because of Expo: `xcodebuild` and the iOS SDK exist nowhere else. From
 * Windows the equivalent is `npm run eas:ios`, which does all of this on EAS's hosted Macs.
 *
 * The preflight is deliberately long and deliberately first. Every check below is something that
 * otherwise fails twenty minutes into an archive, and several of them fail in ways that read as a
 * code problem rather than a missing tool or an unset team id.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repo = resolve(app, '..', '..');
const checkOnly = process.argv.includes('--check');

const fail = (message, remedy) => {
  console.error(`\n✖ ${message}`);
  if (remedy) console.error(`  → ${remedy}`);
  process.exit(1);
};
const ok = (message) => console.log(`  ✓ ${message}`);

/** Runs a command for its output, or returns undefined when it is not installed. */
const probe = (command, args) => {
  try {
    return execFileSync(command, args, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return undefined;
  }
};

/** Runs a command for real, and stops the script if it fails. */
const run = (command, args, cwd = app) => {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
};

console.log('\nVạn Thắng — iOS\n');
console.log('Preflight');

// ── the host ──────────────────────────────────────────────────────────────────────────────────
if (process.platform !== 'darwin') {
  fail(
    `iOS builds need macOS; this is ${process.platform}.`,
    'From Windows or Linux: npm run eas:ios — the same build on EAS\'s hosted Macs.',
  );
}
ok(`macOS ${probe('sw_vers', ['-productVersion']) ?? '(version unknown)'}`);

const xcode = probe('xcodebuild', ['-version']);
if (!xcode) {
  fail('xcodebuild not found.', 'Install Xcode from the App Store, then: sudo xcode-select --switch /Applications/Xcode.app');
}
const xcodeMajor = Number(xcode.match(/Xcode (\d+)/)?.[1] ?? 0);
/**
 * Apple has required Xcode 26 / the iOS 26 SDK for every upload since 28 April 2026. An older
 * Xcode archives perfectly and is then rejected at the upload step, which is the worst place to
 * find out.
 */
if (xcodeMajor < 26) {
  fail(
    `${xcode.split('\n')[0]} is too old for the App Store.`,
    'Uploads have required Xcode 26 (iOS 26 SDK) since 28 April 2026. Update Xcode.',
  );
}
ok(xcode.split('\n')[0]);

if (!probe('pod', ['--version'])) {
  fail('CocoaPods not found.', 'brew install cocoapods   (or: sudo gem install cocoapods)');
}
ok(`CocoaPods ${probe('pod', ['--version'])}`);

// ── the project ───────────────────────────────────────────────────────────────────────────────
if (!existsSync(join(app, 'node_modules'))) {
  fail('Dependencies are not installed.', 'npm install   (in apps/mobile)');
}
ok('node_modules present');

/**
 * The game itself. `assets/web.zip` is gitignored, so a fresh clone has an app with no game in it
 * — and the resulting .ipa launches to a diagnostic screen rather than a menu.
 */
if (!existsSync(join(app, 'assets/web.zip')) || !existsSync(join(app, 'assets/web-version.json'))) {
  fail(
    'assets/web.zip is missing — the app would ship without the game.',
    'yarn build:shell   (in the repository root), then: npm run sync',
  );
}
const stamp = JSON.parse(readFileSync(join(app, 'assets/web-version.json'), 'utf8'));
ok(`game archive present, build ${stamp.build}`);

/**
 * Is the archive older than the game? A stale one is the failure that does not look like one: the
 * app runs perfectly, on last week's build, and nothing anywhere says so.
 */
const shellDist = join(repo, 'dist-shell/index.html');
if (existsSync(shellDist)) {
  const built = statMtime(shellDist);
  const synced = statMtime(join(app, 'assets/web.zip'));
  if (built > synced) {
    fail(
      'dist-shell/ is newer than assets/web.zip — the app would ship the previous game build.',
      'npm run sync',
    );
  }
  ok('game archive is current');
}

const config = JSON.parse(readFileSync(join(app, 'app.json'), 'utf8')).expo;
if (!config.ios?.bundleIdentifier) {
  fail('app.json has no ios.bundleIdentifier.');
}
ok(`${config.ios.bundleIdentifier} · version ${config.version} · build ${config.ios.buildNumber ?? '1'}`);

/**
 * The Apple team. Automatic signing cannot choose one for you, and without it `xcodebuild` fails
 * with "No signing certificate found" — which sounds like a certificate problem and is not.
 *
 * Read from the environment, or from `~/.vanthang-ios.json`, deliberately not from this repository.
 */
const teamId = process.env.APPLE_TEAM_ID ?? readLocalTeamId();
if (!teamId) {
  fail(
    'No Apple Team ID.',
    'export APPLE_TEAM_ID=XXXXXXXXXX   (Apple Developer → Membership details)\n' +
      '     or write {"teamId":"XXXXXXXXXX"} to ~/.vanthang-ios.json',
  );
}
ok(`team ${teamId}`);

if (checkOnly) {
  console.log('\nPreflight passed. Run `npm run ipa` to archive and export.\n');
  process.exit(0);
}

// ── generate, install, archive, export ────────────────────────────────────────────────────────
console.log('\nPrebuild');
// --no-clean for the same reason as Android: SDK 57 clears native directories by default, and a
// wipe mid-session fights anything holding the folder. `npm run prebuild` is the explicit reset.
run('npx', ['expo', 'prebuild', '-p', 'ios', '--no-clean']);

const iosDir = join(app, 'ios');
const workspace = readdirSync(iosDir).find((entry) => entry.endsWith('.xcworkspace'));
if (!workspace) {
  fail('Prebuild produced no .xcworkspace in ios/.', 'npm run prebuild, then try again.');
}
/**
 * The scheme is discovered, never assumed. Expo names the project after `expo.name`, and this one
 * is "Vạn Thắng" — a name that sanitises differently across SDK versions, so hardcoding it is a
 * bug waiting for an upgrade.
 */
const scheme = workspace.replace(/\.xcworkspace$/, '');
ok(`workspace ${workspace} · scheme ${scheme}`);

console.log('\nPods');
run('pod', ['install'], iosDir);

const buildDir = join(app, 'build');
mkdirSync(buildDir, { recursive: true });
const archivePath = join(buildDir, `${scheme}.xcarchive`);
const exportDir = join(buildDir, 'ipa');

console.log('\nArchive');
run('xcodebuild', [
  '-workspace', join(iosDir, workspace),
  '-scheme', scheme,
  '-configuration', 'Release',
  '-destination', 'generic/platform=iOS',
  '-archivePath', archivePath,
  // Lets xcodebuild create or refresh the provisioning profile instead of failing on a missing one.
  '-allowProvisioningUpdates',
  `DEVELOPMENT_TEAM=${teamId}`,
  'archive',
]);

/**
 * `app-store-connect`, not `app-store`: Xcode renamed the method in 15.3 and warns on the old
 * spelling. `signingStyle: automatic` pairs with -allowProvisioningUpdates above.
 */
const exportOptions = join(buildDir, 'ExportOptions.plist');
writeFileSync(
  exportOptions,
  `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key><string>app-store-connect</string>
  <key>teamID</key><string>${teamId}</string>
  <key>signingStyle</key><string>automatic</string>
  <key>uploadSymbols</key><true/>
  <key>destination</key><string>export</string>
</dict>
</plist>
`,
);

console.log('\nExport');
run('xcodebuild', [
  '-exportArchive',
  '-archivePath', archivePath,
  '-exportOptionsPlist', exportOptions,
  '-exportPath', exportDir,
  '-allowProvisioningUpdates',
]);

const ipa = readdirSync(exportDir).find((entry) => entry.endsWith('.ipa'));
if (!ipa) {
  fail(`Export produced no .ipa in ${exportDir}.`);
}

console.log(`\n✓ ${join(exportDir, ipa)}\n`);
console.log('Upload it with either:');
console.log('  xcrun altool --upload-app -f "%s" -t ios --apiKey <KEY_ID> --apiIssuer <ISSUER_ID>'.replace('%s', join(exportDir, ipa)));
console.log('  open -a Transporter        (drag the .ipa in)\n');

/** Mtime in ms, or 0 when the file is not there. */
function statMtime(path) {
  try {
    return statSync(path).mtimeMs;
  } catch {
    return 0;
  }
}

/** The team id from `~/.vanthang-ios.json`, if the file exists. Never read from the repository. */
function readLocalTeamId() {
  try {
    const home = process.env.HOME ?? '';
    const file = join(home, '.vanthang-ios.json');
    if (!existsSync(file)) return undefined;
    return JSON.parse(readFileSync(file, 'utf8')).teamId;
  } catch {
    return undefined;
  }
}
