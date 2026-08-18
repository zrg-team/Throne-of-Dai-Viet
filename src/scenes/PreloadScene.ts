import Phaser from 'phaser';
import { preloadHeroFaces } from '../ui/FaceRenderer';
import { RESOURCE_ICONS, RESOURCE_ICON_SIZE } from '../ui/theme';
import { applyRenderScale } from '../game/graphicsQuality';
import { configuredSupportChannels, supportQrTextureKey } from '../data/support';

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super('PreloadScene');
  }

  preload(): void {
    const size = { width: RESOURCE_ICON_SIZE, height: RESOURCE_ICON_SIZE };
    const baseUrl = import.meta.env.BASE_URL;
    for (const icon of Object.values(RESOURCE_ICONS)) {
      this.load.svg(icon.key, `${baseUrl}icons/${icon.file}.svg`, size);
    }
    // Hero portraits are composed from a part library rather than drawn at runtime; every
    // scene that shows a roster needs these in the texture manager before it renders.
    preloadHeroFaces(this);
    // A support channel's QR is fetched here, not when the coffee modal opens, so the modal
    // never shows a hole while a fetch is in flight. Only configured images are requested — an
    // unconfigured build must not 404 on every launch.
    for (const channel of configuredSupportChannels()) {
      if (channel.qrImage) {
        this.load.image(supportQrTextureKey(channel), `${baseUrl}${channel.qrImage}`);
      }
    }
  }

  create(): void {
    applyRenderScale(this);
    this.scene.start('MenuScene');
  }
}
