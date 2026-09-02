import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../game/constants';
import { applyRenderScale, designPointer } from '../game/graphicsQuality';
import { t } from '../i18n';
import { POWER_CARDS, findPowerCard } from '../data/ascentCards';
import {
  CABINET_DEEDS,
  cabinetProgress,
  canCombine,
  combineCard,
  combineCost,
  combinesReady,
  deedDone,
  getCabinet,
  openingHand,
  openingHandSlots,
  recordRubbingPack,
  revealRubbing,
  rubbingPackPrice,
  setOpeningHand,
  cabinetWeightMult,
  type RubbingReveal,
} from '../state/cabinet';
import { getLegacy, spendLegacyPoints } from '../state/legacy';
import { AMBITION_PER_POWER_CARD } from '../game/ascentConfig';
import { BACK_BAR_HEIGHT, InkUI, INK_UI, scrollGestureConsumedTap, type InkScrollArea } from '../ui/InkUI';
import { CARD_FACE_H, CARD_FACE_W, stampCardFace } from '../ui/cardFace';
import { createMapRenderer, type MapRenderer } from '../ui/MapRenderer';
import { applyPaperFX } from '../ui/ink/PaperFX';
import { attachPaperSheet } from '../ui/ink/paperSheet';
import { sawtoothBand } from '../ui/ink/devices';
import { TITLE_FONT, UI_FONT } from '../ui/fonts';
import type { AscentRarity } from '../state/types';

/**
 * Tàng Ấn Các — the Cabinet of Seals. The collection's home, beside the dynasty sheet.
 *
 * Three pages in one scene: the cabinet (rubbings, deeds, the opening hand, the grid of all
 * fifty seals, the forge), the combine ceremony for one seal, and the thác bản scratch reveal.
 * Built on the HistoryScene shape — header and back bar as fixed chrome above an
 * `InkScrollArea` — because that page already solved the two input traps this one would
 * otherwise refind: chrome must sit at a higher depth than scrolled rows (stencils clip pixels,
 * not hit areas), and taps inside the list must check `scrollGestureConsumedTap`.
 *
 * Every card face on this page is a stamped bake (`cardFace.ts`) — the grid is fifty quads,
 * not fifty live Graphics.
 */

const CHROME_DEPTH = 10;
/** Grid geometry: three faces a row, the mock's own proportions. */
const GRID_COLS = 3;
const PAD = 20;

/** The three forge recipes, derived from the card table so a new evolution appears by itself. */
function forgeRecipes(): { a: string; b: string; result: string }[] {
  const seen = new Set<string>();
  const recipes: { a: string; b: string; result: string }[] = [];
  for (const card of POWER_CARDS) {
    if (!card.evolvesWith || !card.evolvesInto || seen.has(card.evolvesInto)) continue;
    seen.add(card.evolvesInto);
    recipes.push({ a: card.id, b: card.evolvesWith, result: card.evolvesInto });
  }
  return recipes;
}

const RARITY_COLOR: Record<AscentRarity, number> = {
  bronze: 0x9c6b3f,
  silver: 0xa8adb4,
  gold: INK_UI.gold,
  jade: INK_UI.jade,
};

export class CabinetScene extends Phaser.Scene {
  private ui!: InkUI;
  private mapRenderer!: MapRenderer;
  private mode: 'cabinet' | 'combine' | 'rubbing' = 'cabinet';
  /** The seal the combine page is about. */
  private combineId?: string;
  /** The pull the scratch page is revealing — rolled once on entry, never re-rolled by render. */
  private reveal?: RubbingReveal;
  /** Cover strips still hiding the print, cleared under the pointer. */
  private coverStrips: Phaser.GameObjects.Graphics[] = [];
  private stripsLeft = 0;
  private revealDone = false;
  private resultRows: Phaser.GameObjects.GameObject[] = [];
  private content: Phaser.GameObjects.GameObject[] = [];
  private scroll?: InkScrollArea;
  /** Where the list should stand after the next re-render, so a tap does not throw the reader
   *  back to the top of a seventeen-row grid. */
  private pendingScroll = 0;

  constructor() {
    super('CabinetScene');
  }

  create(): void {
    applyRenderScale(this);
    applyPaperFX(this);
    attachPaperSheet(this);
    this.ui = new InkUI(this);
    this.mapRenderer = createMapRenderer(this);
    this.mapRenderer.drawBackground(GAME_WIDTH, GAME_HEIGHT).setDepth(-10);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.clear());
    this.cameras.main.fadeIn(190, 0xe9, 0xdf, 0xc2);
    this.mode = 'cabinet';
    this.render();
  }

  private clear(): void {
    this.tweens.killAll();
    this.time.removeAllEvents();
    this.scroll?.destroy();
    this.scroll = undefined;
    for (const item of this.content) item.destroy();
    this.content = [];
    this.coverStrips = [];
    this.resultRows = [];
  }

  private chrome<T extends Phaser.GameObjects.GameObject & { setDepth(value: number): T }>(object: T): T {
    this.content.push(object.setDepth(CHROME_DEPTH));
    return object;
  }

  private keep<T extends Phaser.GameObjects.GameObject>(object: T): T {
    this.content.push(object);
    return object;
  }

  private render(): void {
    this.clear();
    if (this.mode === 'combine' && this.combineId) {
      this.renderCombine(this.combineId);
      return;
    }
    if (this.mode === 'rubbing' && this.reveal) {
      this.renderRubbing(this.reveal);
      return;
    }
    this.mode = 'cabinet';
    this.renderCabinet();
  }

  // ── The cabinet page ──────────────────────────────────────────────────────

  private renderCabinet(): void {
    const progress = cabinetProgress();
    const store = getCabinet();

    // Header chrome: the name, and the two numbers that say how the hunt is going.
    const title = this.chrome(this.add.text(GAME_WIDTH / 2, 26, t('cabinet.title'), {
      color: '#2a2118', fontFamily: TITLE_FONT, fontSize: '24px', fontStyle: '700', align: 'center',
    }).setOrigin(0.5, 0));
    title.setLetterSpacing?.(2);
    this.chrome(this.ui.label(GAME_WIDTH / 2, 58,
      t('cabinet.subtitle', { found: progress.found, total: progress.total, ready: combinesReady() }),
      'caption', { fontSize: '11px', align: 'center' }).setOrigin(0.5, 0));

    const backY = GAME_HEIGHT - BACK_BAR_HEIGHT - 10;
    this.chrome(this.ui.backBar(backY, () => this.scene.start('MenuScene')));

    const listTop = 80;
    const scroll = this.ui.scrollArea({ x: 0, y: listTop, width: GAME_WIDTH, height: backY - listTop - 6 });
    this.scroll = scroll;
    const W = GAME_WIDTH - PAD * 2;
    let y = 4;

    // ── Rubbings and the rub button ─────────────────────────────────────────
    const rubH = 52;
    scroll.content.add(this.ui.panel({ x: PAD, y, width: W, height: rubH },
      { border: INK_UI.gold, borderWidth: 1.4, fillAlpha: 0.6 }));
    scroll.content.add(this.ui.label(PAD + 12, y + 9,
      store.rubbings > 0 ? t('cabinet.rubbings', { n: store.rubbings }) : t('cabinet.rubbingsNone'),
      'label', { fontSize: '13px' }));
    scroll.content.add(this.ui.label(PAD + 12, y + 30,
      t('cabinet.rub.pity', { n: store.rubbingPity }), 'caption', { fontSize: '9.5px' }));
    if (store.rubbings > 0) {
      scroll.content.add(this.ui.button(
        { x: PAD + W - 118, y: y + 8, width: 110, height: 36 },
        t('cabinet.rubOne'),
        () => {
          this.reveal = revealRubbing();
          if (!this.reveal) return;
          this.mode = 'rubbing';
          this.pendingScroll = 0;
          this.render();
        },
        { variant: 'primary', fontSize: '12px' },
      ));
    }
    y += rubH + 12;

    // ── The faucets: every way a rubbing is earned, on one page ─────────────
    y = this.sectionHeader(scroll, y, t('cabinet.faucets'));
    y = this.faucetRow(scroll, y, t('cabinet.faucet.run'), t('cabinet.deed.done'), INK_UI.gold);
    y = this.faucetRow(scroll, y, t('cabinet.faucet.wave'), '', INK_UI.gold);
    for (const deed of CABINET_DEEDS) {
      const done = deedDone(deed);
      y = this.faucetRow(scroll, y,
        t(`cabinet.deed.${deed}` as Parameters<typeof t>[0]),
        done ? t('cabinet.deed.done') : t('cabinet.deed.pending'),
        done ? INK_UI.jade : INK_UI.softBrush);
    }
    // The Legacy pack: the dead surplus finally has a job. The price climbs per purchase.
    const packCost = rubbingPackPrice();
    const legacy = getLegacy();
    const packH = 46;
    scroll.content.add(this.ui.panel({ x: PAD, y, width: W, height: packH },
      { border: INK_UI.softBrush, fillAlpha: 0.45 }));
    scroll.content.add(this.ui.label(PAD + 12, y + 7, t('cabinet.pack', { cost: packCost }), 'label',
      { fontSize: '12px' }));
    scroll.content.add(this.ui.label(PAD + 12, y + 26,
      legacy.points >= packCost ? t('cabinet.pack.note', { step: 40 }) : t('cabinet.pack.poor', { have: legacy.points }),
      'caption', { fontSize: '9px' }));
    if (legacy.points >= packCost) {
      scroll.content.add(this.ui.button(
        { x: PAD + W - 118, y: y + 6, width: 110, height: 32 },
        t('cabinet.pack.buy'),
        () => {
          if (!spendLegacyPoints(rubbingPackPrice())) return;
          recordRubbingPack();
          this.pendingScroll = 0;
          this.render();
        },
        { variant: 'secondary', fontSize: '10.5px' },
      ));
    }
    y += packH + 16;

    // ── The opening hand ────────────────────────────────────────────────────
    y = this.sectionHeader(scroll, y, t('cabinet.hand.title'));
    const handNote = this.ui.label(PAD, y, t('cabinet.hand.sub'), 'caption',
      { fontSize: '9.5px', wordWrap: { width: W } });
    scroll.content.add(handNote);
    y += handNote.height + 8;
    const hand = openingHand();
    const slots = openingHandSlots();
    const slotW = Math.floor((W - (3 - 1) * 8) / 3);
    const slotH = Math.round(slotW * (CARD_FACE_H / CARD_FACE_W));
    for (let i = 0; i < 3; i += 1) {
      const x = PAD + i * (slotW + 8);
      const locked = i >= slots;
      const cardId = hand[i];
      if (cardId) {
        const face = stampCardFace(this, cardId, { x, y, width: slotW, height: slotH });
        if (face) scroll.content.add(face);
        const tag = this.add.text(x + slotW / 2, y + slotH - 16, t('cabinet.hand.slotted'), {
          color: '#8a5f1c', fontFamily: UI_FONT, fontSize: '9px', fontStyle: '700',
          backgroundColor: 'rgba(243,230,196,0.85)', padding: { x: 4, y: 1 },
        }).setOrigin(0.5, 0);
        scroll.content.add(tag);
        this.gridTap(scroll, x, y, slotW, slotH, () => this.toggleHand(cardId));
      } else {
        const g = this.add.graphics();
        g.lineStyle(1.2, locked ? INK_UI.softBrush : INK_UI.brush, locked ? 0.4 : 0.6);
        this.dashedRect(g, x, y, slotW, slotH);
        scroll.content.add(g);
        scroll.content.add(this.ui.label(x + slotW / 2, y + slotH / 2 - 8,
          locked ? '🔒' : '+', 'label', { fontSize: '16px', align: 'center' }).setOrigin(0.5, 0));
        scroll.content.add(this.ui.label(x + 6, y + slotH - 30,
          locked ? t('cabinet.hand.locked') : t('cabinet.hand.empty'), 'caption',
          { fontSize: '8px', align: 'center', wordWrap: { width: slotW - 12 } }).setFixedSize(slotW - 12, 0));
      }
    }
    y += slotH + 8;
    const price = this.ui.label(PAD, y,
      hand.length > 0
        ? t('cabinet.hand.price', { n: hand.length * AMBITION_PER_POWER_CARD })
        : t('cabinet.hand.priceNone'),
      'caption', { fontSize: '10px', color: '#8a5f1c', wordWrap: { width: W } });
    scroll.content.add(price);
    y += price.height + 16;

    // ── The seals ───────────────────────────────────────────────────────────
    y = this.sectionHeader(scroll, y, t('cabinet.grid.title'));
    const hint = this.ui.label(PAD, y, t('cabinet.grid.hint'), 'caption',
      { fontSize: '9px', wordWrap: { width: W } });
    scroll.content.add(hint);
    y += hint.height + 8;

    const cellW = Math.floor((W - (GRID_COLS - 1) * 8) / GRID_COLS);
    const cellH = Math.round(cellW * (CARD_FACE_H / CARD_FACE_W));
    POWER_CARDS.forEach((card, index) => {
      const col = index % GRID_COLS;
      const row = Math.floor(index / GRID_COLS);
      const x = PAD + col * (cellW + 8);
      const cy = y + row * (cellH + 10);
      const held = store.cards[card.id];
      if (held) {
        const face = stampCardFace(this, card.id, { x, y: cy, width: cellW, height: cellH });
        if (face) scroll.content.add(face);
        // Copies and the combine flag ride the face's foot, on their own paper so they read
        // over any ink under them.
        const ready = canCombine(card.id);
        const badge = this.add.text(x + cellW - 4, cy + 4,
          `${t('cabinet.copies', { n: held.copies })}${ready ? ' ⇧' : ''}`, {
            color: ready ? '#8a5f1c' : '#6f6250', fontFamily: UI_FONT, fontSize: '9px', fontStyle: '700',
            backgroundColor: 'rgba(243,230,196,0.85)', padding: { x: 3, y: 1 },
          }).setOrigin(1, 0);
        scroll.content.add(badge);
        if (hand.includes(card.id)) {
          const tag = this.add.text(x + 4, cy + 4, t('cabinet.hand.slotted'), {
            color: '#4a6a55', fontFamily: UI_FONT, fontSize: '8px', fontStyle: '700',
            backgroundColor: 'rgba(243,230,196,0.85)', padding: { x: 3, y: 1 },
          });
          scroll.content.add(tag);
        }
        this.gridTap(scroll, x, cy, cellW, cellH, () => {
          if (canCombine(card.id)) {
            this.combineId = card.id;
            this.mode = 'combine';
            this.render();
          } else {
            this.toggleHand(card.id);
          }
        });
      } else {
        // The visible hunt: a dashed silhouette wearing only its rarity — and every one of
        // these is still draftable in a run. Ownership never gates the pool.
        const g = this.add.graphics();
        g.lineStyle(1.2, RARITY_COLOR[card.rarity], 0.55);
        this.dashedRect(g, x, cy, cellW, cellH);
        scroll.content.add(g);
        scroll.content.add(this.ui.label(x + cellW / 2, cy + cellH / 2 - 16, '?', 'label',
          { fontSize: '22px', align: 'center', color: '#8b7a5e' }).setOrigin(0.5, 0));
        scroll.content.add(this.ui.label(x + 6, cy + cellH - 34,
          `${t(`ascent.rarity.${card.rarity}` as Parameters<typeof t>[0])}
${t('cabinet.grid.unfound')}`,
          'caption', { fontSize: '8px', align: 'center' }).setFixedSize(cellW - 12, 0));
      }
    });
    y += Math.ceil(POWER_CARDS.length / GRID_COLS) * (cellH + 10) + 8;

    // ── The forge ───────────────────────────────────────────────────────────
    y = this.sectionHeader(scroll, y, t('cabinet.forge.title'));
    for (const recipe of forgeRecipes()) {
      const learned = store.learnedRecipes.includes(recipe.result);
      const name = (id: string, show: boolean): string => (show
        ? t(`ascent.card.${id}` as Parameters<typeof t>[0])
        : t('cabinet.forge.hidden'));
      // An unlearned recipe shows only the parents the cabinet has already found — the forge is
      // the collection's slow hunt, and a fully-spelled recipe is a hunt already over.
      const line = t('cabinet.forge.row', {
        a: name(recipe.a, learned || Boolean(store.cards[recipe.a])),
        b: name(recipe.b, learned || Boolean(store.cards[recipe.b])),
        result: name(recipe.result, learned),
      });
      const rowH = 44;
      scroll.content.add(this.ui.panel({ x: PAD, y, width: W, height: rowH },
        { border: learned ? INK_UI.jade : INK_UI.softBrush, fillAlpha: learned ? 0.55 : 0.32 }));
      scroll.content.add(this.ui.label(PAD + 12, y + 7, line, 'label',
        { fontSize: '11px', wordWrap: { width: W - 24 } }));
      scroll.content.add(this.ui.label(PAD + 12, y + 26,
        learned ? t('cabinet.forge.learned') : t('cabinet.forge.hint'), 'caption',
        { fontSize: '8.5px', wordWrap: { width: W - 24 } }));
      y += rowH + 8;
    }
    y += 14;

    scroll.setContentHeight(y);
    scroll.setScroll(this.pendingScroll);
  }

  private sectionHeader(scroll: InkScrollArea, y: number, text: string): number {
    const label = this.ui.label(PAD, y, text, 'caption', { fontSize: '10px' });
    scroll.content.add(label);
    const band = this.add.graphics();
    sawtoothBand(band, PAD, y + 16, GAME_WIDTH - PAD * 2, 5, 0.4);
    scroll.content.add(band);
    return y + 26;
  }

  private faucetRow(scroll: InkScrollArea, y: number, label: string, status: string, accent: number): number {
    const W = GAME_WIDTH - PAD * 2;
    const H = 30;
    scroll.content.add(this.ui.panel({ x: PAD, y, width: W, height: H },
      { border: INK_UI.softBrush, fillAlpha: 0.35 }));
    const edge = this.add.graphics();
    edge.fillStyle(accent, 0.9);
    edge.fillRect(PAD + 1.5, y + 4, 2.5, H - 8);
    scroll.content.add(edge);
    scroll.content.add(this.ui.label(PAD + 12, y + 8, label, 'caption', { fontSize: '10px' }));
    if (status) {
      scroll.content.add(this.ui.label(PAD + W - 10, y + 8, status, 'caption',
        { fontSize: '9px', align: 'right' }).setOrigin(1, 0));
    }
    return y + H + 6;
  }

  /** A tap target inside the scroll area that respects the drag gesture. */
  private gridTap(scroll: InkScrollArea, x: number, y: number, w: number, h: number, onTap: () => void): void {
    const zone = this.add.zone(x, y, w, h).setOrigin(0, 0).setInteractive({ useHandCursor: true });
    zone.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (scrollGestureConsumedTap(pointer)) return;
      onTap();
    });
    scroll.content.add(zone);
  }

  /** Slots a seal into the opening hand, or takes it back out. */
  private toggleHand(cardId: string): void {
    const hand = openingHand();
    if (hand.includes(cardId)) {
      setOpeningHand(hand.filter((id) => id !== cardId));
    } else if (hand.length < openingHandSlots()) {
      setOpeningHand([...hand, cardId]);
    } else {
      return;
    }
    this.pendingScroll = this.scroll ? -this.scroll.content.y : 0;
    this.render();
  }

  // ── The combine ceremony ──────────────────────────────────────────────────

  private renderCombine(cardId: string): void {
    const card = findPowerCard(cardId);
    const held = getCabinet().cards[cardId];
    // The page only makes sense standing on a combinable seal — the ⇧ tap is the only door in,
    // but a stale re-render after the combine itself must fall back rather than draw a lie.
    if (!card || !held || !canCombine(cardId)) {
      this.mode = 'cabinet';
      this.render();
      return;
    }
    const cost = combineCost(held.level);
    const nextLevel = (held.level + 1) as 2 | 3;
    const name = t(`ascent.card.${cardId}` as Parameters<typeof t>[0]);

    const title = this.chrome(this.add.text(GAME_WIDTH / 2, 26, t('cabinet.combine.title'), {
      color: '#2a2118', fontFamily: TITLE_FONT, fontSize: '22px', fontStyle: '700', align: 'center',
    }).setOrigin(0.5, 0));
    title.setLetterSpacing?.(2);
    this.chrome(this.ui.label(GAME_WIDTH / 2, 56,
      t('cabinet.combine.sub', { name, n: held.copies }), 'caption',
      { fontSize: '11px', align: 'center' }).setOrigin(0.5, 0));

    // The parents, small, plus-signed across the sheet; the child large under the arrow. Sized
    // to the sheet: a ×5 combine at the ×3 card size ran 94 units off both edges.
    const GAP = cost >= 5 ? 16 : 26;
    const smallW = Math.min(76, Math.floor((GAME_WIDTH - 24 - (cost - 1) * GAP) / cost));
    const smallH = Math.round(smallW * (CARD_FACE_H / CARD_FACE_W));
    const rowW = cost * smallW + (cost - 1) * GAP;
    const startX = Math.round((GAME_WIDTH - rowW) / 2);
    let cy = 86;
    for (let i = 0; i < cost; i += 1) {
      const x = startX + i * (smallW + GAP);
      const face = stampCardFace(this, cardId, { x, y: cy, width: smallW, height: smallH }, held.level);
      if (face) this.keep(face);
      if (i > 0) {
        this.keep(this.ui.label(x - Math.round(GAP / 2), cy + smallH / 2 - 10, '+', 'label',
          { fontSize: '16px' }).setOrigin(0.5, 0));
      }
    }
    cy += smallH + 6;
    this.keep(this.ui.label(GAME_WIDTH / 2, cy, '▼', 'label',
      { fontSize: '14px', align: 'center' }).setOrigin(0.5, 0));
    cy += 22;
    const bigW = 128;
    const bigH = Math.round(bigW * (CARD_FACE_H / CARD_FACE_W));
    const big = stampCardFace(this, cardId, {
      x: (GAME_WIDTH - bigW) / 2, y: cy, width: bigW, height: bigH,
    }, nextLevel);
    if (big) {
      this.keep(big);
      big.setAlpha(0.4);
      this.tweens.add({ targets: big, alpha: 1, scale: big.scale * 1.04, duration: 420, ease: 'Quad.easeOut', yoyo: false });
    }
    cy += bigH + 12;

    // What the level buys, said in the card's own numbers: the deepened per-stack line and the
    // steep draft-weight step.
    const before = t(`ascent.card.${cardId}.d` as Parameters<typeof t>[0],
      card.levels[held.level - 1].display);
    const after = t(`ascent.card.${cardId}.d` as Parameters<typeof t>[0],
      card.levels[Math.min(nextLevel - 1, card.levels.length - 1)].display);
    const W = GAME_WIDTH - PAD * 2;
    const effect = this.ui.label(PAD, cy,
      t('cabinet.combine.effect', { before, after }), 'caption',
      { fontSize: '10.5px', color: '#8a5f1c', wordWrap: { width: W } });
    this.keep(effect);
    cy += effect.height + 6;
    this.keep(this.ui.label(PAD, cy,
      t('cabinet.combine.result', { level: nextLevel, mult: cabinetWeightMult(nextLevel) }),
      'caption', { fontSize: '10.5px', wordWrap: { width: W } }));
    cy += 20;
    this.keep(this.ui.label(PAD, cy, t('cabinet.combine.note'), 'caption',
      { fontSize: '9.5px', color: '#6f6250', wordWrap: { width: W } }));

    const backY = GAME_HEIGHT - BACK_BAR_HEIGHT - 10;
    this.chrome(this.ui.button(
      { x: PAD, y: backY - 54, width: W, height: 44 },
      t('cabinet.combine.action', { n: cost }),
      () => {
        if (combineCard(cardId)) {
          this.mode = 'cabinet';
          this.render();
        }
      },
      { variant: 'primary', fontSize: '14px' },
    ));
    this.chrome(this.ui.backBar(backY, () => {
      this.mode = 'cabinet';
      this.render();
    }));
  }

  // ── The thác bản scratch reveal ───────────────────────────────────────────

  /**
   * The reveal *is* the reward moment: the print sits whole under an ink cover, and the cover
   * lifts strip by strip along the pointer. The cover is opaque paint *over* the stamped face
   * and is simply deleted where the thumb passes — no masks (Phaser 4 masks are no-ops under
   * WebGL, the clip-rect-stencil finding) and no per-frame Graphics redraw: each strip is drawn
   * once and only ever tweened out.
   */
  private renderRubbing(reveal: RubbingReveal): void {
    this.revealDone = false;
    const title = this.chrome(this.add.text(GAME_WIDTH / 2, 26, t('cabinet.rub.title'), {
      color: '#2a2118', fontFamily: TITLE_FONT, fontSize: '22px', fontStyle: '700', align: 'center',
    }).setOrigin(0.5, 0));
    title.setLetterSpacing?.(2);
    this.chrome(this.ui.label(GAME_WIDTH / 2, 56,
      reveal.remaining > 0 ? t('cabinet.rub.sub', { n: reveal.remaining }) : t('cabinet.rub.subLast'),
      'caption', { fontSize: '11px', align: 'center' }).setOrigin(0.5, 0));

    const cardW = 168;
    const cardH = Math.round(cardW * (CARD_FACE_H / CARD_FACE_W));
    const cardX = Math.round((GAME_WIDTH - cardW) / 2);
    const cardY = 92;
    // The card is revealed at the level it now holds in the cabinet, so a copy that completed a
    // combine-ready set is seen wearing the state it just reached.
    const face = stampCardFace(this, reveal.cardId, { x: cardX, y: cardY, width: cardW, height: cardH }, reveal.level);
    if (face) this.keep(face);

    // The ink cover: horizontal strips, each cleared once when the pointer crosses it.
    const STRIPS = 14;
    const stripH = Math.ceil(cardH / STRIPS);
    this.coverStrips = [];
    this.stripsLeft = STRIPS;
    for (let i = 0; i < STRIPS; i += 1) {
      const strip = this.add.graphics();
      // The woodblock's own hatch, not flat paint — the thing under the thumb is a print.
      strip.fillStyle(0x4a3b28, 0.96);
      strip.fillRect(cardX - 3, cardY + i * stripH, cardW + 6, Math.min(stripH, cardH - i * stripH) + 1);
      strip.fillStyle(0x2a2118, 0.5);
      for (let x = cardX - 3; x < cardX + cardW + 3; x += 9) {
        strip.fillRect(x, cardY + i * stripH, 4, Math.min(stripH, cardH - i * stripH) + 1);
      }
      strip.setData('cleared', false);
      this.keep(strip);
      this.coverStrips.push(strip);
    }

    const hint = this.keep(this.ui.label(GAME_WIDTH / 2, cardY + cardH + 10, t('cabinet.rub.hint'),
      'caption', { fontSize: '10px', align: 'center' }).setOrigin(0.5, 0));

    // Pity, printed under the card the way the mock has it — the counter as it stood before
    // this pull, which is the number that explains what just happened.
    this.keep(this.ui.label(GAME_WIDTH / 2, cardY + cardH + 28,
      reveal.pityUsed ? t('cabinet.rub.pityUsed') : t('cabinet.rub.pity', { n: getCabinet().rubbingPity }),
      'caption', { fontSize: '9.5px', align: 'center', color: '#8a5f1c' }).setOrigin(0.5, 0));

    // The rub: pointer movement over the card clears the strip under it and its neighbours.
    const onMove = (pointer: Phaser.Input.Pointer): void => {
      if (this.revealDone || !pointer.isDown) return;
      const at = designPointer(pointer);
      if (at.x < cardX - 8 || at.x > cardX + cardW + 8) return;
      const index = Math.floor((at.y - cardY) / stripH);
      for (const i of [index - 1, index, index + 1]) {
        if (i < 0 || i >= this.coverStrips.length) continue;
        const strip = this.coverStrips[i];
        if (strip.getData('cleared')) continue;
        strip.setData('cleared', true);
        this.stripsLeft -= 1;
        this.tweens.add({ targets: strip, alpha: 0, duration: 260, ease: 'Quad.easeOut' });
      }
      if (this.stripsLeft <= Math.ceil(STRIPS * 0.25)) this.finishReveal(reveal, hint as Phaser.GameObjects.Text, cardY + cardH);
    };
    this.input.on('pointermove', onMove);
    this.input.on('pointerdown', onMove);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.off('pointermove', onMove);
      this.input.off('pointerdown', onMove);
    });

    const backY = GAME_HEIGHT - BACK_BAR_HEIGHT - 10;
    this.chrome(this.ui.backBar(backY, () => {
      this.input.off('pointermove', onMove);
      this.input.off('pointerdown', onMove);
      this.mode = 'cabinet';
      this.reveal = undefined;
      this.render();
    }));
  }

  /** The last quarter falls away on its own — nobody should have to scrub the corners. */
  private finishReveal(reveal: RubbingReveal, hint: Phaser.GameObjects.Text, underY: number): void {
    if (this.revealDone) return;
    this.revealDone = true;
    for (const strip of this.coverStrips) {
      if (!strip.getData('cleared')) {
        this.tweens.add({ targets: strip, alpha: 0, duration: 420, ease: 'Quad.easeOut' });
      }
    }
    hint.setText('');

    const outcome = reveal.outcome === 'new'
      ? t('cabinet.rub.new')
      : reveal.outcome === 'melted'
        ? t('cabinet.rub.melted', { n: reveal.meltedLegacy })
        : reveal.outcome === 'ready'
          ? t('cabinet.rub.ready', { n: reveal.copies })
          : t('cabinet.rub.copy', { n: reveal.copies, need: combineCost(reveal.level) });
    const line = this.keep(this.ui.label(GAME_WIDTH / 2, underY + 10, outcome, 'label', {
      fontSize: '13px', align: 'center', color: reveal.outcome === 'new' ? '#8a5f1c' : undefined,
    }).setOrigin(0.5, 0));
    line.setAlpha(0);
    this.tweens.add({ targets: line, alpha: 1, duration: 300 });

    const backY = GAME_HEIGHT - BACK_BAR_HEIGHT - 10;
    if (reveal.remaining > 0) {
      this.chrome(this.ui.button(
        { x: PAD, y: backY - 54, width: GAME_WIDTH - PAD * 2, height: 44 },
        t('cabinet.rub.again'),
        () => {
          this.reveal = revealRubbing();
          if (!this.reveal) {
            this.mode = 'cabinet';
          }
          this.render();
        },
        { variant: 'primary', fontSize: '13px' },
      ));
    }
  }

  private dashedRect(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number): void {
    const DASH = 6;
    const step = DASH * 2;
    for (let dx = 0; dx < w; dx += step) {
      g.lineBetween(x + dx, y, x + Math.min(dx + DASH, w), y);
      g.lineBetween(x + dx, y + h, x + Math.min(dx + DASH, w), y + h);
    }
    for (let dy = 0; dy < h; dy += step) {
      g.lineBetween(x, y + dy, x, y + Math.min(dy + DASH, h));
      g.lineBetween(x + w, y + dy, x + w, y + Math.min(dy + DASH, h));
    }
  }
}
