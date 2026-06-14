import Phaser from 'phaser';

export class TouchController {
  constructor(private readonly scene: Phaser.Scene) {}

  makeTapTarget(
    target: Phaser.GameObjects.GameObject,
    callback: (pointer: Phaser.Input.Pointer) => void,
  ): void {
    target.setInteractive({ useHandCursor: true });
    target.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      callback(pointer);
    });
  }

  enableFullscreenKey(): void {
    this.scene.input.keyboard?.on('keydown-F', () => {
      if (this.scene.scale.isFullscreen) {
        this.scene.scale.stopFullscreen();
      } else {
        this.scene.scale.startFullscreen();
      }
    });
  }
}
