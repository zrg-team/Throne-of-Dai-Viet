/**
 * The game's two typefaces, self-hosted.
 *
 * Vietnamese is what makes this a real decision rather than a cosmetic one: `ế ổ ữ ằ` stack two
 * marks above the letter, and a face without proper Vietnamese design either collides them or drops
 * them. Be Vietnam Pro was drawn for the language and its diacritics have adaptive forms; Source
 * Serif 4 carries a real Vietnamese subset and has the ascender room the stacked marks need.
 *
 * Before this the stack was `Arial, "Segoe UI", Tahoma` — which is Roboto on Android and Helvetica
 * on iOS, so the game had no typographic identity at all and no control over how the language it is
 * about would render. The faces are vendored by `scripts/fetch-fonts.mjs` and declared in
 * `public/fonts/fonts.css`, because a CDN link on an offline-capable game is a silent fallback
 * waiting to happen.
 *
 * The system faces stay on the end of each stack so a failed font load degrades rather than breaks.
 */
export const UI_FONT = '"Be Vietnam Pro", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
export const TITLE_FONT = '"Source Serif 4", Georgia, "Times New Roman", serif';
