/**
 * Prebuild, then run Gradle — on whichever platform you happen to be on.
 *
 * `cd android && ./gradlew` in a package script does not survive the trip between shells: npm runs
 * scripts through `cmd.exe` on Windows, where `./gradlew` is not a path and `gradlew.bat` is not
 * one anywhere else. One wrapper spawning the right file is smaller than the workaround.
 *
 *   node scripts/gradle.mjs assembleRelease   → an APK you can sideload
 *   node scripts/gradle.mjs bundleRelease     → an AAB for Play
 *
 * Prebuild runs first every time, re-applying the config plugins over the existing `android/`.
 * For a from-scratch regeneration use `npm run prebuild`; see the note on `--no-clean` below.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const task = process.argv[2] ?? 'assembleRelease';
const windows = process.platform === 'win32';

// Without the archive there is no game in the app — and Gradle would happily build that.
if (!existsSync(join(app, 'assets/web.zip'))) {
  console.error('No assets/web.zip.\n  yarn build:shell   (repository root)\n  npm run sync       (here)');
  process.exit(1);
}

const run = (command, args, cwd) => {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', shell: windows });
  if (result.status !== 0) process.exit(result.status ?? 1);
};

/**
 * Prebuild with `--no-clean`, deliberately.
 *
 * SDK 57 made clearing the native directories prebuild's *default*, so dropping `--clean` changes
 * nothing and `--no-clean` is the actual opt-out. That default deletes the whole `android/` tree,
 * build output included — and Gradle keeps a daemon alive for three hours after a build, holding
 * open handles on things like
 * `app/build/intermediates/dex/release/mergeDexRelease/classes.dex`. On Windows the delete then
 * fails with `EBUSY`, so every second build in a session died before it started. `gradlew --stop`
 * first is not reliable either: the daemon exits asynchronously and the handles outlive the call.
 *
 * Prebuild without `--clean` re-runs the whole config-plugin pipeline and rewrites every file it
 * manages — `AndroidManifest.xml`, `build.gradle`, the network security config — so a plugin
 * change still lands. What it does not do is remove files a plugin *stopped* emitting. That is
 * what `npm run prebuild` is for: an explicit, occasional, fresh start, run when no build is in
 * flight.
 */
run(windows ? 'npx.cmd' : 'npx', ['expo', 'prebuild', '-p', 'android', '--no-clean'], app);

/**
 * Prebuild is not trusted to have worked, because it exits 0 when it has not.
 *
 * On Windows `--clean` cannot delete `android/` while any process holds it as a working directory —
 * a second terminal, an editor pane, a live Gradle daemon. Expo prints `EBUSY`, carries on, and
 * exits 0; without this check the next line then builds whatever `android/` happened to be there,
 * which is the stale-native-project trap `--clean` exists to prevent.
 */
const android = join(app, 'android');
const wrapperName = windows ? 'gradlew.bat' : 'gradlew';
const wrapper = join(android, wrapperName);
if (!existsSync(wrapper)) {
  const hint = windows
    ? [
        'On Windows this is almost always EBUSY: something is sitting in apps/mobile/android.',
        'Close any terminal or editor pane in that folder, cd out of it, then retry.',
      ].join('\n')
    : '';
  console.error(`\nPrebuild left no ${wrapperName} in android/.\n${hint}`);
  process.exit(1);
}

/**
 * Absolute wrapper path, `-p` for the project, and a cwd that is neither.
 *
 * Two Windows problems in one line. `cmd.exe` does not reliably resolve an executable out of the
 * spawn's `cwd`, so a bare `gradlew.bat` fails with "is not recognized" while standing in the
 * folder that contains it. And any process whose working directory is inside a build folder locks
 * it: the next `--clean` cannot delete `android/`, and Gradle itself cannot replace the
 * `sysroot/` that `react-native-static-server` rebuilds, which surfaces as
 * "used by another process" rather than as anything to do with directories.
 */
run(wrapper, ['-p', android, task], app);

const out = task.startsWith('bundle')
  ? 'android/app/build/outputs/bundle/release'
  : 'android/app/build/outputs/apk/release';
console.log(`\n${task} done → apps/mobile/${out}`);
