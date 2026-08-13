/**
 * The design surface, in game units.
 *
 * Width is fixed: every bar, card and button in the game is laid out against 390, and letting it
 * move would mean re-tuning a hundred call sites for nothing.
 *
 * Height is NOT fixed, and that is the whole point. Phaser's `Scale.FIT` fits the design box inside
 * the visible viewport, so a design taller than the viewport gets scaled down by height and the
 * spare width becomes letterbox. On an iPhone 13 in Safari the visible viewport is 390x664 once the
 * toolbars are showing — against a fixed 390x844 design that is a scale of 0.787, with 83px of dead
 * bars down each side and every label a fifth too small. An SE lands at 0.655.
 *
 * Taking the height from the device's own aspect ratio makes FIT scale by *width* instead, so the
 * game fills the screen at 1:1 or better and the map area simply gets shorter or taller. The clamp
 * keeps a very square or very long screen from squeezing the header and action bar into each other.
 */
export const GAME_WIDTH = 390;

const MIN_DESIGN_HEIGHT = 620;
const MAX_DESIGN_HEIGHT = 1040;

function designHeight(): number {
  if (typeof window === 'undefined' || !window.innerWidth || !window.innerHeight) {
    return 844;
  }
  const ratio = window.innerHeight / window.innerWidth;
  return Math.round(Math.max(MIN_DESIGN_HEIGHT, Math.min(MAX_DESIGN_HEIGHT, GAME_WIDTH * ratio)));
}

export const GAME_HEIGHT = designHeight();

/**
 * The resource strip at the top of the screen.
 *
 * 44 was too short to hold what is in it. The strip carries a răng cưa band at each edge, the
 * year/season line, and the four stores — and in Vietnamese the title's own diacritics (the breve on
 * "Năm", the circumflex on "Xuân") reached up into the top band, while the numbers' parentheses sat
 * on the bottom one. The eight units this gains are taken back out of the Dragon Ascent HUD below
 * it, which was spending them on a second decorative band directly under its progress bar, so that
 * mode's chrome is exactly as tall as it was.
 */
export const HEADER_HEIGHT = 52;
export const ACTION_BAR_HEIGHT = 50;

export const PLAYER_KINGDOM_ID = 'dai-viet';
export const NEUTRAL_OWNER_ID = 'neutral';

export const ORDERS_PER_SEASON = 3;

/**
 * Whether a mode uses the campaign systems (court cards, foreign affairs, spy,
 * dynasty stability, invasions). True for the classic 'campaign' and the off-map
 * 'empire' mode.
 */
export function isCampaignMode(mode: string): boolean {
  return mode === 'campaign' || mode === 'empire';
}

/**
 * Whether a mode is an endless survival run with no map-conquest win condition.
 * True for 'empire' (win only via prestige Ascension) and 'ascent' (no win at all).
 * These modes must never be scored by `checkVictory`'s enemy-castle sweep — they have
 * no enemy castles on the map, so that check would declare victory on the first tick.
 */
export function isEndlessMode(mode: string): boolean {
  return mode === 'empire' || mode === 'ascent';
}

/** Real-time interval, in ms, between economy ticks (acquisitions, builds, army marches). */
export const REALTIME_TICK_MS = 5500;

export const COLORS = {
  background: 0xd9cfb7,
  paper: 0xe9dcc1,
  paperDark: 0xc8b372,
  ink: 0x211103,
  water: 0x177d8d,
  road: 0x8b806b,
  player: 0x55c878,
  enemyNorth: 0xb85b53,
  enemySouth: 0x8d62bd,
  neutral: 0xd1bd7c,
  selected: 0xffde72,
  panel: 0x2a1403,
  panelLight: 0x6b5230,
  text: '#fff6bd',
  darkText: '#211103',
};
