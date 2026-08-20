import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from './constants';
import { BootScene } from '../scenes/BootScene';
import { MenuScene } from '../scenes/MenuScene';
import { GuideScene } from '../scenes/GuideScene';
import { HistoryScene } from '../scenes/HistoryScene';
import { CampaignScene } from '../scenes/CampaignScene';
import { BattleArenaScene } from '../scenes/BattleArenaScene';
import { ConquestScene } from '../scenes/ConquestScene';
import { ConquestUIScene } from '../scenes/ConquestUIScene';
import { MapScene } from '../scenes/MapScene';
import { PreloadScene } from '../scenes/PreloadScene';
import { UIScene } from '../scenes/UIScene';
import { PAPER_FX_KEY, PaperFX } from '../ui/ink/PaperFX';
import { RENDER_SCALE } from './graphicsQuality';

// Retaining the WebGL drawing buffer forces the browser to preserve the
// framebuffer every frame — a real GPU-bandwidth/memory cost on mobile tiled
// GPUs. The game never reads back canvas pixels, so we only enable it when an
// external screenshot tool explicitly asks via `?capture=1`.
const needsCapture =
  typeof window !== 'undefined' && /[?&]capture=1\b/.test(window.location.search);

export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-root',
  width: GAME_WIDTH * RENDER_SCALE,
  height: GAME_HEIGHT * RENDER_SCALE,
  backgroundColor: '#e9dfc2',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    // The drawing buffer, in real pixels. Phaser's own `zoom` option cannot do this — it restyles
    // the canvas and leaves the backing store alone — so the game is sized up here and every
    // camera is zoomed by the same factor, which puts scenes back into 390-wide design units. The
    // net effect is that a phone at pixel ratio 3 draws 1170x2532 real pixels instead of drawing
    // 390x844 and letting the browser blow it up on the way to the glass.
    width: GAME_WIDTH * RENDER_SCALE,
    height: GAME_HEIGHT * RENDER_SCALE,
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
  // One full-screen pass that ages the whole frame — world and chrome alike — so the two sit on
  // the same sheet of paper. Registered here and attached per scene by `applyPaperFX`.
  pipeline: { [PAPER_FX_KEY]: PaperFX } as unknown as Phaser.Types.Core.PipelineConfig,
  // Only index 0 auto-starts; the rest are registered-but-stopped until started by name.
  scene: [BootScene, PreloadScene, MenuScene, GuideScene, HistoryScene, CampaignScene, BattleArenaScene, MapScene, UIScene, ConquestScene, ConquestUIScene],
};
