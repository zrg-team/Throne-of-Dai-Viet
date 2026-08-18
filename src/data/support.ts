/**
 * Where a grateful player can send a coffee, and where a helpful one can send a pull request.
 *
 * Each channel is a link and the detail a sender would type by hand. The modal draws a scannable
 * QR code from the link itself, so a player on a laptop can pay by pointing a phone at the screen —
 * no image file is needed for that. An official image can still be dropped in (`qrImage`) and takes
 * precedence: MoMo's own "QR Đa Năng" is a VietQR code that Vietnamese *bank* apps can read
 * directly, which a code made from a web link cannot offer.
 *
 * Both links were copied out of the apps rather than typed from a remembered format:
 *   Wise  → Payments › Payment tools › Wisetag › "Copy link"
 *   MoMo  → Yêu cầu chuyển tiền › Link nhận tiền của tôi › "Sao chép"
 *           (the QR image: Nhận tiền › Chia sẻ QR nhận tiền › Chia sẻ ảnh mã QR, cropped by
 *           `scripts/crop-support-qr.mjs` into `public/support/momo-qr.webp`)
 *
 * A channel with neither a handle nor a link is left out of the modal; with every channel empty
 * the modal falls back to pointing at GitHub.
 */

export interface SupportChannel {
  /** Which app this is; picks the copy and the accent colour. */
  id: 'wise' | 'momo';
  /** The headline detail a sender types into the app: the `@Wisetag`, or the MoMo phone number. */
  handle: string;
  /** The link the app hands you. Opens in a new tab; also what the drawn QR encodes. */
  link: string;
  /** Optional path under `public/`. When the file is present it replaces the drawn code. */
  qrImage?: string;
}

export const SUPPORT = {
  /** Where "Help improve the game" goes. Issues and pull requests are both welcome there. */
  github: 'https://github.com/zrg-team/Throne-of-Dai-Viet',

  channels: [
    { id: 'wise', handle: '@tand99', link: 'https://wise.com/pay/me/tand99' },
    // `qrImage` is written by `node scripts/crop-support-qr.mjs <screenshot>` once the file exists —
    // a path to a file that is not there would 404 in the console on every launch.
    { id: 'momo', handle: '', link: 'https://me.momo.vn/6OfbtWIOTeIJi5Tw', qrImage: 'support/momo-qr.webp' },
  ] as SupportChannel[],
};

/** Texture key under which PreloadScene registers a channel's QR image, if it has one. */
export function supportQrTextureKey(channel: SupportChannel): string {
  return `support-qr:${channel.id}`;
}

/** Channels with something to show. Order is the order they appear in the modal. */
export function configuredSupportChannels(): SupportChannel[] {
  return SUPPORT.channels.filter((channel) => channel.handle.trim() !== '' || channel.link.trim() !== '');
}
