/**
 * The two things a canvas game occasionally has to ask the browser for: a new tab, and the
 * clipboard. Both are only allowed inside a user gesture, and Phaser dispatches its pointer events
 * synchronously from the DOM handler, so calling these from a button's `pointerup` counts.
 */

/**
 * Opens `url` in a new tab without handing it a reference back to the game.
 *
 * Done through a synthetic anchor rather than `window.open`: with `noopener` the spec has
 * `window.open` return `null` even on success, so a caller cannot tell "blocked" from "opened", and
 * an anchor click is what every browser's popup heuristics were tuned against anyway.
 */
export function openExternalLink(url: string): void {
  if (typeof document === 'undefined') {
    return;
  }
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.target = '_blank';
  anchor.rel = 'noopener noreferrer';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

/**
 * Copies `text`, and says whether it believes it succeeded.
 *
 * `navigator.clipboard` needs a secure context — GitHub Pages and localhost both are — and the
 * `execCommand` path is the fallback for the WebView that is neither.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the legacy path.
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const copied = document.execCommand('copy');
    area.remove();
    return copied;
  } catch {
    return false;
  }
}
