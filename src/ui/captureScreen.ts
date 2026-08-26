/**
 * Taking a picture of the screen and handing it to the player.
 *
 * One place, because the three ways a device will accept a picture are all fallbacks for one
 * another and picking between them is the whole job:
 *
 * 1. **The share sheet** (`navigator.share` with a `File`). The only route that reaches Photos on
 *    iOS, which is where this is asked for — the game ships as a WKWebView through Expo, and a
 *    WebView has no Downloads folder to put a file in. Guarded by `canShare`, because Safari
 *    exposes `navigator.share` for text on platforms that refuse files, and calling it with a
 *    file there rejects rather than degrading.
 * 2. **A download link**, for desktop browsers and Android Chrome.
 * 3. **A new tab with the image in it**, when the first two are unavailable or refused — the
 *    player long-presses it. Never nothing.
 *
 * The frame comes from `renderer.snapshot`, not from `canvas.toDataURL`. The canvas is created
 * without `preserveDrawingBuffer` on purpose (it is a real GPU-bandwidth cost on a phone, and is
 * only turned on behind `?capture=1` for the shot harnesses), so reading the canvas directly
 * outside a render pass returns a blank image. Phaser's snapshot schedules the read *inside* the
 * pass, which is why it works on the default config and a `toDataURL` here would have quietly
 * saved a transparent rectangle.
 */
import Phaser from 'phaser';

export type CaptureResult = 'shared' | 'downloaded' | 'opened' | 'failed';

/** Grabs the current frame as a PNG blob. Resolves `undefined` if the renderer will not give one. */
function snapshotBlob(game: Phaser.Game): Promise<Blob | undefined> {
  return new Promise((resolve) => {
    // A snapshot that never fires must not leave the caller's button spinning forever.
    const bail = window.setTimeout(() => resolve(undefined), 4000);
    try {
      game.renderer.snapshot((image) => {
        window.clearTimeout(bail);
        if (!(image instanceof HTMLImageElement) || !image.src.startsWith('data:')) {
          resolve(undefined);
          return;
        }
        // data: URL → bytes. `fetch` on a data URL is synchronous work behind a promise and needs
        // no network, which is what keeps this working offline and inside the service worker.
        fetch(image.src).then((response) => response.blob()).then(resolve).catch(() => resolve(undefined));
      });
    } catch {
      window.clearTimeout(bail);
      resolve(undefined);
    }
  });
}

/**
 * Captures the frame and offers it to the player however this device will take it.
 *
 * `title` becomes the file name and the share sheet's caption.
 */
export async function captureScreen(game: Phaser.Game, title: string): Promise<CaptureResult> {
  const blob = await snapshotBlob(game);
  if (!blob) return 'failed';
  const safe = title.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 48) || 'van-thang';
  const name = `${safe}.png`;

  const nav = navigator as Navigator & {
    canShare?: (data: ShareData) => boolean;
    share?: (data: ShareData) => Promise<void>;
  };
  if (typeof File === 'function' && nav.share && nav.canShare) {
    const file = new File([blob], name, { type: 'image/png' });
    if (nav.canShare({ files: [file] })) {
      try {
        await nav.share({ files: [file], title });
        return 'shared';
      } catch (error) {
        // A player who taps Cancel on the share sheet has not failed at anything, and must not
        // then be handed a download they did not ask for.
        if ((error as DOMException)?.name === 'AbortError') return 'shared';
      }
    }
  }

  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    if ('download' in anchor) {
      anchor.href = url;
      anchor.download = name;
      anchor.rel = 'noopener';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      // Long enough for the browser to have read it; revoking at once cancels the download on
      // WebKit. Not `load`-gated, because an anchor click fires no load event.
      window.setTimeout(() => URL.revokeObjectURL(url), 20000);
      return 'downloaded';
    }
    const opened = window.open(url, '_blank');
    if (opened) return 'opened';
  } catch {
    // falls through to the failure below
  }
  URL.revokeObjectURL(url);
  return 'failed';
}
