import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../game/constants';
import { createInitialGameState } from '../state/GameState';
import { hasSnapshot, loadSnapshot, snapshotLabel } from '../state/save';
import { getLanguage, setLanguage, t, type LanguageCode } from '../i18n';
import { InkMapItemRenderer } from '../ui/MapItemRenderer';
import { decorateForest, decorateRiceFields, decorateWater, InkMapRenderer } from '../ui/MapRenderer';
import { InkUI, INK_UI } from '../ui/InkUI';
import { INK, brushStroke, inkOutline, shade, washFill, waveLine } from '../ui/inkTheme';
import { TITLE_FONT, UI_FONT } from '../ui/fonts';

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
    this.drawArmies();
    this.drawFogBands();
    this.drawDaiVietLotusSeal();
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
      { x: 194, y: 318 },
      { x: 200, y: 226 },
    ];
    brushStroke(river, riverPoints, 26, INK.seaDeep, 0.54, 87);
    brushStroke(river, riverPoints, 18,  INK.waterLine, 0.46, 91);
    const rng = createMenuRng(91);
    for (const point of riverPoints) {
      decorateWater(river, point, 44, rng);
    }
    for (let index = 0; index < 6; index += 1) {
      waveLine(river, 26 + index * 28, 816 - index * 96, 72 + index * 26, 806 - index * 96, 3, 5, INK.waterLine, 0.20);
    }
  }

  /** Two opposing armies facing each other across the river. */
  private drawArmies(): void {
    const g = this.add.graphics();

    // Right bank – Dai Viet (player), all same red with same flag
    const rightFormations = [
      { cx: 270, cy: 368, cols: 5, rows: 3 },
      { cx: 322, cy: 446, cols: 4, rows: 3 },
      { cx: 264, cy: 520, cols: 4, rows: 2 },
    ];
    for (const { cx, cy, cols, rows } of rightFormations) {
      this.drawSoldiers(g, cx, cy, INK.sealRed, cols, rows);
      const totalW = (cols - 1) * 11;
      const totalH = (rows - 1) * 11;
      const flag = this.inkItems.createPlayerLandFlag(false, this.previewFlagSeed);
      flag.setPosition(cx + totalW / 2 + 14, cy + totalH / 2 + 4);
    }

    // Left bank – enemy army, all same dark olive with same flag
    const leftFormations = [
      { cx: 98,  cy: 368, cols: 4, rows: 3 },
      { cx: 60,  cy: 446, cols: 5, rows: 3 },
      { cx: 96,  cy: 518, cols: 4, rows: 2 },
    ];
    const enemySeed = this.previewFlagSeed + 777;
    for (const { cx, cy, cols, rows } of leftFormations) {
      this.drawSoldiers(g, cx, cy, 0x4e3820, cols, rows);
      const totalW = (cols - 1) * 11;
      const totalH = (rows - 1) * 11;
      const flag = this.inkItems.createPlayerLandFlag(false, enemySeed);
      flag.setPosition(cx - totalW / 2 - 14, cy + totalH / 2 + 4);
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

  private drawDaiVietLotusSeal(): void {
    const seal = this.add.graphics({ x: GAME_WIDTH / 2, y: 68 });
    seal.fillStyle(INK.sealRedDark, 0.94);
    seal.fillCircle(0, 0, 48);
    seal.lineStyle(5, INK_UI.gold, 0.92);
    seal.strokeCircle(0, 0, 48);

    seal.fillStyle(shade(INK.sealRedDark, 0.72), 0.34);
    seal.fillCircle(0, 0, 36);
    seal.lineStyle(1.4, INK_UI.goldLight, 0.48);
    seal.strokeCircle(0, 0, 34);

    seal.lineStyle(2.2, INK_UI.gold, 0.78);
    seal.strokeRoundedRect(-25, -25, 50, 50, 8);

    seal.lineStyle(3.4, 0x4d2c16, 0.30);
    seal.lineBetween(0, 20, 0, 1);
    seal.lineStyle(2.1, INK_UI.goldLight, 0.94);
    seal.lineBetween(0, 20, 0, 1);

    seal.fillStyle(INK_UI.goldLight, 0.96);
    seal.fillEllipse(0, -4, 13, 34);
    seal.fillEllipse(-13, 1, 16, 29);
    seal.fillEllipse(13, 1, 16, 29);
    seal.fillEllipse(-24, 8, 19, 20);
    seal.fillEllipse(24, 8, 19, 20);

    seal.fillStyle(INK_UI.gold, 0.98);
    seal.fillEllipse(0, 13, 46, 13);
    seal.fillEllipse(-14, 19, 22, 9);
    seal.fillEllipse(14, 19, 22, 9);

    seal.lineStyle(1.2, 0x4d2c16, 0.45);
    seal.lineBetween(0, -18, 0, 14);
    seal.lineBetween(-11, -11, -3, 14);
    seal.lineBetween(11, -11, 3, 14);
    seal.lineBetween(-24, 6, -6, 17);
    seal.lineBetween(24, 6, 6, 17);

    seal.fillStyle(INK_UI.goldLight, 0.94);
    seal.fillCircle(0, -17, 3.2);
  }

  private render(): void {
    this.clearContent();
    this.renderTitle();
    this.renderLanguageSelector();
    if (this.mode === 'confirm-new') {
      this.renderConfirmNew();
    } else {
      this.renderMain();
    }
  }

  private renderTitle(): void {
    const shadow = this.ui.label(GAME_WIDTH / 2 + 2, 130, 'MANDATE', 'title', {
      color: '#301509',
      fontFamily: TITLE_FONT,
      fontSize: '36px',
      fontStyle: '700',
      align: 'center',
    }).setOrigin(0.5);
    const title = this.ui.label(GAME_WIDTH / 2, 127, 'MANDATE', 'title', {
      color: '#f3dd9a',
      fontFamily: TITLE_FONT,
      fontSize: '36px',
      fontStyle: '700',
      align: 'center',
    }).setOrigin(0.5);
    const subtitleShadow = this.ui.label(GAME_WIDTH / 2 + 1, 161, 'OF DAI VIET', 'title', {
      color: '#301509',
      fontFamily: TITLE_FONT,
      fontSize: '19px',
      fontStyle: '700',
    }).setOrigin(0.5);
    const subtitle = this.ui.label(GAME_WIDTH / 2, 159, 'OF DAI VIET', 'title', {
      color: '#fff6bd',
      fontFamily: TITLE_FONT,
      fontSize: '19px',
      fontStyle: '700',
    }).setOrigin(0.5);
    const rule = this.add.rectangle(GAME_WIDTH / 2, 184, 210, 2, INK_UI.gold, 0.88);
    this.content.push(shadow, title, subtitleShadow, subtitle, rule);
  }

  private renderMain(): void {
    const saved = hasSnapshot();
    this.content.push(this.ui.button({ x: 54, y: 548, width: 282, height: 54 }, t('menu.startCampaign'), () => {
      this.scene.start('CampaignScene');
    }, { variant: 'primary', fontSize: '17px' }));

    this.content.push(this.ui.button({ x: 90, y: 618, width: 210, height: 40 }, t('menu.quickBattle'), () => {
      if (hasSnapshot()) {
        this.mode = 'confirm-new';
        this.render();
        return;
      }
      this.startGame(createInitialGameState());
    }, { variant: 'ghost', fontSize: '14px' }));

    this.content.push(this.ui.button({ x: 90, y: 674, width: 210, height: 42 }, t('menu.continue'), () => {
      const snapshot = loadSnapshot();
      if (snapshot) {
        this.startGame(snapshot.state);
      }
    }, { variant: saved ? 'ghost' : 'disabled', fontSize: '15px' }));

    const saveLabel = this.add.text(GAME_WIDTH / 2, 730, snapshotLabel(), {
      color: saved ? '#f3dd9a' : '#d8c48e',
      fontFamily: UI_FONT,
      fontSize: '12px',
      fontStyle: '700',
      align: 'center',
      backgroundColor: 'rgba(32,38,31,0.42)',
      padding: { x: 6, y: 3 },
      wordWrap: { width: 250 },
    }).setOrigin(0.5);
    this.content.push(saveLabel);
  }

  private renderConfirmNew(): void {
    const panel = this.ui.card({ x: 28, y: 528, width: GAME_WIDTH - 56, height: 178 }, {
      title: t('menu.startNewQuestion'),
      body: t('menu.savedSnapshotKept'),
      border: INK_UI.gold,
      fill: 0xd9c584,
    });
    this.content.push(panel);

    this.content.push(this.ui.button({ x: 54, y: 632, width: 282, height: 46 }, t('menu.startNewCampaign'), () => {
      this.startGame(createInitialGameState());
      // Note: full campaign setup is via "Start Campaign" → CampaignScene
    }, { variant: 'danger', fontSize: '14px' }));
    this.content.push(this.ui.button({ x: 54, y: 690, width: 282, height: 44 }, t('menu.back'), () => {
      this.mode = 'main';
      this.render();
    }, { variant: 'secondary', fontSize: '14px' }));
  }

  private renderLanguageSelector(): void {
    const current = getLanguage();

    const options: Array<{
      code: LanguageCode;
      label: string;
      flag: string;
    }> = [
      {
        code: 'en',
        label: 'English',
        flag: '',
      },
      {
        code: 'vi',
        label: 'Tiếng Việt',
        flag: '',
      },
    ];

    const itemWidth = 105;
    const itemHeight = 30;
    const width = itemWidth * options.length;

    const x = GAME_WIDTH / 2 - width / 2;
    const y = GAME_HEIGHT - 40;

    const bg = this.add
      .rectangle(x, y, width, itemHeight, INK_UI.parchment, 0.88)
      .setOrigin(0, 0);

    bg.setStrokeStyle(2, INK_UI.brush, 0.78);
    this.content.push(bg);

    options.forEach((option, index) => {
      const selected = current === option.code;
      const left = x + index * itemWidth;

      const fill = this.add
        .rectangle(
          left + 1,
          y + 1,
          itemWidth - 2,
          itemHeight - 2,
          selected ? INK_UI.goldLight : INK_UI.parchment,
          selected ? 0.98 : 0.2,
        )
        .setOrigin(0, 0)
        .setInteractive({ useHandCursor: true });

      const label = this.ui
        .label(
          left + itemWidth / 2,
          y + 7,
          `${option.flag} ${option.label}`,
          'button',
          {
            color: '#211103',
            fontSize: '12px',
            align: 'center',
          },
        )
        .setOrigin(0.5, 0);

      fill.on('pointerup', () => {
        setLanguage(option.code);
        this.render();
      });

      this.content.push(fill, label);
    });
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
