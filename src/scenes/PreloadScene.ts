import Phaser from 'phaser';
import { preloadHeroFaces } from '../ui/FaceRenderer';
import { RESOURCE_ICONS, RESOURCE_ICON_SIZE } from '../ui/theme';
import { applyRenderScale } from '../game/graphicsQuality';

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
  }

  create(): void {
    applyRenderScale(this);
    this.scene.start('MenuScene');
  }
}
