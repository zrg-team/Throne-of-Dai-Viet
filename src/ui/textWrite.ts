import type Phaser from 'phaser';

/**
 * Guarded writes into a retained `Text`.
 *
 * Phaser already early-outs `setText` on an equal string and `setFontSize`/`setFontStyle` on an
 * equal value — but **`setColor` is unguarded**: it re-rasterises the label's canvas and
 * re-uploads the texture even when the colour has not changed, and at `resolution: RENDER_SCALE`
 * that upload is up to nine times the label's design size. The HUD calls it every tick and the
 * fight screen every beat, so the guard lives here once instead of at forty call sites.
 *
 * Returns true when anything actually changed, so a caller batching layout work (`reflow`) can
 * skip it on a quiet write.
 */
export function writeText(
  label: Phaser.GameObjects.Text,
  text: string,
  colour?: string,
): boolean {
  let changed = false;
  if (label.text !== text) {
    label.setText(text);
    changed = true;
  }
  if (colour !== undefined && label.style.color !== colour) {
    label.setColor(colour);
    changed = true;
  }
  return changed;
}

/** Guarded style writes for the setters Phaser does not guard itself. */
export function writeStyle(
  label: Phaser.GameObjects.Text,
  style: { color?: string; backgroundColor?: string; wordWrapWidth?: number },
): boolean {
  let changed = false;
  if (style.color !== undefined && label.style.color !== style.color) {
    label.setColor(style.color);
    changed = true;
  }
  if (style.backgroundColor !== undefined && label.style.backgroundColor !== style.backgroundColor) {
    label.setBackgroundColor(style.backgroundColor);
    changed = true;
  }
  if (style.wordWrapWidth !== undefined && label.style.wordWrapWidth !== style.wordWrapWidth) {
    label.setWordWrapWidth(style.wordWrapWidth);
    changed = true;
  }
  return changed;
}
