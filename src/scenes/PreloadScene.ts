import Phaser from 'phaser';
import { preloadHeroFaces } from '../ui/FaceRenderer';
import { RESOURCE_ICONS, RESOURCE_ICON_SIZE } from '../ui/theme';
import { applyRenderScale } from '../game/graphicsQuality';
import { configuredSupportChannels, supportQrTextureKey } from '../data/support';
import { allowsDonationLinks } from '../platform/shell';

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super('PreloadScene');
  }

  preload(): void {
    const size = { width: RESOURCE_ICON_SIZE, height: RESOURCE_ICON_SIZE };
    const baseUrl = import.meta.env.BASE_URL;
    // The front-page landscape is a registered four-plate illustration. Mountains, bamboo and
    // lotus retain a shared 1536x1024 frame so MenuScene can move them independently without the
    // perspective drift that comes from rebuilding the scene out of map tokens.
    this.load.image('menu-layer-ground-v4', `${baseUrl}art/menu-layer-ground-v4.png`);
    this.load.image('menu-layer-mountains-v1', `${baseUrl}art/menu-layer-mountains-v1.png`);
    this.load.image('menu-layer-bamboo-v1', `${baseUrl}art/menu-layer-bamboo-v1.png`);
    this.load.image('menu-layer-lotus-v1', `${baseUrl}art/menu-layer-lotus-v1.png`);
    for (const icon of Object.values(RESOURCE_ICONS)) {
      this.load.svg(icon.key, `${baseUrl}icons/${icon.file}.svg`, size);
    }
    // Hero portraits are composed from a part library rather than drawn at runtime; every
    // scene that shows a roster needs these in the texture manager before it renders.
    preloadHeroFaces(this);
    // A support channel's QR is fetched here, not when the coffee modal opens, so the modal
    // never shows a hole while a fetch is in flight. Only configured images are requested — an
    // unconfigured build must not 404 on every launch — and none at all where the modal cannot be
    // reached, which in either store's build it cannot: see `allowsDonationLinks`.
    if (allowsDonationLinks()) {
      for (const channel of configuredSupportChannels()) {
        if (channel.qrImage) {
          this.load.image(supportQrTextureKey(channel), `${baseUrl}${channel.qrImage}`);
        }
      }
    }
  }

  create(): void {
    applyRenderScale(this);
    this.scene.start('MenuScene');
  }
}
