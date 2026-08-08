import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from './constants';
import { BootScene } from '../scenes/BootScene';
import { MenuScene } from '../scenes/MenuScene';
import { CampaignScene } from '../scenes/CampaignScene';
import { ConquestScene } from '../scenes/ConquestScene';
import { ConquestUIScene } from '../scenes/ConquestUIScene';
import { MapScene } from '../scenes/MapScene';
import { PreloadScene } from '../scenes/PreloadScene';
import { UIScene } from '../scenes/UIScene';

// Retaining the WebGL drawing buffer forces the browser to preserve the
// framebuffer every frame — a real GPU-bandwidth/memory cost on mobile tiled
// GPUs. The game never reads back canvas pixels, so we only enable it when an
// external screenshot tool explicitly asks via `?capture=1`.
const needsCapture =
  typeof window !== 'undefined' && /[?&]capture=1\b/.test(window.location.search);

export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-root',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: '#3f5e5c',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
  },
  input: {
    activePointers: 3,
    touch: true,
  },
  render: {
    preserveDrawingBuffer: needsCapture,
    powerPreference: 'high-performance',
    roundPixels: true,
  },
  // Only index 0 auto-starts; the rest are registered-but-stopped until started by name.
  scene: [BootScene, PreloadScene, MenuScene, CampaignScene, MapScene, UIScene, ConquestScene, ConquestUIScene],
};
