/// <reference types="vite/client" />

/**
 * The build's identity, stamped in by `vite.config.ts` and printed on the settings page.
 * `define`s, not env vars, so they are literals in the bundle and cannot be missing at runtime.
 */
declare const __APP_VERSION__: string;
/** Commits on HEAD — a number that only goes up. Empty when git is unavailable. */
declare const __BUILD_NUMBER__: string;
/** The commit's own date, `YYYY-MM-DD`. Empty when git is unavailable. */
declare const __BUILD_DATE__: string;
