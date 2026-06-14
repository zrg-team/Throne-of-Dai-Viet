import Phaser from 'phaser';
import { RESOURCE_ICONS, RESOURCE_ICON_SIZE } from '../ui/theme';

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super('PreloadScene');
  }

  preload(): void {
    const size = { width: RESOURCE_ICON_SIZE, height: RESOURCE_ICON_SIZE };
    for (const icon of Object.values(RESOURCE_ICONS)) {
      this.load.svg(icon.key, `/icons/${icon.file}.svg`, size);
    }
  }

  create(): void {
    this.scene.start('MapScene');
  }
}
