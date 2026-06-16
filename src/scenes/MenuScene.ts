import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../game/constants';
import { createInitialGameState } from '../state/GameState';
import { hasSnapshot, loadSnapshot, snapshotLabel } from '../state/save';
import { InkMapItemRenderer } from '../ui/MapItemRenderer';
import { decorateForest, decorateRiceFields, decorateWater, InkMapRenderer } from '../ui/MapRenderer';
import { InkUI, INK_UI } from '../ui/InkUI';
import { INK, brushStroke, inkOutline, shade, washFill, waveLine } from '../ui/inkTheme';

type MenuMode = 'main' | 'confirm-new';

export class MenuScene extends Phaser.Scene {
  private ui!: InkUI;
  private inkMap!: InkMapRenderer;
  private inkItems!: InkMapItemRenderer;
  private content: Phaser.GameObjects.GameObject[] = [];
  private mode: MenuMode = 'main';
  private previewFlagSeed = 0;

  constructor() {
    super('MenuScene');
  }

  create(): void {
    window.__mandateState = undefined;
    this.registry.remove('gameState');
    this.ui = new InkUI(this);
    this.inkMap = new InkMapRenderer(this);
    this.inkItems = new InkMapItemRenderer(this);
    this.previewFlagSeed = loadSnapshot()?.state.mapConfig.seed ?? Math.floor(Math.random() * 1_000_000);
    this.drawBackground();
    this.render();
  }

  private drawBackground(): void {
    this.inkMap.drawBackground(GAME_WIDTH, GAME_HEIGHT);
    this.drawLandscape();
    this.drawInkCitadel();
    this.drawArmies();
    this.drawFogBands();
    this.drawBronzeSeal();
  }

  private drawLandscape(): void {
    const g = this.add.graphics();
    const rng = createMenuRng(1307);

    // Pale mist at the horizon – fades into the sea-teal background
    g.fillGradientStyle(0xc4d8d4, 0xc4d8d4, INK.sea, INK.sea, 0.55);
    g.fillRect(0, 0, GAME_WIDTH, 252);

    // Layered mountains drawn before the land polygon so they sit behind it
    this.drawMenuMountains(g);

    // Main land polygon – rolling fields from horizon to bottom
    const mainLand = [
      { x: -20, y: 252 },
      { x: 64, y: 228 },
      { x: 148, y: 244 },
      { x: 230, y: 218 },
      { x: 312, y: 236 },
      { x: GAME_WIDTH + 20, y: 250 },
      { x: GAME_WIDTH + 20, y: GAME_HEIGHT + 20 },
      { x: -20, y: GAME_HEIGHT + 20 },
    ];
    washFill(g, mainLand, INK.landFields, 0.88, () => rng());
    inkOutline(g, mainLand.slice(0, 6), INK.inkSoft, 0.22, false, 31);

    // Forest – organic shape that fills the entire left bank of the river.
    // Right edge follows the river control points with a small inset so the
    // river stroke visually reads as the border between forest and fields.
    const forestShape = [
      { x: -20, y: 236 },
      { x: 88, y: 228 },
      { x: 192, y: 246 },
      // river left bank: mirror river control points with ~6 px inset
      { x: 192, y: 306 },
      { x: 166, y: 412 },
      { x: 134, y: 524 },
      { x: 90, y: 632 },
      { x: 46, y: 740 },
      { x: 14, y: 844 },
      { x: -20, y: 844 },
    ];
    washFill(g, forestShape, INK.landForest, 0.80, () => rng());

    // Tree silhouettes distributed across the full forest band
    decorateForest(g, [
      { x: 42, y: 272 },
      { x: 106, y: 292 },
      { x: 58, y: 362 },
      { x: 144, y: 350 },
      { x: 26, y: 438 },
      { x: 112, y: 424 },
      { x: 62, y: 516 },
      { x: 88, y: 578 },
      { x: 28, y: 618 },
      { x: 56, y: 676 },
      { x: 22, y: 722 },
      { x: 46, y: 774 },
    ], 44, createMenuRng(444));

    // Rice terraces – right side of the river
    const riceShape = [
      { x: 220, y: 328 },
      { x: GAME_WIDTH + 20, y: 300 },
      { x: GAME_WIDTH + 20, y: 540 },
      { x: 234, y: 554 },
      { x: 200, y: 450 },
    ];
    washFill(g, riceShape, INK.landRice, 0.74, () => rng());

    const riceRng = createMenuRng(555);
    for (let y = 336; y <= 520; y += 30) {
      waveLine(g, 222, y, GAME_WIDTH - 14, y - 7, 2.5, 8, INK.inkSoft, 0.28);
    }
    decorateRiceFields(g, { x: 306, y: 376 }, 52, riceRng);
    decorateRiceFields(g, { x: 358, y: 442 }, 52, riceRng);
    decorateRiceFields(g, { x: 300, y: 496 }, 52, riceRng);

    // Lower plains behind the button row
    const lowerPlains = [
      { x: -20, y: 498 },
      { x: GAME_WIDTH + 20, y: 498 },
      { x: GAME_WIDTH + 20, y: GAME_HEIGHT + 20 },
      { x: -20, y: GAME_HEIGHT + 20 },
    ];
    washFill(g, lowerPlains, shade(INK.landPlains, 0.96), 0.60, () => rng());

    for (let y = 518; y < 780; y += 44) {
      brushStroke(g, [{ x: 14, y }, { x: GAME_WIDTH - 14, y: y - 10 }], 0.9, INK.inkFaint, 0.14, y + 500);
    }

    // River from mountain area, flowing through forest to the sea
    this.drawInkRiver();

    // Road on the right bank winding down from the citadel
    const roadG = this.add.graphics();
    this.inkMap.drawRoad(roadG, [
      { x: 262, y: 316 },
      { x: 238, y: 392 },
      { x: 210, y: 480 },
      { x: 178, y: 576 },
      { x: 142, y: 674 },
    ], 7, 4);
  }

  /**
   * Two-layer mountain range drawn manually for the menu:
   *   – Far layer: pale, low-alpha silhouettes near the horizon
   *   – Near layer: solid peaks with inner ridge, snow cap, and mist band
   */
  private drawMenuMountains(g: Phaser.GameObjects.Graphics): void {
    // ── Far range – horizon silhouettes ──────────────────────────────────
    const farRng = createMenuRng(800);
    const farPeaks = [
      { cx: 52,  baseY: 228, halfW: 64, h: 70 },
      { cx: 152, baseY: 218, halfW: 82, h: 88 },
      { cx: 256, baseY: 224, halfW: 70, h: 76 },
      { cx: 362, baseY: 216, halfW: 60, h: 82 },
    ];
    for (const { cx, baseY, halfW, h } of farPeaks) {
      const jx = (farRng() - 0.5) * 14;
      const pts = [
        { x: cx - halfW,            y: baseY },
        { x: cx - halfW * 0.30,     y: baseY - h * 0.44 },
        { x: cx + jx,               y: baseY - h },
        { x: cx + halfW * 0.34,     y: baseY - h * 0.40 },
        { x: cx + halfW,            y: baseY },
      ];
      washFill(g, pts, shade(INK.mountain, 1.10), 0.30);
      inkOutline(g, pts, INK.inkFaint, 0.16, false, cx);
      // Mist streak across lower slopes
      g.fillStyle(INK.mountainMist, 0.16);
      g.fillEllipse(cx, baseY - h * 0.30, halfW * 1.7, h * 0.22);
    }

    // ── Near range – right side, behind citadel ───────────────────────────
    const nearRng = createMenuRng(305);
    const nearPeaks = [
      { cx: 302, baseY: 272, halfW: 76, h: 94 },
      { cx: 368, baseY: 260, halfW: 62, h: 110 },
    ];
    for (const { cx, baseY, halfW, h } of nearPeaks) {
      const jx = (nearRng() - 0.5) * 10;
      // Main silhouette with a secondary shoulder peak
      const pts = [
        { x: cx - halfW,             y: baseY },
        { x: cx - halfW * 0.56,      y: baseY - h * 0.52 },
        { x: cx - halfW * 0.16 + jx, y: baseY - h * 0.80 },
        { x: cx + jx,                y: baseY - h },
        { x: cx + halfW * 0.22 + jx, y: baseY - h * 0.84 },
        { x: cx + halfW * 0.52,      y: baseY - h * 0.48 },
        { x: cx + halfW,             y: baseY },
      ];
      washFill(g, pts, shade(INK.mountain, 0.86), 0.88);
      inkOutline(g, pts, INK.ink, 0.60, false, cx);

      // Fainter inner ridge for depth
      const innerPts = [
        { x: cx - halfW * 0.54,      y: baseY - 2 },
        { x: cx - halfW * 0.20 + jx, y: baseY - h * 0.74 },
        { x: cx + jx,                y: baseY - h * 0.96 },
        { x: cx + halfW * 0.26 + jx, y: baseY - h * 0.76 },
        { x: cx + halfW * 0.52,      y: baseY - 2 },
      ];
      inkOutline(g, innerPts, INK.inkSoft, 0.26, false, cx + 11);

      // Snow cap at peak
      g.fillStyle(INK.mountainMist, 0.84);
      g.fillTriangle(
        cx + jx,                     baseY - h,
        cx + jx - halfW * 0.22,      baseY - h * 0.72,
        cx + jx + halfW * 0.20,      baseY - h * 0.68,
      );

      // Mist band across mid-slopes
      g.fillStyle(INK.cloud, 0.22);
      g.fillEllipse(cx, baseY - h * 0.40, halfW * 1.5, h * 0.20);
    }
  }

  private drawInkRiver(): void {
    const river = this.add.graphics();
    const riverPoints = [
      { x: 16,  y: 844 },
      { x: 52,  y: 738 },
      { x: 96,  y: 630 },
      { x: 140, y: 522 },
      { x: 172, y: 410 },
      { x: 198, y: 304 },
      { x: 232, y: 240 },
    ];
    brushStroke(river, riverPoints, 18, INK.seaDeep, 0.54, 87);
    brushStroke(river, riverPoints, 9,  INK.waterLine, 0.46, 91);
    const rng = createMenuRng(91);
    for (const point of riverPoints) {
      decorateWater(river, point, 44, rng);
    }
    for (let index = 0; index < 6; index += 1) {
      waveLine(river, 26 + index * 28, 816 - index * 96, 72 + index * 26, 806 - index * 96, 3, 5, INK.waterLine, 0.20);
    }
  }

  /** Draws three army formations on the right bank of the river. */
  private drawArmies(): void {
    const g = this.add.graphics();

    const units: Array<{ cx: number; cy: number; color: number; cols: number; rows: number; capital: boolean; scale: number }> = [
      { cx: 286, cy: 388, color: INK.sealRed,     cols: 5, rows: 3, capital: true,  scale: 0.88 },
      { cx: 338, cy: 466, color: INK.sealRedDark,  cols: 4, rows: 3, capital: false, scale: 0.78 },
      { cx: 274, cy: 526, color: 0x3e4a2c,          cols: 4, rows: 2, capital: false, scale: 0.70 },
    ];

    for (let i = 0; i < units.length; i += 1) {
      const { cx, cy, color, cols, rows, capital, scale } = units[i];
      this.drawSoldiers(g, cx, cy, color, cols, rows);

      // Flag positioned at the right edge of the formation using existing renderer
      const totalW = (cols - 1) * 11;
      const totalH = (rows - 1) * 11;
      const flag = this.inkItems.createPlayerLandFlag(capital, this.previewFlagSeed + i);
      flag.setPosition(cx + totalW / 2 + 14, cy + totalH / 2 + 4);
      flag.setScale(1);
    }
  }

  /** Draws a cols×rows grid of soldier silhouettes (body + head + spear). */
  private drawSoldiers(
    g: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    bodyColor: number,
    cols: number,
    rows: number,
  ): void {
    const spacing = 11;
    const startX = x - (cols - 1) * spacing / 2;
    const startY = y - (rows - 1) * spacing / 2;

    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const sx = startX + col * spacing;
        const sy = startY + row * spacing;
        g.fillStyle(bodyColor, 0.82);
        g.fillRect(sx - 2, sy, 4, 6);
        g.fillStyle(shade(bodyColor, 1.28), 0.82);
        g.fillCircle(sx, sy - 2, 2.4);
        g.lineStyle(0.8, INK.ink, 0.55);
        g.lineBetween(sx + 1, sy - 4, sx + 1, sy - 11);
      }
    }
  }

  private drawInkCitadel(): void {
    const g = this.add.graphics({ x: 250, y: 272 });
    g.fillStyle(INK.ink, 0.26);
    g.fillEllipse(0, 48, 112, 30);
    const body = [
      { x: -44, y: 18 },
      { x: 44,  y: 18 },
      { x: 44,  y: 54 },
      { x: -44, y: 54 },
    ];
    washFill(g, body, INK.sealRed, 0.92);
    inkOutline(g, body, INK.ink, 0.62, true, 12);
    const roof = [
      { x: -54, y: 18 },
      { x: 0,   y: -21 },
      { x: 54,  y: 18 },
    ];
    washFill(g, roof, INK_UI.goldLight, 0.94);
    inkOutline(g, roof, INK.inkSoft, 0.48, true, 17);
    g.fillStyle(INK.sealRedDark, 0.92);
    g.fillRect(-24, 26, 16, 24);
    g.fillRect(8,   26, 16, 24);
    g.fillStyle(INK_UI.goldLight, 0.92);
    for (let dx = -34; dx <= 34; dx += 17) {
      g.fillRect(dx, 10, 8, 10);
    }
    this.tweens.add({ targets: g, y: 268, duration: 2800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  private drawFogBands(): void {
    const clouds = [
      { x: 64,  y: 154, radius: 48, seed: 91,  alpha: 0.72 },
      { x: 306, y: 594, radius: 38, seed: 207, alpha: 0.58 },
      { x: 116, y: 736, radius: 42, seed: 332, alpha: 0.42 },
    ];
    for (const config of clouds) {
      const cloud = this.add.graphics();
      this.inkMap.drawCloud(cloud, config.x, config.y, config.radius, config.seed, config.alpha);
      this.tweens.add({
        targets: cloud,
        x: 16,
        duration: 9000 + config.x * 12,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }
  }

  private drawBronzeSeal(): void {
    const seal = this.add.graphics({ x: GAME_WIDTH / 2, y: 68 });
    seal.fillStyle(INK.sealRedDark, 0.94);
    seal.fillCircle(0, 0, 48);
    seal.lineStyle(5, INK_UI.gold, 0.92);
    seal.strokeCircle(0, 0, 48);
    seal.lineStyle(2, INK_UI.goldLight, 0.72);
    for (let index = 0; index < 16; index += 1) {
      const angle = (Math.PI * 2 * index) / 16;
      seal.lineBetween(
        Math.cos(angle) * 18, Math.sin(angle) * 18,
        Math.cos(angle) * 39, Math.sin(angle) * 39,
      );
    }
    seal.fillStyle(INK_UI.goldLight, 0.95);
    seal.fillCircle(0, 0, 9);
  }

  private render(): void {
    this.clearContent();
    this.renderTitle();
    if (this.mode === 'confirm-new') {
      this.renderConfirmNew();
    } else {
      this.renderMain();
    }
  }

  private renderTitle(): void {
    const shadow = this.ui.label(GAME_WIDTH / 2 + 2, 130, 'MANDATE', 'title', {
      color: '#301509',
      fontFamily: 'Georgia, Times New Roman, serif',
      fontSize: '36px',
      fontStyle: '700',
      align: 'center',
    }).setOrigin(0.5);
    const title = this.ui.label(GAME_WIDTH / 2, 127, 'MANDATE', 'title', {
      color: '#f3dd9a',
      fontFamily: 'Georgia, Times New Roman, serif',
      fontSize: '36px',
      fontStyle: '700',
      align: 'center',
    }).setOrigin(0.5);
    const subtitleShadow = this.ui.label(GAME_WIDTH / 2 + 1, 161, 'OF DAI VIET', 'title', {
      color: '#301509',
      fontFamily: 'Georgia, Times New Roman, serif',
      fontSize: '19px',
      fontStyle: '700',
    }).setOrigin(0.5);
    const subtitle = this.ui.label(GAME_WIDTH / 2, 159, 'OF DAI VIET', 'title', {
      color: '#fff6bd',
      fontFamily: 'Georgia, Times New Roman, serif',
      fontSize: '19px',
      fontStyle: '700',
    }).setOrigin(0.5);
    const rule = this.add.rectangle(GAME_WIDTH / 2, 184, 210, 2, INK_UI.gold, 0.88);
    this.content.push(shadow, title, subtitleShadow, subtitle, rule);
  }

  private renderMain(): void {
    const saved = hasSnapshot();
    const saveLabel = this.add.text(GAME_WIDTH / 2, 208, snapshotLabel(), {
      color: '#f3dd9a',
      fontSize: '12px',
      fontStyle: '700',
      align: 'center',
      backgroundColor: 'rgba(32,38,31,0.58)',
      padding: { x: 6, y: 3 },
      wordWrap: { width: 300 },
    }).setOrigin(0.5);
    this.content.push(saveLabel);

    this.content.push(this.ui.button({ x: 54, y: 586, width: 282, height: 54 }, 'Start Campaign', () => {
      if (hasSnapshot()) {
        this.mode = 'confirm-new';
        this.render();
        return;
      }
      this.startGame(createInitialGameState());
    }, { variant: 'primary', fontSize: '17px' }));

    this.content.push(this.ui.button({ x: 54, y: 654, width: 282, height: 52 }, 'Continue', () => {
      const snapshot = loadSnapshot();
      if (snapshot) {
        this.startGame(snapshot.state);
      }
    }, { variant: saved ? 'secondary' : 'disabled', fontSize: '17px' }));
  }

  private renderConfirmNew(): void {
    const panel = this.ui.card({ x: 28, y: 528, width: GAME_WIDTH - 56, height: 178 }, {
      title: 'Start a new campaign?',
      body: 'The saved snapshot remains until you save again.',
      border: INK_UI.gold,
      fill: 0xd9c584,
    });
    this.content.push(panel);

    this.content.push(this.ui.button({ x: 54, y: 632, width: 282, height: 46 }, 'Start New Campaign', () => {
      this.startGame(createInitialGameState());
    }, { variant: 'danger', fontSize: '14px' }));
    this.content.push(this.ui.button({ x: 54, y: 690, width: 282, height: 44 }, 'Back', () => {
      this.mode = 'main';
      this.render();
    }, { variant: 'secondary', fontSize: '14px' }));
  }

  private startGame(state: ReturnType<typeof createInitialGameState>): void {
    this.scene.start('MapScene', { state });
  }

  private clearContent(): void {
    for (const item of this.content) {
      item.destroy();
    }
    this.content = [];
  }
}

function createMenuRng(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}
