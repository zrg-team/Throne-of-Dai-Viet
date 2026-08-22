import packageJson from './package.json';
import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';

const homepagePath = (() => {
  if (typeof packageJson.homepage !== 'string' || packageJson.homepage.length === 0) {
    return '/';
  }

  const { pathname } = new URL(packageJson.homepage);
  return pathname.endsWith('/') ? pathname : `${pathname}/`;
})();

/**
 * What the settings page prints under "Version".
 *
 * `package.json` is the headline and the thing to bump. The other two exist because it alone
 * cannot answer "which build have you got?" — it moves once a month and every deploy in between
 * wears the same number. So: the commit count, which is a number a player can read out and which
 * only ever goes up, and the date of that commit.
 *
 * The COMMIT's date, deliberately, not the build clock. A build stamp would change on every
 * rebuild of the same source, which changes the bundle, which changes the service worker's content
 * hash — and the player is told there is a new version of code identical to the one they are
 * running. Keyed to the commit, rebuilding the same commit is byte-identical all the way down.
 *
 * Both are empty when git is not available (a source tarball); the settings line simply leaves out
 * the parts it does not have.
 */
const fromGit = (command: string): string => {
  try {
    return execSync(command, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return '';
  }
};
// The deploy workflow checks out with `fetch-depth: 0` for this — the default shallow clone has
// one commit in it and would report every build as build 1.
const buildNumber = fromGit('git rev-list --count HEAD');
const buildDate = fromGit('git log -1 --format=%cs');

export default defineConfig(({ command, isPreview }) => ({
  // `vite preview` runs with `command === 'serve'`, so a plain `command === 'build'` test served
  // the built app from `/` while its own index.html pointed every asset at `/ten-thousand-victories/`:
  // a preview that 404'd its own bundle and fell through to the SPA fallback, which is not a
  // preview of anything. `isPreview` is the difference between the two serve modes.
  base: command === 'build' || isPreview ? homepagePath : '/',
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
    __BUILD_NUMBER__: JSON.stringify(buildNumber),
    __BUILD_DATE__: JSON.stringify(buildDate),
  },
  publicDir: 'public',
  build: {
    copyPublicDir: true,
  },
  server: {
    port: 5173,
  },
  preview: {
    port: 4173,
  },
}));
