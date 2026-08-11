import Phaser from 'phaser';
import { ACTION_BAR_HEIGHT, GAME_HEIGHT, GAME_WIDTH, HEADER_HEIGHT, PLAYER_KINGDOM_ID } from '../game/constants';
import { codexProgress, getCodex, isHeroUnlocked } from '../state/codex';
import { LEGACY_PERKS, ownsPerk } from '../state/legacy';
import { heroTemplates } from '../data/heroes';
import { powerCardView, skipRefundAmount } from '../systems/ascent/PowerDraftSystem';
import { tierForHero } from '../systems/ascent/SummonSystem';
import { responseCommanderName } from '../systems/ascent/WaveDirector';
import { buildConquestTargets, refreshAscentLaneState } from '../systems/ascent/ConquestSystem';
import { lawCardView, seatedEffectSummary } from '../systems/ascent/CourtLaneSystem';
import { envoyOptionDetail } from '../systems/ascent/EnvoySystem';
import { realmStanding } from '../systems/ascent/RivalDirector';
import { TRIBUTE_REFUSE_TICKS } from '../game/ascentConfig';
import { ALL_COURT_POSITIONS, getCourtPositionLabel } from '../systems/CourtSystem';
import { ascentArmyUpkeep, buildDistrictBuilding, getBuildOptions, getPlayerTroops, getUpgradeOptions, upgradeDistrictBuilding } from '../systems/ResourceSystem';
import { findFreeCommander } from '../systems/ascent/AutopilotSystem';
import { MIN_ARMY_SOLDIERS, RECRUIT_HUMAN_RESERVE, recruitSoldiers } from '../game/ascentConfig';
import { eraLabel } from '../systems/empire/MandateSystem';
import { getEmpirePower, hasPact } from '../systems/DiplomacySystem';
import { renderHeroFaceInBox } from '../ui/FaceRenderer';
import { INK_UI, INK_UI_HEX, InkUI, type InkScrollArea, type UIBounds } from '../ui/InkUI';
import { createMapItemRenderer, type MapItemRenderer } from '../ui/MapItemRenderer';
import { CARD_ICON_SIZE, drawCardIcon, iconForOption, type CardIconId } from '../ui/CardIcons';
import { ASCENT_HUD_HEIGHT, AscentHud } from '../ui/ascent/AscentHud';
import { ActionBar } from '../ui/ActionBar';
import { ResourceBar } from '../ui/ResourceBar';
import { staggerIn } from '../ui/animations';
import { TITLE_FONT, UI_FONT } from '../ui/fonts';
import {
  buildingLabel,
  formatResourceList,
  heroName,
  heroTypeLabel,
  politicsChoiceDescription,
  politicsChoiceLabel,
  politicsDescription,
  politicsTitle,
  rarityLabel,
  t,
} from '../i18n';
import type {
  AscentConquestMethod,
  AscentLane,
  AscentLaneStatus,
  AscentPrompt,
  AscentRarity,
  CourtPositionId,
  ConquestMethodOption,
  ConquestTarget,
  GameState,
  Hero,
} from '../state/types';

/** The three map controls stacked at the right edge, matching the classic modes. */
type MapControlIcon = 'zoom-in' | 'zoom-out' | 'mode';

/** Portrait column on hero cards: below the rarity badge, inset from the right edge. */
const PORTRAIT_W = 74;
const PORTRAIT_TOP = 30;

/** Rarity → frame colour. The one visual language shared by draft cards and summons. */
const RARITY_COLOR: Record<AscentRarity, number> = {
  bronze: 0x9c6b3f,
  silver: 0xa8adb4,
  gold: INK_UI.gold,
  jade: INK_UI.jade,
};

/**
 * Dragon Ascent's HUD scene.
 *
 * Written fresh rather than extending `UIScene`: that scene is 3,000 lines built around
 * twenty modals this mode never opens, and its pointer handler hit-tests hardcoded pixel
 * rectangles belonging to the classic screens — inheriting it would mean inheriting a large
 * dormant tap surface that silently swallows presses meant for this HUD. What is reused is
 * the component library (InkUI, ResourceBar, animations, hero portraits), which is where the
 * actual visual work lives.
 *
 * Decisions arrive as full-screen prompt cards, and the standing `ActionBar` at the bottom —
 * the same component the classic modes use — is how the player reaches those same systems on
 * their own initiative. The cards set the rhythm; the bar means you are never stuck waiting
 * for one.
 */
export class ConquestUIScene extends Phaser.Scene {
  private state!: GameState;
  private ui!: InkUI;
  private hud!: AscentHud;
  private resourceBar!: ResourceBar;
  private modalLayer!: Phaser.GameObjects.Container;
  private actionBar!: ActionBar;
  private inspectObjects: Phaser.GameObjects.GameObject[] = [];
  private mapControlObjects: Phaser.GameObjects.GameObject[] = [];
  /** Scroll areas register a global wheel handler, so they must be destroyed explicitly. */
  private activeScrollAreas: InkScrollArea[] = [];
  private openPromptKey = '';
  private lanePauseBeforeOpen = false;

  constructor() {
    super('ConquestUIScene');
  }

  init(data: { state: GameState }): void {
    this.state = data.state;
    this.inspectObjects = [];
    this.mapControlObjects = [];
    this.activeScrollAreas = [];
    this.openPromptKey = '';
    this.lanePauseBeforeOpen = false;
  }

  create(): void {
    this.ui = new InkUI(this);
    this.resourceBar = new ResourceBar(this, this.state);
    this.add.existing(this.resourceBar);
    this.resourceBar.setDepth(80);

    this.hud = new AscentHud(this);

    // Built once and refreshed in place. Rebuilding it every tick would churn a dozen game
    // objects a second for a bar whose labels change only when the run's state does.
    this.actionBar = new ActionBar(this, this.state, (action) => this.handleBarAction(action));
    this.actionBar.statusColor = (action) => this.barStatusColor(action);
    this.actionBar.refresh();

    this.modalLayer = this.add.container(0, 0).setDepth(500);

    this.events.on('state-changed', () => this.refresh());
    this.refresh();
  }

  // ── Frame ─────────────────────────────────────────────────────────────────

  refresh(): void {
    if (!this.state.ascent) return;

    refreshAscentLaneState(this.state);
    this.resourceBar.refresh();
    this.hud.render(this.state.ascent);

    const prompt = this.state.pendingAscentPrompt;
    const key = prompt ? `${prompt.kind}:${this.promptSignature(prompt)}` : '';
    // Chrome overlays own the modal layer until dismissed; don't let a tick tear them down.
    const overlayOpen = this.openPromptKey === 'codex'
      || this.openPromptKey === 'quit'
      || this.openPromptKey.startsWith('lane:');

    if (!overlayOpen && key !== this.openPromptKey) {
      this.openPromptKey = key;
      for (const scroll of this.activeScrollAreas) scroll.destroy();
      this.activeScrollAreas = [];
      this.modalLayer.removeAll(true);
      if (prompt) this.renderPrompt(prompt);
    }

    // After the prompt key is reconciled, never before: both of these decide whether to show
    // themselves from it, and reading last tick's value left the bar hidden for a whole frame
    // after the final card of a chain was answered.
    this.renderActionBar();
    this.renderInspect();
  }

  /** Identity of a prompt's *content*, so a reroll re-renders but a tick does not. */
  private promptSignature(prompt: AscentPrompt): string {
    switch (prompt.kind) {
      case 'power-draft': return `${prompt.level}:${prompt.cards.join(',')}:${prompt.rerollCost}`;
      case 'conquer-target': return prompt.targets.map((target) => target.landId).join(',');
      case 'conquer-method': return `${prompt.target.landId}:${prompt.target.methods.map((m) => m.method).join(',')}`;
      case 'hero-choice': return `${prompt.source}:${prompt.heroIds.join(',')}`;
      case 'court-appointment': return `${prompt.heroId}:${prompt.options.map((option) => option.id).join(',')}`;
      case 'law-choice': return `${prompt.points}:${prompt.projectIds.join(',')}`;
      case 'parliament': return prompt.cardId;
      case 'envoy': return `${prompt.kingdomId}:${prompt.relations}`;
      // Re-renders on every exchange, which is what makes the fight read as animated.
      case 'battle': return `battle:${this.state.ascent?.activeBattle?.round ?? 0}`;
      case 'famine': return `famine:${prompt.shortfall}`;
      case 'rival-demand': return `${prompt.demand}:${prompt.kingdomId}`;
      case 'empire-response': return `${prompt.wave}`;
      case 'wave-result': return `${prompt.wave}`;
      case 'founder': return prompt.options.join(',');
      case 'run-over': return `${prompt.score}`;
    }
  }

  private renderPrompt(prompt: AscentPrompt): void {
    switch (prompt.kind) {
      case 'founder': this.showFounder(prompt); break;
      case 'power-draft': this.showPowerDraft(prompt); break;
      case 'conquer-target': this.showConquerTarget(prompt); break;
      case 'conquer-method': this.showConquerMethod(prompt.target); break;
      case 'hero-choice': this.showHeroChoice(prompt); break;
      case 'court-appointment': this.showAppointment(prompt); break;
      case 'law-choice': this.showLawChoice(prompt); break;
      case 'parliament': this.showParliament(prompt); break;
      case 'envoy': this.showEnvoy(prompt); break;
      case 'battle': this.showBattle(); break;
      case 'famine': this.showFamine(prompt); break;
      case 'rival-demand': this.showRivalDemand(prompt); break;
      case 'empire-response': this.showEmpireResponse(prompt); break;
      case 'wave-result': this.showWaveResult(prompt); break;
      case 'run-over': this.showRunOver(prompt); break;
    }
  }

  /**
   * Full-screen frame shared by every prompt. Returns the content area to lay out into.
   *
   * The dim starts *below* the HUD band on purpose: POWER stays lit and readable while the
   * player chooses, so the "▲ POWER +7%" badge on a card has the number it refers to sitting
   * right above it — and the count-up is visible the moment the choice lands.
   */
  private promptFrame(title: string, subtitle: string): UIBounds {
    const top = HEADER_HEIGHT + ASCENT_HUD_HEIGHT;

    const dim = this.add
      .rectangle(0, top, GAME_WIDTH, GAME_HEIGHT - top, INK_UI.overlay, 0.93)
      .setOrigin(0, 0)
      .setInteractive();
    this.modalLayer.add(dim);

    // Stack, don't place at fixed offsets: titles wrap to two lines in Vietnamese (and for
    // long empire names), which collided with a hardcoded subtitle position.
    let cursor = top + 14;

    const titleText = this.add.text(GAME_WIDTH / 2, cursor, title, {
      color: '#f3dd9a',
      fontFamily: TITLE_FONT,
      fontSize: '20px',
      fontStyle: '700',
      align: 'center',
      lineSpacing: 2,
      wordWrap: { width: GAME_WIDTH - 48 },
    }).setOrigin(0.5, 0);
    this.modalLayer.add(titleText);
    cursor += titleText.height + 6;

    const subtitleText = this.add.text(GAME_WIDTH / 2, cursor, subtitle, {
      color: '#d8c48e',
      fontFamily: UI_FONT,
      fontSize: '12px',
      align: 'center',
      lineSpacing: 2,
      wordWrap: { width: GAME_WIDTH - 56 },
    }).setOrigin(0.5, 0);
    this.modalLayer.add(subtitleText);
    cursor += subtitleText.height + 14;

    return { x: 20, y: cursor, width: GAME_WIDTH - 40, height: GAME_HEIGHT - cursor - 20 };
  }

  private choose(choiceId: string): void {
    this.events.emit('ui:ascent-choice', choiceId);
  }

  /** A tappable prompt option. Everything the player can do is one of these. */
  /** Draws the two hosts on the battle screen, reusing the map's own marker art. */
  private battleItems?: MapItemRenderer;

  /** Left gutter a card icon occupies, glyph plus breathing room. */
  private static readonly ICON_GUTTER = CARD_ICON_SIZE + 12;

  /** Width kept clear on a badged card's title line, covering the longest badge label. */
  private static readonly BADGE_CLEARANCE = 86;

  private optionCard(
    bounds: UIBounds,
    opts: {
      title: string;
      body: string;
      note?: string;
      noteColor?: string;
      /** Width kept clear on the right (a portrait column), so text wraps before it. */
      reserveRight?: number;
      /** Glyph drawn in a left gutter. Resolved from the option id by `iconForOption`. */
      icon?: CardIconId;
      accent: number;
      badge?: string;
      disabled?: boolean;
      parent?: Phaser.GameObjects.Container;
      onTap: () => void;
    },
  ): Phaser.GameObjects.Container {
    const container = this.add.container(bounds.x, bounds.y);
    const alpha = opts.disabled ? 0.45 : 1;
    // A glyph shifts the whole text column right rather than overlapping it, so a card
    // with an icon wraps exactly as one without it does — the auto-fit height logic below
    // depends on the measured text being honest.
    const gutter = opts.icon ? ConquestUIScene.ICON_GUTTER : 0;
    const textX = 16 + gutter;
    const textWidth = bounds.width - 32 - gutter - (opts.reserveRight ?? 0);

    const surface = this.ui.panel(
      { x: 0, y: 0, width: bounds.width, height: bounds.height },
      { border: opts.accent, borderWidth: 2, muted: opts.disabled },
    );
    container.add(surface);

    container.add(this.add.rectangle(0, 0, 5, bounds.height, opts.accent, alpha).setOrigin(0, 0));

    // The badge sits top-right on the title's own line, so the title has to wrap before it.
    // Without this a longer title runs underneath and is clipped mid-word.
    if (opts.icon) {
      const glyph = drawCardIcon(this, opts.icon, opts.accent);
      glyph.setPosition(16 + CARD_ICON_SIZE / 2, bounds.height / 2).setAlpha(alpha);
      container.add(glyph);
    }

    const titleWidth = textWidth - (opts.badge ? ConquestUIScene.BADGE_CLEARANCE : 0);
    const titleText = this.ui.label(textX, 10, opts.title, 'label', {
      fontSize: '14px',
      wordWrap: { width: titleWidth },
    }).setAlpha(alpha);
    container.add(titleText);

    // Body follows the title's *measured* height rather than a fixed offset: reserving width
    // for the badge means a long title can now wrap to two lines, and a hard-coded y drew the
    // body straight through the second one.
    container.add(this.ui.label(textX, 10 + titleText.height + 4, opts.body, 'body', {
      fontSize: '11px',
      color: INK_UI_HEX.mutedText,
      wordWrap: { width: textWidth },
    }).setAlpha(alpha));

    if (opts.note) {
      container.add(this.add.text(textX, bounds.height - 20, opts.note, {
        color: opts.noteColor ?? '#4c6b3f',
        fontFamily: UI_FONT,
        fontSize: '11px',
        fontStyle: '700',
        wordWrap: { width: bounds.width - 32 },
      }).setAlpha(alpha));
    }

    if (opts.badge) {
      const badge = this.add.text(bounds.width - 12, 10, opts.badge, {
        color: INK_UI_HEX.inkText,
        fontFamily: UI_FONT,
        fontSize: '10px',
        fontStyle: '700',
        backgroundColor: `#${opts.accent.toString(16).padStart(6, '0')}`,
        padding: { x: 6, y: 3 },
      }).setOrigin(1, 0);
      container.add(badge);
    }

    if (!opts.disabled) {
      const hit = this.add
        .rectangle(bounds.width / 2, bounds.height / 2, bounds.width, bounds.height, 0xffffff, 0.001)
        .setInteractive({ useHandCursor: true });
      hit.on('pointerup', opts.onTap);
      container.add(hit);
    }

    (opts.parent ?? this.modalLayer).add(container);
    return container;
  }

  // ── Three Lane Surface ───────────────────────────────────────────────────

  /**
   * Keeps the bar current and hides it while something owns the modal layer — behind the dim
   * its buttons would be half-visible and untappable.
   */
  private renderActionBar(): void {
    const hidden = Boolean(this.state.pendingAscentPrompt) || this.openPromptKey !== '';
    this.actionBar.setVisible(!hidden);
    if (!hidden) this.actionBar.refresh();
    this.renderMapControls(hidden);
  }

  /**
   * Zoom and the terrain/control toggle, in the same right-edge stack the classic modes use.
   *
   * These are map controls, not menu entries, so they belong on the map rather than in the
   * action bar — and without the mode toggle the player has no way to reach the control view,
   * which is the one view that answers "who holds what" across the whole board at once.
   */
  private renderMapControls(hidden: boolean): void {
    for (const object of this.mapControlObjects) object.destroy();
    this.mapControlObjects = [];
    if (hidden) return;

    const x = GAME_WIDTH - 30;
    // The inspect card spans the full width, so when one is up the stack sits above it
    // rather than on top of it.
    const inspectTop = this.inspectCardTop();
    const bottom = inspectTop !== undefined
      ? inspectTop - 24
      : GAME_HEIGHT - ACTION_BAR_HEIGHT - 16;
    const controls: Array<[MapControlIcon, () => void]> = [
      ['zoom-in', () => this.events.emit('ui:zoom-map', 1)],
      ['zoom-out', () => this.events.emit('ui:zoom-map', -1)],
      ['mode', () => {
        this.events.emit('ui:toggle-render-mode');
        this.refresh();
      }],
    ];

    controls.forEach(([icon, onTap], index) => {
      this.mapControlObjects.push(
        this.createMapIconButton(x, bottom - (controls.length - 1 - index) * 42, icon, onTap),
      );
    });
  }

  /** The classic modes' round map button, redrawn here rather than reaching into UIScene. */
  private createMapIconButton(
    x: number,
    y: number,
    icon: MapControlIcon,
    onClick: () => void,
  ): Phaser.GameObjects.Container {
    const container = this.add.container(x, y).setDepth(430);
    const g = this.add.graphics();
    g.fillStyle(INK_UI.parchment, 0.96);
    g.fillRoundedRect(-18, -18, 36, 36, 8);
    g.lineStyle(2, INK_UI.brush, 0.9);
    g.strokeRoundedRect(-18, -18, 36, 36, 8);
    g.lineStyle(3, INK_UI.brush, 0.9);

    if (icon === 'zoom-in' || icon === 'zoom-out') {
      g.lineBetween(-8, 0, 8, 0);
      if (icon === 'zoom-in') g.lineBetween(0, -8, 0, 8);
    } else if (this.state.mapRenderMode === 'terrain') {
      // Showing terrain → the button offers the control view, drawn as two owner blocks.
      g.fillStyle(INK_UI.jade, 0.95);
      g.fillRect(-10, -9, 9, 18);
      g.fillStyle(INK_UI.cinnabar, 0.95);
      g.fillRect(1, -9, 9, 18);
      g.lineStyle(2, INK_UI.brush, 0.82);
      g.strokeRect(-10, -9, 20, 18);
    } else {
      // Showing control → the button offers terrain, drawn as a mountain over water.
      g.fillStyle(INK_UI.softBrush, 0.95);
      g.fillTriangle(-10, 8, 0, -9, 10, 8);
      g.fillStyle(0x5bb6d6, 0.9);
      g.fillRect(-10, 9, 20, 3);
    }

    const hit = this.add.rectangle(0, 0, 42, 42, 0xffffff, 0.001).setInteractive({ useHandCursor: true });
    const stop = (
      _pointer: Phaser.Input.Pointer,
      _localX: number,
      _localY: number,
      event: Phaser.Types.Input.EventData,
    ) => event.stopPropagation();
    hit.on('pointerdown', stop);
    hit.on('pointerup', (
      _pointer: Phaser.Input.Pointer,
      _localX: number,
      _localY: number,
      event: Phaser.Types.Input.EventData,
    ) => {
      event.stopPropagation();
      onClick();
    });

    container.add([g, hit]);
    return container;
  }

  /** The bottom bar's routing — the same screens the classic modes open, plus the Codex. */
  private handleBarAction(action: string): void {
    if (action === 'pause') {
      this.state.isStrategyPause = !this.state.isStrategyPause;
      this.refresh();
      return;
    }
    if (action === 'codex') {
      this.showCodex();
      return;
    }
    this.openLane(action as AscentLane);
  }

  /**
   * The dot on a bar button: a standing invitation to open that screen. Each condition is
   * about that screen specifically, so a lit button always means there is something real
   * behind it — never a decorative badge.
   */
  private barStatusColor(action: string): number | undefined {
    const state = this.state;
    const ascent = state.ascent;
    if (!ascent) return undefined;

    switch (action) {
      case 'heroes':
        return state.heroes.some((hero) => !hero.assignedTo) ? INK_UI.jade : undefined;
      case 'court':
        if (state.court.stability < 35) return INK_UI.cinnabar;
        return (state.mandate?.edictPoints ?? 0) > 0 ? INK_UI.gold : undefined;
      case 'army':
        // The one number that decides whether the run survives the next wave.
        return ascent.defensePower > 0 && ascent.threat > ascent.defensePower ? INK_UI.cinnabar : undefined;
      case 'affairs':
        return ascent.laneState.world === 'alert' ? INK_UI.cinnabar : undefined;
      case 'build':
        return state.buildOrders.length === 0 && state.resources.gold > 60 ? INK_UI.gold : undefined;
      default:
        return undefined;
    }
  }

  private openLane(lane: AscentLane): void {
    if (this.state.pendingAscentPrompt) return;

    this.lanePauseBeforeOpen = this.state.isStrategyPause;
    this.state.isStrategyPause = true;
    this.openPromptKey = `lane:${lane}`;
    for (const scroll of this.activeScrollAreas) scroll.destroy();
    this.activeScrollAreas = [];
    this.modalLayer.removeAll(true);
    this.renderActionBar();
    this.renderInspect();

    switch (lane) {
      case 'build': this.showBuildScreen(); break;
      case 'heroes': this.showHeroesScreen(); break;
      case 'court': this.showCourtScreen(); break;
      case 'army': this.showArmyScreen(); break;
      case 'affairs': this.showAffairsScreen(); break;
    }
  }

  /**
   * The scrolling body every bar screen shares: a titled frame, a scroll area, and a helper
   * that appends one tappable row. Factored out so the five screens differ only in content.
   */
  private laneList(title: string, subtitle: string): {
    content: UIBounds;
    addRow: (
      opts: { title: string; subtitle: string; border: number; muted?: boolean },
      onTap?: () => void,
    ) => void;
    finish: () => void;
  } {
    const content = this.promptFrame(title, subtitle);
    const scroll = this.ui.scrollArea({
      x: content.x,
      y: content.y,
      width: content.width,
      height: content.height - 58,
    });
    scroll.addTo(this.modalLayer);
    this.activeScrollAreas.push(scroll);

    const rowWidth = content.width - 6;
    let y = 0;

    const addRow = (
      opts: { title: string; subtitle: string; border: number; muted?: boolean },
      onTap?: () => void,
    ) => {
      const row = this.ui.card({ x: 0, y, width: rowWidth, height: 54 }, opts);
      const height = (row.getData('cardHeight') as number) ?? 54;
      if (onTap) {
        const hit = this.add
          .rectangle(rowWidth / 2, height / 2, rowWidth, height, 0xffffff, 0.001)
          .setInteractive({ useHandCursor: true });
        hit.on('pointerup', onTap);
        row.add(hit);
      }
      scroll.content.add(row);
      y += height + 8;
    };

    const finish = () => {
      scroll.setContentHeight(Math.max(content.height - 58, y));
      this.laneCloseButton(content);
    };

    return { content, addRow, finish };
  }

  /** Standard footer for a lane browser: one button back to the map. */
  private laneCloseButton(content: UIBounds): void {
    this.modalLayer.add(this.ui.button(
      { x: content.x, y: GAME_HEIGHT - 66, width: content.width, height: 42 },
      t('ascent.lane.close'),
      () => this.closeLane(),
      { variant: 'primary', fontSize: '13px' },
    ));
  }

  /** Leaves a lane browser, restoring whatever pause state the player had before opening it. */
  private closeLane(): void {
    this.state.isStrategyPause = this.lanePauseBeforeOpen;
    this.closeOverlay();
  }

  // ── Bar screens ───────────────────────────────────────────────────────────
  //
  // The same five screens the classic modes reach from their action bar, rebuilt on this
  // scene's card components against the same systems. The autopilot still runs everything
  // between decisions; these exist so the player can *overrule* it at any moment rather than
  // waiting for a card to offer the choice.

  /** Build / upgrade a district by hand, ahead of whatever the autopilot would have picked. */
  private showBuildScreen(): void {
    const state = this.state;
    const lands = state.lands.filter((land) => land.ownerId === PLAYER_KINGDOM_ID);
    const { addRow, finish } = this.laneList(
      t('action.build'),
      t('ascent.screen.buildBody', { lands: lands.length }),
    );

    for (const land of lands) {
      const order = state.buildOrders.find((candidate) => candidate.landId === land.id);
      addRow(
        {
          title: land.name,
          subtitle: order
            ? t('ascent.screen.building', { n: Math.max(0, order.required - order.progress) })
            : t('ascent.screen.slots', {
                used: land.buildings.length,
                cap: land.buildingCapacity,
                defense: land.defense,
              }),
          border: order ? INK_UI.gold : INK_UI.jade,
          muted: Boolean(order),
        },
        order ? undefined : () => this.showBuildOptions(land.id),
      );
    }
    finish();
  }

  /** The options for one district: every build and upgrade it admits, priced. */
  private showBuildOptions(landId: string): void {
    const state = this.state;
    const land = state.lands.find((candidate) => candidate.id === landId);
    if (!land) return;

    for (const scroll of this.activeScrollAreas) scroll.destroy();
    this.activeScrollAreas = [];
    this.modalLayer.removeAll(true);

    const { addRow, finish } = this.laneList(
      land.name,
      t('ascent.screen.slots', { used: land.buildings.length, cap: land.buildingCapacity, defense: land.defense }),
    );

    // Closing re-runs `refresh`, which repaints the resource bar and the bar's status dots
    // against the order just filed — so there is nothing else to notify.
    const act = (run: () => boolean) => {
      if (run()) this.closeLane();
    };

    for (const option of getBuildOptions(state, land)) {
      addRow(
        {
          title: option.label,
          subtitle: option.canBuild
            ? `${formatResourceList(option.cost)}  ·  ${t('ascent.conquer.ticks', { n: option.ticks })}`
            : option.reason ?? '',
          border: option.canBuild ? INK_UI.jade : INK_UI.softBrush,
          muted: !option.canBuild,
        },
        option.canBuild ? () => act(() => buildDistrictBuilding(state, land.id, option.type)) : undefined,
      );
    }

    for (const option of getUpgradeOptions(state, land)) {
      addRow(
        {
          title: t('ascent.screen.upgrade', { building: buildingLabel(option.type), level: option.level + 1 }),
          subtitle: option.canUpgrade
            ? `${formatResourceList(option.cost)}  ·  ${t('ascent.conquer.ticks', { n: option.ticks })}`
            : option.reason ?? '',
          border: option.canUpgrade ? INK_UI.gold : INK_UI.softBrush,
          muted: !option.canUpgrade,
        },
        option.canUpgrade ? () => act(() => upgradeDistrictBuilding(state, land.id, option.index)) : undefined,
      );
    }
    finish();
  }

  /**
   * The hero roster. Tapping anyone opens the same Appointment card the game raises when a
   * champion arrives, so a posting can be changed the moment the player wants to.
   */
  private showHeroesScreen(): void {
    const state = this.state;
    const { addRow, finish } = this.laneList(
      t('action.heroes'),
      t('ascent.screen.heroesBody', { n: state.heroes.length }),
    );

    // Unposted first: the most common reason to open this screen.
    const ordered = [...state.heroes].sort(
      (a, b) => Number(Boolean(a.assignedTo)) - Number(Boolean(b.assignedTo)),
    );
    for (const hero of ordered) {
      addRow(
        {
          title: `${heroName(hero)}  ·  ${rarityLabel(hero.rarity)}`,
          subtitle: `${this.heroPosting(hero)} — ${this.heroStatLine(hero)}`,
          border: hero.assignedTo ? INK_UI.jade : INK_UI.cinnabar,
        },
        () => {
          this.closeLane();
          this.events.emit('ui:ascent-appoint', hero.id);
        },
      );
    }
    finish();
  }

  /** Human-readable posting for a hero, covering every form `assignedTo` can take. */
  private heroPosting(hero: Hero): string {
    const state = this.state;
    if (!hero.assignedTo) return t('ascent.lane.unposted');

    if (hero.assignedTo.startsWith('court:')) {
      return getCourtPositionLabel(hero.assignedTo.slice('court:'.length) as CourtPositionId);
    }
    if (hero.assignedTo.startsWith('ambassador:')) {
      const id = hero.assignedTo.slice('ambassador:'.length);
      const kingdom = state.kingdoms.find((candidate) => candidate.id === id);
      return t('ascent.screen.ambassadorTo', { kingdom: kingdom?.name ?? '' });
    }
    if (hero.assignedTo.startsWith('diplomacy-')) return t('ascent.method.diplomacy');

    const land = state.lands.find((candidate) => candidate.id === hero.assignedTo);
    if (land) return t('ascent.appoint.governor', { land: land.name });

    const army = state.armies.find((candidate) => candidate.id === hero.assignedTo);
    return army ? t('ascent.screen.commands', { army: army.name }) : hero.assignedTo;
  }

  /** Seats, the realm's standing, and the laws in force — plus the throne's unspent authority. */
  private showCourtScreen(): void {
    const state = this.state;
    const mandate = state.mandate;
    const { addRow, finish } = this.laneList(
      t('action.court'),
      t('ascent.lane.courtBody', {
        era: mandate ? eraLabel(mandate.era) : '—',
        stability: Math.round(state.court.stability),
        points: mandate?.edictPoints ?? 0,
      }),
    );

    if ((mandate?.edictPoints ?? 0) > 0) {
      addRow(
        {
          title: t('ascent.lane.enactLaw'),
          subtitle: t('ascent.lane.enactLawBody', { points: mandate?.edictPoints ?? 0 }),
          border: INK_UI.gold,
        },
        () => {
          this.closeLane();
          this.events.emit('ui:ascent-law');
        },
      );
    }

    for (const seat of ALL_COURT_POSITIONS) {
      const unlocked = state.court.unlockedSeats.includes(seat);
      const hero = state.heroes.find((candidate) => candidate.id === state.court.seats[seat]);
      addRow(
        {
          title: getCourtPositionLabel(seat),
          subtitle: hero
            ? `${heroName(hero)} — ${seatedEffectSummary(state, seat) ?? ''}`
            : unlocked ? t('ascent.lane.seatEmpty') : t('ascent.lane.seatLocked'),
          border: hero ? INK_UI.jade : unlocked ? INK_UI.gold : INK_UI.softBrush,
          muted: !unlocked,
        },
        // A seated minister can be moved; an empty seat is filled from the Heroes screen.
        hero
          ? () => {
              this.closeLane();
              this.events.emit('ui:ascent-appoint', hero.id);
            }
          : undefined,
      );
    }

    for (const edictId of mandate?.edicts ?? []) {
      const view = lawCardView(state, edictId);
      if (!view) continue;
      addRow({ title: view.title, subtitle: view.effect, border: INK_UI.gold });
    }
    finish();
  }

  /** Standing hosts, and the levy the player can raise without waiting for the autopilot. */
  private showArmyScreen(): void {
    const state = this.state;
    const ascent = state.ascent;
    const mine = state.armies.filter((army) => army.kingdomId === PLAYER_KINGDOM_ID);
    const { addRow, finish } = this.laneList(
      t('action.army'),
      t('ascent.screen.armyBody', {
        defense: Math.round(ascent?.defensePower ?? 0),
        threat: Math.round(ascent?.threat ?? 0),
      }),
    );

    const commanderId = findFreeCommander(state);
    const spare = state.resources.humans - RECRUIT_HUMAN_RESERVE;
    const canRaise = Boolean(commanderId) && spare >= MIN_ARMY_SOLDIERS;
    addRow(
      {
        title: t('ascent.screen.raiseHost'),
        subtitle: canRaise
          ? t('ascent.screen.raiseHostBody', { n: recruitSoldiers(spare) })
          : commanderId
            ? t('ascent.screen.raiseNoPeople')
            : t('ascent.conquer.needHero'),
        border: canRaise ? INK_UI.jade : INK_UI.softBrush,
        muted: !canRaise,
      },
      canRaise
        ? () => {
            this.closeLane();
            this.events.emit('ui:ascent-raise-host');
          }
        : undefined,
    );

    for (const army of mine) {
      const land = state.lands.find((candidate) => candidate.id === army.landId);
      const general = state.heroes.find((candidate) => candidate.id === army.generalHeroId);
      const size = army.units.spearmen + army.units.archers + army.units.heavyInfantry;
      addRow(
        {
          title: `${army.name}  ·  ${size}`,
          subtitle: t('ascent.screen.armyRow', {
            land: land?.name ?? '—',
            general: general ? heroName(general) : t('ascent.screen.noGeneral'),
            morale: Math.round(army.morale),
            supply: Math.round(army.supply),
          }),
          border: army.morale < 40 || army.supply < 30 ? INK_UI.cinnabar : INK_UI.jade,
        },
        () => this.showArmyDetail(army.id),
      );
    }
    finish();
  }

  /**
   * One host, and what can be done with it.
   *
   * Exists because a shattered army could not be sent home: `disbandArmy` has always worked and
   * the autopilot uses it on remnants, but nothing in this mode's UI ever called it, so a host
   * that had lost its war sat on the map drawing upkeep forever with no way to release it. That
   * matters far more now that upkeep scales with size — a player has to be able to *choose* the
   * treasury over the field, which is the whole point of charging for an army.
   */
  private showArmyDetail(armyId: string): void {
    const army = this.state.armies.find((candidate) => candidate.id === armyId);
    if (!army) return;

    this.modalLayer.removeAll(true);
    this.openPromptKey = `army-detail:${armyId}`;

    const size = army.units.spearmen + army.units.archers + army.units.heavyInfantry;
    const general = this.state.heroes.find((candidate) => candidate.id === army.generalHeroId);
    const land = this.state.lands.find((candidate) => candidate.id === army.landId);

    const content = this.promptFrame(
      army.name,
      t('ascent.army.detailBody', {
        land: land?.name ?? '—',
        general: general ? heroName(general) : t('ascent.screen.noGeneral'),
        morale: Math.round(army.morale),
        supply: Math.round(army.supply),
      }),
    );

    // What sending them home is actually worth, in the two currencies the player is watching.
    const upkeep = ascentArmyUpkeep(this.state);
    const troops = Math.max(1, getPlayerTroops(this.state));
    const savedGold = Math.round(upkeep.gold * (size / troops));
    const savedFood = Math.round(upkeep.food * (size / troops));

    this.modalLayer.add(this.optionCard(
      { x: content.x, y: content.y, width: content.width, height: 92 },
      {
        icon: 'retreat',
        title: t('ascent.army.disband'),
        body: t('ascent.army.disbandBody', { n: size, gold: savedGold, food: savedFood }),
        badge: t('ascent.army.disbandBadge'),
        accent: INK_UI.cinnabar,
        onTap: () => {
          this.closeLane();
          this.events.emit('ui:ascent-disband-army', armyId);
        },
      },
    ));

    this.modalLayer.add(this.ui.button(
      { x: content.x, y: content.y + 104, width: content.width, height: 42 },
      t('ascent.conquer.back'),
      () => this.showArmyScreen(),
      { variant: 'ghost', fontSize: '13px' },
    ));
  }

  /** The rival empires as they stand: power, opinion, pacts, and who has our ambassador. */
  private showAffairsScreen(): void {
    const state = this.state;
    const rivals = state.kingdoms.filter(
      (kingdom) => kingdom.id !== PLAYER_KINGDOM_ID && !kingdom.isDefeated,
    );
    const { addRow, finish } = this.laneList(t('action.affairs'), t('ascent.lane.worldBody'));

    for (const kingdom of rivals) {
      const relations = Math.round(kingdom.relations ?? 50);
      const tags = [
        t('ascent.world.power', { value: Math.round(getEmpirePower(state, kingdom)) }),
        t('ascent.world.appetite', { value: Math.round(kingdom.warAppetite ?? 0) }),
        hasPact(kingdom) ? t('ascent.world.pact') : undefined,
        kingdom.ambassadorHeroId ? t('ascent.world.ambassador') : undefined,
      ].filter(Boolean).join('  ·  ');

      addRow(
        {
          title: `${kingdom.name}  ·  ${relations}`,
          subtitle: tags,
          // Green when content, red once cold enough to march.
          border: relations >= 55 ? INK_UI.jade : relations >= 35 ? INK_UI.gold : INK_UI.cinnabar,
        },
        () => {
          this.closeLane();
          this.events.emit('ui:ascent-envoy', kingdom.id);
        },
      );
    }
    finish();
  }

  // ── Prompts ───────────────────────────────────────────────────────────────

  private showPowerDraft(prompt: Extract<AscentPrompt, { kind: 'power-draft' }>): void {
    const content = this.promptFrame(
      t('ascent.draft.title', { level: prompt.level }),
      t('ascent.draft.subtitle'),
    );

    const cards: Phaser.GameObjects.Container[] = [];
    const cardHeight = 118;
    prompt.cards.forEach((cardId, index) => {
      const view = powerCardView(this.state, cardId);
      if (!view) return;
      // The evolution call-out outranks the power preview: completing a pair is the
      // headline reward, and a bare percentage would undersell it.
      const note = view.evolutionReady
        ? t('ascent.draft.evoReady')
        : view.powerGainPct > 0
          ? t('ascent.draft.powerPreview', { pct: view.powerGainPct })
          : undefined;

      cards.push(this.optionCard(
        { x: content.x, y: content.y + index * (cardHeight + 12), width: content.width, height: cardHeight },
        {
          title: `${view.name}  ·  ${view.stackLabel}`,
          body: view.description,
          note,
          noteColor: view.evolutionReady ? '#c98a2e' : undefined,
          badge: `${t(`ascent.rarity.${view.rarity}` as Parameters<typeof t>[0])}  ${view.stackCount}`,
          accent: view.evolutionReady ? INK_UI.gold : RARITY_COLOR[view.rarity],
          onTap: () => this.choose(cardId),
        },
      ));
    });
    staggerIn(this, cards);

    const footerY = content.y + prompt.cards.length * (cardHeight + 12) + 12;
    const affordable = this.state.resources.gold >= prompt.rerollCost;
    this.modalLayer.add(this.ui.button(
      { x: content.x, y: footerY, width: content.width / 2 - 6, height: 40 },
      affordable
        ? t('ascent.draft.reroll', { cost: prompt.rerollCost })
        : t('ascent.draft.rerollPoor', { cost: prompt.rerollCost }),
      () => this.events.emit('ui:ascent-reroll'),
      { variant: affordable ? 'secondary' : 'disabled', fontSize: '12px' },
    ));
    this.modalLayer.add(this.ui.button(
      { x: content.x + content.width / 2 + 6, y: footerY, width: content.width / 2 - 6, height: 40 },
      t('ascent.draft.skip', { xp: skipRefundAmount(this.state) }),
      () => this.choose('skip'),
      { variant: 'ghost', fontSize: '12px' },
    ));
  }

  /** One province row, shared by the Conquer prompt and the Conquer lane browser. */
  private provinceCard(bounds: UIBounds, target: ConquestTarget, onTap: () => void): Phaser.GameObjects.Container {
    const open = target.methods.filter((method) => !method.blockedReason);
    // The headline is *how many ways in there are*, not the odds: a bare win percentage hides
    // every peaceful path, and "best odds" reads 100% on almost every province because most
    // admit at least one method that cannot fail. What separates provinces at this level is
    // the garrison and the reward, both already on the card; the methods carry their own
    // numbers on the sheet behind it.
    const note = target.busyReason
      ? target.busyReason
      : open.length > 0
        ? t('ascent.conquer.ways', { n: open.length })
        : t('ascent.conquer.noWay');

    return this.optionCard(bounds, {
      title: target.landName,
      body: `${t(`ascent.conquer.kind.${target.landKind}` as Parameters<typeof t>[0], { owner: target.ownerName ?? '' })}  ·  ${t(`ascent.march.reward.${target.rewardTag}` as Parameters<typeof t>[0])}`,
      note: `${note}  ·  ${t('ascent.march.garrison', { value: target.garrison })}`,
      // Green means a road in that cannot fail; amber means every road is a gamble.
      accent: open.length === 0
        ? INK_UI.softBrush
        : target.hasCertainMethod ? INK_UI.jade : target.bestChance >= 45 ? INK_UI.gold : INK_UI.cinnabar,
      disabled: open.length === 0 && !target.busyReason,
      onTap,
    });
  }

  private showConquerTarget(prompt: Extract<AscentPrompt, { kind: 'conquer-target' }>): void {
    // `frontLandId` is cleared the moment a province falls, so it cannot distinguish these
    // cases — keying off how much ground the realm holds does.
    const held = this.state.lands.filter((land) => land.ownerId === PLAYER_KINGDOM_ID).length;
    const content = this.promptFrame(
      t('ascent.conquer.title'),
      held <= 1 ? t('ascent.conquer.subtitleFirst') : t('ascent.conquer.subtitle', { held }),
    );

    const rowHeight = 92;
    const cards: Phaser.GameObjects.Container[] = [];
    prompt.targets.forEach((target, index) => {
      cards.push(this.provinceCard(
        { x: content.x, y: content.y + index * (rowHeight + 10), width: content.width, height: rowHeight },
        target,
        () => this.choose(target.landId),
      ));
    });
    staggerIn(this, cards);

    const footerY = content.y + prompt.targets.length * (rowHeight + 10) + 8;
    this.modalLayer.add(this.ui.button(
      { x: content.x, y: footerY, width: content.width, height: 40 },
      t('ascent.march.hold'),
      () => this.choose('hold'),
      { variant: 'ghost', fontSize: '12px' },
    ));
  }

  /**
   * The price tag on a method card, on one line: cost, duration, resulting loyalty, and the
   * odds. Kept to a single line deliberately — it sits in the card's fixed-height note slot,
   * and a second line would be clipped by the card edge.
   */
  private methodPriceTag(option: ConquestMethodOption): string {
    const parts: string[] = [
      option.cost && Object.keys(option.cost).length > 0
        ? formatResourceList(option.cost)
        : t('ascent.conquer.free'),
    ];
    if (option.ticks > 0) parts.push(t('ascent.conquer.ticks', { n: option.ticks }));
    parts.push(t('ascent.conquer.loyalty', { n: option.loyalty }));
    parts.push(option.chance >= 100 ? t('ascent.conquer.certain') : t('ascent.conquer.chance', { pct: option.chance }));
    return parts.join('  ·  ');
  }

  /**
   * Step two of a conquest: every way into this province, priced.
   *
   * Blocked methods stay on screen greyed with their concrete reason rather than being hidden.
   * Seeing that a bribe needs 74 gold when you hold 51 is how the player learns what the
   * treasury is *for* — a filtered list would just look like the game offering less.
   */
  private showConquerMethod(target: ConquestTarget): void {
    const content = this.promptFrame(
      target.landName,
      t('ascent.conquer.methodSubtitle', {
        kind: t(`ascent.conquer.kind.${target.landKind}` as Parameters<typeof t>[0], { owner: target.ownerName ?? '' }),
        garrison: target.garrison,
      }),
    );

    const rowHeight = 82;
    const cards: Phaser.GameObjects.Container[] = [];
    target.methods.forEach((option, index) => {
      const blocked = Boolean(option.blockedReason);

      cards.push(this.optionCard(
        { x: content.x, y: content.y + index * (rowHeight + 9), width: content.width, height: rowHeight },
        {
          icon: iconForOption(option.method),
          title: t(`ascent.method.${option.method}` as Parameters<typeof t>[0]),
          // Description in the wrapping body slot, numbers on the single-line note slot —
          // the reverse clipped the second line of every two-line description.
          body: t(`ascent.method.${option.method}.d` as Parameters<typeof t>[0]),
          // How productive the province is on the day it changes hands. This is the axis the
          // six methods actually differ on, and until loyalty was given teeth it was invisible
          // *and* inert — so the sheet read as six prices for one outcome.
          badge: blocked ? undefined : t('ascent.conquer.settleBadge', {
            pct: Math.round((0.6 + 0.4 * (option.loyalty / 100)) * 100),
          }),
          note: option.blockedReason ?? this.methodPriceTag(option),
          noteColor: blocked ? '#a8adb4' : undefined,
          accent: blocked ? INK_UI.softBrush : option.chance >= 60 ? INK_UI.jade : INK_UI.gold,
          disabled: blocked,
          onTap: () => this.choose(option.method),
        },
      ));
    });
    staggerIn(this, cards);

    const footerY = content.y + target.methods.length * (rowHeight + 9) + 8;
    this.modalLayer.add(this.ui.button(
      { x: content.x, y: footerY, width: content.width, height: 40 },
      t('ascent.conquer.back'),
      () => this.choose('back'),
      { variant: 'ghost', fontSize: '12px' },
    ));
  }

  /**
   * The champion card. One screen for both sources — the court's Favor draft and the wave
   * gacha — because the player should only ever learn one "a hero arrived" interaction.
   */
  private showHeroChoice(prompt: Extract<AscentPrompt, { kind: 'hero-choice' }>): void {
    const content = this.promptFrame(
      prompt.source === 'court' ? t('ascent.summon.courtTitle') : t('ascent.summon.title'),
      prompt.pityUsed
        ? t('ascent.summon.pity')
        : prompt.source === 'court' ? t('ascent.summon.courtSubtitle') : t('ascent.summon.subtitle'),
    );

    const cardHeight = 132;
    const cards: Phaser.GameObjects.Container[] = [];

    prompt.heroIds.forEach((heroId, index) => {
      const hero = this.state.heroDeck.find((candidate) => candidate.id === heroId);
      if (!hero) return;
      const tier = tierForHero(hero);
      const y = content.y + index * (cardHeight + 10);
      // First-time pulls are the collection payoff — say so on the card.
      const isNew = !isHeroUnlocked(hero.id);

      const card = this.optionCard(
        { x: content.x, y, width: content.width, height: cardHeight },
        {
          title: heroName(hero),
          body: `${heroTypeLabel(hero.type)}  ·  ${rarityLabel(hero.rarity)}`,
          note: isNew ? t('ascent.summon.newCodex') : this.heroStatLine(hero),
          noteColor: isNew ? '#c98a2e' : undefined,
          badge: t(`ascent.rarity.${tier}` as Parameters<typeof t>[0]),
          accent: RARITY_COLOR[tier],
          reserveRight: PORTRAIT_W + 14,
          onTap: () => this.choose(heroId),
        },
      );

      // Gold and Jade pulls glow — the one moment the mode leans into the gacha reveal.
      if (tier === 'gold' || tier === 'jade') {
        const glow = this.add.graphics();
        glow.lineStyle(3, RARITY_COLOR[tier], 0.8);
        glow.strokeRoundedRect(-2, -2, content.width + 4, cardHeight + 4, 10);
        card.add(glow);
        this.tweens.add({
          targets: glow,
          alpha: { from: 0.25, to: 1 },
          duration: 900,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
      }

      // Procedural portrait, deterministic from the hero id — no art assets involved.
      // Sized to the card's right-hand column, below the badge row. The portrait's art is
      // taller than its frame (the shoulders hang past it), so it must be fitted to a box
      // rather than dropped at a centre point, or it spills out of the card.
      const face = renderHeroFaceInBox(this, hero, {
        x: content.width - PORTRAIT_W - 12,
        y: PORTRAIT_TOP,
        width: PORTRAIT_W,
        height: cardHeight - PORTRAIT_TOP - 8,
      });
      card.add(face);
      cards.push(card);
    });
    staggerIn(this, cards);

    const footerY = content.y + prompt.heroIds.length * (cardHeight + 10) + 8;
    this.modalLayer.add(this.ui.button(
      { x: content.x, y: footerY, width: content.width, height: 38 },
      t('ascent.summon.pass'),
      () => this.choose('pass'),
      { variant: 'ghost', fontSize: '12px' },
    ));
  }

  private heroStatLine(hero: Hero): string {
    const stats = hero.stats;
    return `⚔ ${stats.martial}   ⚙ ${stats.logistics}   ◈ ${stats.administration}`;
  }

  /**
   * Where a new champion serves.
   *
   * Every option prints the concrete bonus this hero's own stats produce there — `+23% army
   * power`, `+18% output` — so the choice is read off numbers rather than guessed from a job
   * title. That is the difference between a court and a list of nouns.
   */
  private showAppointment(prompt: Extract<AscentPrompt, { kind: 'court-appointment' }>): void {
    const hero = this.state.heroes.find((candidate) => candidate.id === prompt.heroId);
    const content = this.promptFrame(
      t('ascent.appoint.title', { hero: hero ? heroName(hero) : '' }),
      hero ? `${heroTypeLabel(hero.type)}  ·  ${this.heroStatLine(hero)}` : '',
    );

    const rowHeight = 74;
    const cards: Phaser.GameObjects.Container[] = [];
    prompt.options.forEach((option, index) => {
      const reserve = option.id === 'reserve';
      cards.push(this.optionCard(
        { x: content.x, y: content.y + index * (rowHeight + 9), width: content.width, height: rowHeight },
        {
          title: option.title,
          body: option.effect,
          note: option.detail,
          noteColor: option.detail && !reserve ? '#c98a2e' : undefined,
          badge: t(`ascent.appoint.role.${option.role}` as Parameters<typeof t>[0]),
          accent: reserve ? INK_UI.softBrush : option.role === 'court' ? INK_UI.gold : INK_UI.jade,
          onTap: () => this.choose(option.id),
        },
      ));
    });
    staggerIn(this, cards);
  }

  /**
   * A permanent law. Enacting one from an exclusive group locks its sibling out for the whole
   * run, so the card names what it kills — that fork is the main reason two runs diverge.
   */
  private showLawChoice(prompt: Extract<AscentPrompt, { kind: 'law-choice' }>): void {
    const content = this.promptFrame(
      t('ascent.law.title'),
      t('ascent.law.subtitle', {
        points: prompt.points,
        era: this.state.mandate ? eraLabel(this.state.mandate.era) : '—',
      }),
    );

    const rowHeight = 80;
    const cards: Phaser.GameObjects.Container[] = [];
    let cursor = content.y;

    prompt.projectIds.forEach((projectId) => {
      const view = lawCardView(this.state, projectId);
      if (!view) return;
      cards.push(this.optionCard(
        { x: content.x, y: cursor, width: content.width, height: rowHeight },
        {
          title: view.title,
          body: view.effect,
          note: view.locks,
          noteColor: '#c98a2e',
          badge: view.cost,
          accent: INK_UI.gold,
          onTap: () => this.choose(`edict:${projectId}`),
        },
      ));
      cursor += rowHeight + 9;
    });

    // The tax dial rides on the same card: it is the other permanent lever on the realm, and
    // giving it its own prompt would be one more modal for one more binary choice.
    prompt.taxOptions.forEach((policy) => {
      cards.push(this.optionCard(
        { x: content.x, y: cursor, width: content.width, height: 58 },
        {
          title: t('ascent.law.taxTitle', { policy: t(`ascent.tax.${policy}` as Parameters<typeof t>[0]) }),
          body: t(`ascent.tax.${policy}.d` as Parameters<typeof t>[0]),
          accent: INK_UI.softBrush,
          onTap: () => this.choose(`tax:${policy}`),
        },
      ));
      cursor += 58 + 9;
    });
    staggerIn(this, cards);

    this.modalLayer.add(this.ui.button(
      { x: content.x, y: cursor + 4, width: content.width, height: 40 },
      t('ascent.law.hold'),
      () => this.choose('hold'),
      { variant: 'ghost', fontSize: '12px' },
    ));
  }

  /** The court speaks. Two choices, both real, drawn from the shared politics deck. */
  private showParliament(prompt: Extract<AscentPrompt, { kind: 'parliament' }>): void {
    const card = this.state.politicsDeck.find((candidate) => candidate.id === prompt.cardId);
    if (!card) {
      this.choose('');
      return;
    }

    const content = this.promptFrame(politicsTitle(card), politicsDescription(card));

    const rowHeight = 78;
    const cards: Phaser.GameObjects.Container[] = [];
    card.choices.forEach((choice, index) => {
      const cost = Object.entries(choice.effects.resourceDelta ?? {})
        .filter(([, value]) => (value ?? 0) < 0)
        .map(([key, value]) => [key, Math.abs(value ?? 0)] as const);
      const costBag = Object.fromEntries(cost);
      const affordable = cost.every(([key, value]) => (this.state.resources[key as keyof typeof this.state.resources] ?? 0) >= value);

      cards.push(this.optionCard(
        { x: content.x, y: content.y + index * (rowHeight + 10), width: content.width, height: rowHeight },
        {
          title: politicsChoiceLabel(choice),
          body: politicsChoiceDescription(choice),
          note: cost.length > 0 ? formatResourceList(costBag) : undefined,
          noteColor: affordable ? undefined : '#e08a7c',
          accent: affordable ? INK_UI.jade : INK_UI.softBrush,
          disabled: !affordable,
          onTap: () => this.choose(choice.id),
        },
      ));
    });
    staggerIn(this, cards);

    this.modalLayer.add(this.ui.button(
      { x: content.x, y: content.y + card.choices.length * (rowHeight + 10) + 8, width: content.width, height: 40 },
      t('ascent.parliament.decline'),
      () => this.choose('decline'),
      { variant: 'ghost', fontSize: '12px' },
    ));
  }

  /** One rival empire, and everything the realm can do about it. */
  private showEnvoy(prompt: Extract<AscentPrompt, { kind: 'envoy' }>): void {
    const kingdom = this.state.kingdoms.find((candidate) => candidate.id === prompt.kingdomId);
    const content = this.promptFrame(
      t('ascent.envoy.title', { kingdom: prompt.kingdomName }),
      t('ascent.envoy.subtitle', { relations: prompt.relations, power: prompt.power }),
    );

    // Tall enough for a two-line body: the ambassador option names the hero, which wraps for
    // most names and overlapped the price line at a shorter height.
    const rowHeight = 84;
    const cards: Phaser.GameObjects.Container[] = [];
    prompt.options.forEach((option, index) => {
      const price = option.cost && Object.keys(option.cost).length > 0
        ? formatResourceList(option.cost)
        : option.influenceCost
          ? t('ascent.envoy.influence', { n: option.influenceCost })
          : t('ascent.conquer.free');

      cards.push(this.optionCard(
        { x: content.x, y: content.y + index * (rowHeight + 9), width: content.width, height: rowHeight },
        {
          title: t(`ascent.envoy.${option.id}` as Parameters<typeof t>[0]),
          body: kingdom ? envoyOptionDetail(this.state, kingdom, option) : '',
          note: option.affordable ? price : t('ascent.response.cantAfford'),
          noteColor: option.affordable ? undefined : '#e08a7c',
          accent: option.affordable ? (option.id === 'tribute' ? INK_UI.cinnabar : INK_UI.gold) : INK_UI.softBrush,
          disabled: !option.affordable,
          onTap: () => this.choose(option.id),
        },
      ));
    });
    staggerIn(this, cards);
  }

  /**
   * A rival's demand. The half of foreign affairs the player does not start — and the one
   * place where refusing has to visibly cost something, or the card is flavour.
   */
  /**
   * The famine card.
   *
   * Every option spends a *different* store — coin, herds, the army's own baggage, or nothing
   * at all — so unlike the wave-response card these are genuinely different decisions rather
   * than four prices for the same outcome. Buying grain is deliberately the strong answer when
   * the treasury is deep: a realm that banked four hundred thousand gold with nothing to spend
   * it on was the other half of this same complaint.
   */
  private showFamine(prompt: Extract<AscentPrompt, { kind: 'famine' }>): void {
    const content = this.promptFrame(
      t('ascent.famine.title'),
      t('ascent.famine.body', { shortfall: Math.round(prompt.shortfall) }),
    );

    const rowHeight = 78;
    prompt.options.forEach((option, index) => {
      const label = t(`ascent.famine.${option.id}` as Parameters<typeof t>[0]);
      const detail = t(`ascent.famine.${option.id}D` as Parameters<typeof t>[0], {
        food: Math.round(option.food ?? 0),
      });

      this.modalLayer.add(this.optionCard(
        { x: content.x, y: content.y + index * (rowHeight + 10), width: content.width, height: rowHeight },
        {
          icon: iconForOption(option.id),
          title: label,
          body: detail,
          note: option.cost
            ? (option.affordable ? formatResourceList(option.cost) : t('ascent.response.cantAfford'))
            : undefined,
          noteColor: option.affordable ? undefined : '#e08a7c',
          // Enduring is the red option: free today, and the hunger keeps taking.
          accent: !option.affordable
            ? INK_UI.softBrush
            : option.id === 'endure' || option.id === 'requisition'
              ? INK_UI.cinnabar
              : INK_UI.gold,
          disabled: !option.affordable,
          onTap: () => { if (option.affordable) this.choose(option.id); },
        },
      ));
    });
  }

  /**
   * The field battle, exchange by exchange.
   *
   * The one screen in the mode where the player watches rather than reads: two hosts facing
   * each other, strength draining as the rounds land, and the choice of how to fight it kept
   * live between exchanges. Every other prompt is a decision made once; this one is a decision
   * you can change your mind about halfway through, which is the whole reason it pauses.
   *
   * The rival's colours are the same ones its markers fly on the map, so the host you watched
   * march in is visibly the host you are now fighting.
   */
  private showBattle(): void {
    const battle = this.state.ascent?.activeBattle;
    if (!battle) return;

    this.battleItems ??= createMapItemRenderer(this);
    const rival = this.state.kingdoms.find((k) => k.id === battle.kingdomId);
    const rivalColor = rival?.color ?? INK_UI.cinnabar;

    const content = this.promptFrame(
      battle.isGreat
        ? t('ascent.battle.greatTitle', { land: battle.landName })
        : t('ascent.battle.title', { land: battle.landName }),
      t('ascent.battle.subtitle', {
        kingdom: battle.kingdomName,
        round: Math.min(battle.round + 1, battle.totalRounds),
        of: battle.totalRounds,
      }),
    );

    // ── The field ─────────────────────────────────────────────────────────
    const fieldH = 150;
    this.modalLayer.add(this.ui.panel(
      { x: content.x, y: content.y, width: content.width, height: fieldH },
      { border: INK_UI.softBrush },
    ));

    // Formations close on each other as the exchanges run, so progress is legible at a glance
    // without reading a single number.
    const closed = battle.totalRounds > 0 ? Math.min(1, battle.round / battle.totalRounds) : 0;
    const midX = content.x + content.width / 2;
    const gap = 92 - closed * 34;

    const ours = this.battleItems.createArmyMarker(battle.ourNow, true);
    ours.setPosition(midX - gap, content.y + 92);
    this.modalLayer.add(ours);

    const theirs = this.battleItems.createArmyMarker(battle.theirNow, false, rivalColor);
    theirs.setPosition(midX + gap, content.y + 92);
    this.modalLayer.add(theirs);

    // A clash mark between them once blows have actually been traded.
    if (battle.round > 0) {
      this.modalLayer.add(this.ui.label(midX, content.y + 52, t('ascent.battle.clash'), 'label', {
        fontSize: '20px', align: 'center',
      }).setOrigin(0.5));
    }

    // ── Strength bars ─────────────────────────────────────────────────────
    // On their own ground: these sat directly on the dimmed map, where dark numbers on a dark
    // scrim were the least readable thing on the screen.
    const readoutY = content.y + fieldH + 8;
    const logLines = Math.min(3, battle.log.length);
    const readoutH = 44 + logLines * 18;
    this.modalLayer.add(this.ui.panel(
      { x: content.x, y: readoutY, width: content.width, height: readoutH },
      { border: INK_UI.softBrush },
    ));

    const barY = readoutY + 8;
    const barW = (content.width - 36) / 2;
    const bar = (x: number, now: number, start: number, color: number, label: string): void => {
      this.modalLayer.add(this.ui.label(x, barY, label, 'caption', {}));
      this.modalLayer.add(this.ui.label(x + barW, barY, `${now}`, 'label', { fontSize: '15px', align: 'right' })
        .setOrigin(1, 0));
      this.modalLayer.add(this.ui.statBar({ x, y: barY + 22, width: barW, height: 8 }, now, Math.max(1, start), color));
    };
    bar(content.x + 12, battle.ourNow, battle.ourStart, INK_UI.jade, t('ascent.battle.ours'));
    bar(content.x + barW + 24, battle.theirNow, battle.theirStart, rivalColor, battle.kingdomName);

    // ── The exchange log ──────────────────────────────────────────────────
    let y = barY + 36;
    for (const line of battle.log.slice(-3)) {
      this.modalLayer.add(this.ui.label(content.x + 12, y, line, 'caption', {
        wordWrap: { width: content.width - 24 },
      }));
      y += 18;
    }

    // ── Controls ──────────────────────────────────────────────────────────
    const rowH = 56;
    let optY = readoutY + readoutH + 10;
    const control = (id: string, accent: number, badge?: string): void => {
      this.modalLayer.add(this.optionCard(
        { x: content.x, y: optY, width: content.width, height: rowH },
        {
          icon: iconForOption(id),
          title: t(`ascent.battle.${id}` as Parameters<typeof t>[0]),
          body: t(`ascent.battle.${id}D` as Parameters<typeof t>[0]),
          badge,
          accent,
          onTap: () => this.choose(id),
        },
      ));
      optY += rowH + 8;
    };

    const pressing = battle.posture === 'press';
    control('press', pressing ? INK_UI.gold : INK_UI.softBrush, pressing ? t('ascent.battle.current') : undefined);
    control('hold', !pressing ? INK_UI.gold : INK_UI.softBrush, !pressing ? t('ascent.battle.current') : undefined);
    control('retreat', INK_UI.cinnabar);
    control('auto', INK_UI.softBrush);
  }

  private showRivalDemand(prompt: Extract<AscentPrompt, { kind: 'rival-demand' }>): void {
    const kingdom = this.state.kingdoms.find((candidate) => candidate.id === prompt.kingdomId);
    const standing = kingdom ? realmStanding(this.state, kingdom) : 'even';

    const title = prompt.demand === 'tribute'
      ? t('ascent.rival.tributeTitle', { kingdom: prompt.kingdomName })
      : prompt.demand === 'coalition'
        ? t('ascent.rival.coalitionTitle')
        : t('ascent.rival.vassalTitle', { kingdom: prompt.kingdomName });

    const body = prompt.demand === 'tribute'
      ? t('ascent.rival.tributeBody')
      : prompt.demand === 'coalition'
        ? t('ascent.rival.coalitionBody', {
            members: (prompt.memberNames ?? []).join(', '),
            ticks: prompt.ticks ?? 0,
          })
        : t('ascent.rival.vassalBody');

    const content = this.promptFrame(
      title,
      `${body}
${t(`ascent.rival.standing.${standing}` as Parameters<typeof t>[0])}`,
    );

    const rowHeight = 80;
    const cards: Phaser.GameObjects.Container[] = [];
    prompt.options.forEach((option, index) => {
      const gold = option.cost?.gold ?? prompt.gold ?? 0;
      const label = t(`ascent.rival.${option.id === 'buy-off' ? 'buyOff' : option.id}` as Parameters<typeof t>[0]);
      const detail = t(
        `ascent.rival.${option.id === 'buy-off' ? 'buyOff' : option.id}D` as Parameters<typeof t>[0],
        { gold, ticks: prompt.ticks ?? TRIBUTE_REFUSE_TICKS },
      );

      cards.push(this.optionCard(
        { x: content.x, y: content.y + index * (rowHeight + 10), width: content.width, height: rowHeight },
        {
          icon: iconForOption(option.id),
          title: label,
          body: detail,
          note: option.cost?.gold
            ? (option.affordable ? formatResourceList(option.cost) : t('ascent.response.cantAfford'))
            : undefined,
          noteColor: option.affordable ? undefined : '#e08a7c',
          // Defiance is the red option: free now, paid for on the wave curve.
          accent: !option.affordable
            ? INK_UI.softBrush
            : option.id === 'refuse' || option.id === 'defy' || option.id === 'endure'
              ? INK_UI.cinnabar
              : INK_UI.gold,
          disabled: !option.affordable,
          onTap: () => this.choose(option.id),
        },
      ));
    });
    staggerIn(this, cards);
  }

  private showEmpireResponse(prompt: Extract<AscentPrompt, { kind: 'empire-response' }>): void {
    const content = this.promptFrame(
      t('ascent.response.title', { kingdom: prompt.kingdomName }),
      t('ascent.response.subtitle', { ticks: prompt.ticksToArrival, threat: Math.round(prompt.threat) }),
    );

    // Taller than the other prompts' rows: these titles name a commander and can wrap, and the
    // body carries both a cost and an effect.
    const rowHeight = 96;
    const cards: Phaser.GameObjects.Container[] = [];

    // Each row carries the *axis* it acts on as a badge — this battle, every battle after it,
    // the next one, or no battle at all. Five answers that differ in kind were reading as one
    // because every row led with a win percentage, and those percentages sat within five points
    // of each other. The badge is what makes the card scannable as a real choice; the odds now
    // appear only on the two options that genuinely move this battle.
    const AXIS: Record<string, string> = {
      'send-host': t('ascent.response.axisNext'),
      'hire-mercenaries': t('ascent.response.axisNow'),
      fortify: t('ascent.response.axisPermanent'),
      'buy-off': t('ascent.response.axisNoBattle'),
      endure: t('ascent.response.axisNow'),
    };

    /**
     * How the odds read on a row.
     *
     * `resolveInvaderBattle` is a threshold with a ±10% roll, not a coin flip, so its honest
     * answer is usually a certainty. Printing "100% to hold" and "0% to hold" is technically
     * right and reads like a bug; saying it plainly is both truer to the model and a far
     * clearer instruction — the whole question on this card is which side of the line the
     * realm ends up on, and which purchase moves it there.
     */
    const oddsLabel = (pct: number | undefined): string => {
      if (pct === undefined) return '';
      if (pct >= 100) return t('ascent.response.willHold');
      if (pct <= 0) return t('ascent.response.willFall');
      return t('ascent.response.oddsPct', { pct });
    };

    prompt.options.forEach((option, index) => {
      const commander = responseCommanderName(this.state, option.heroId);
      let title: string;
      let body: string;

      switch (option.id) {
        case 'send-host':
          // The commander is named on the option itself: choosing who leads and raising the
          // host are one decision on one screen, never a trip to a hero roster.
          title = commander
            ? t('ascent.response.sendHost', { hero: commander })
            : t('ascent.response.sendHostNoHero');
          body = t('ascent.response.sendHostD', {
            supplies: option.cost?.supplies ?? 0,
            n: option.soldiers ?? 0,
          });
          break;
        case 'hire-mercenaries':
          title = t('ascent.response.mercenaries');
          body = t('ascent.response.mercenariesD', {
            gold: option.cost?.gold ?? 0,
            odds: oddsLabel(option.winChance),
          });
          break;
        case 'fortify':
          title = t('ascent.response.fortify');
          body = t('ascent.response.fortifyD', {
            gold: option.cost?.gold ?? 0,
            def: option.defence ?? 0,
            odds: oddsLabel(option.winChance),
          });
          break;
        case 'buy-off':
          title = t('ascent.response.buyOff');
          body = t('ascent.response.buyOffD', { gold: option.cost?.gold ?? 0, ticks: option.delayTicks ?? 0 });
          break;
        default:
          title = t('ascent.response.endure');
          body = t('ascent.response.endureD', { xp: option.momentum ?? 0, odds: oddsLabel(option.winChance) });
          break;
      }

      cards.push(this.optionCard(
        { x: content.x, y: content.y + index * (rowHeight + 10), width: content.width, height: rowHeight },
        {
          icon: iconForOption(option.id),
          title,
          body,
          badge: AXIS[option.id],
          note: option.affordable ? undefined : t('ascent.response.cantAfford'),
          // Buying the wave away is the one row that ends the threat outright, so it reads as
          // the safe choice; enduring takes the hit on purpose, so it reads as the risky one.
          accent: !option.affordable
            ? INK_UI.softBrush
            : option.id === 'buy-off'
              ? INK_UI.jade
              : option.id === 'endure'
                ? INK_UI.cinnabar
                : INK_UI.gold,
          disabled: !option.affordable,
          onTap: () => this.choose(option.id),
        },
      ));
    });
    staggerIn(this, cards);
  }

  private showWaveResult(prompt: Extract<AscentPrompt, { kind: 'wave-result' }>): void {
    const content = this.promptFrame(
      prompt.survived ? t('ascent.wave.bossTitle', { wave: prompt.wave }) : t('ascent.wave.bossTitleLost'),
      prompt.lines.filter(Boolean).join('\n'),
    );

    this.modalLayer.add(this.ui.button(
      { x: content.x, y: content.y + 40, width: content.width, height: 46 },
      t('ascent.wave.continue'),
      () => this.choose('ok'),
      { variant: 'primary', fontSize: '14px' },
    ));
  }

  private showFounder(prompt: Extract<AscentPrompt, { kind: 'founder' }>): void {
    const codex = codexProgress();
    const content = this.promptFrame(
      t('ascent.founder.title'),
      `${t('ascent.founder.subtitle')}\n${t('ascent.codex.subtitle', codex)}`,
    );

    const cardHeight = 116;
    const cards: Phaser.GameObjects.Container[] = [];
    prompt.options.forEach((heroId, index) => {
      const hero = this.state.heroDeck.find((candidate) => candidate.id === heroId);
      if (!hero) return;
      const tier = tierForHero(hero);
      const card = this.optionCard(
        { x: content.x, y: content.y + index * (cardHeight + 10), width: content.width, height: cardHeight },
        {
          title: heroName(hero),
          body: `${heroTypeLabel(hero.type)}  ·  ${rarityLabel(hero.rarity)}`,
          note: this.heroStatLine(hero),
          badge: t(`ascent.rarity.${tier}` as Parameters<typeof t>[0]),
          accent: RARITY_COLOR[tier],
          reserveRight: PORTRAIT_W + 14,
          onTap: () => this.choose(heroId),
        },
      );
      card.add(renderHeroFaceInBox(this, hero, {
        x: content.width - PORTRAIT_W - 12,
        y: PORTRAIT_TOP,
        width: PORTRAIT_W,
        height: cardHeight - PORTRAIT_TOP - 8,
      }));
      cards.push(card);
    });
    staggerIn(this, cards);
  }

  /**
   * The summary. This is the screen that has to sell the *next* run, and it was the least
   * readable screen in the game: seven dim rows of brown-on-brown sitting directly on the
   * dimmed map, ending in one button back to the menu. Nothing named what had killed you,
   * nothing compared the run to your best, and nothing hinted that banked Legacy buys
   * permanent upgrades — so a loss taught the player nothing and offered them nothing.
   *
   * Now: a panel so the text has its own ground, the cause of death in plain words, the score
   * against the record you are chasing, what the run banked and what that is nearly enough to
   * buy, and a one-tap way back in.
   */
  private showRunOver(prompt: Extract<AscentPrompt, { kind: 'run-over' }>): void {
    const ascent = this.state.ascent;
    const beatBest = prompt.score > prompt.previousBest;

    const content = this.promptFrame(
      t('ascent.over.title'),
      prompt.cause === 'capital'
        ? t('ascent.over.causeCapital', { land: prompt.landName ?? '', waves: ascent?.wavesSurvived ?? 0 })
        : t('ascent.over.causeAnnihilated', { waves: ascent?.wavesSurvived ?? 0 }),
    );

    // ── The headline: this run against the record ───────────────────────────
    const headHeight = 78;
    const head = this.ui.panel(
      { x: content.x, y: content.y, width: content.width, height: headHeight },
      { border: beatBest ? INK_UI.gold : INK_UI.softBrush, borderWidth: 2 },
    );
    this.modalLayer.add(head);
    this.modalLayer.add(this.ui.label(content.x + 16, content.y + 12,
      beatBest ? t('ascent.over.newBest') : t('ascent.over.scoreLabel'), 'caption', {}));
    this.modalLayer.add(this.ui.label(content.x + 16, content.y + 30,
      prompt.score.toLocaleString('en-US'), 'label', { fontSize: '30px' }));
    this.modalLayer.add(this.ui.label(content.x + content.width - 16, content.y + 34,
      t('ascent.over.best', { best: Math.max(prompt.previousBest, prompt.score).toLocaleString('en-US') }),
      'caption', { align: 'right' }).setOrigin(1, 0));

    // ── What the run was made of ────────────────────────────────────────────
    const rows: Array<[string, string]> = [
      [t('ascent.over.waves'), String(ascent?.wavesSurvived ?? 0)],
      [t('ascent.over.peakPower'), Math.round(ascent?.peakPower ?? 0).toLocaleString('en-US')],
      [t('ascent.over.lands'), String(this.state.campaignScore?.peakLandsHeld ?? 0)],
      [t('ascent.over.heroes'), String(ascent?.heroesSummoned ?? 0)],
      [t('ascent.over.cards'), String(Object.values(ascent?.cardStacks ?? {}).reduce((a, b) => a + b, 0))],
    ];
    const bodyY = content.y + headHeight + 10;
    const bodyHeight = rows.length * 26 + 20;
    this.modalLayer.add(this.ui.panel(
      { x: content.x, y: bodyY, width: content.width, height: bodyHeight },
      { border: INK_UI.softBrush },
    ));
    rows.forEach(([label, value], index) => {
      this.modalLayer.add(this.ui.infoRow(
        { x: content.x + 14, y: bodyY + 12 + index * 26, width: content.width - 28, height: 22 },
        label, value,
      ));
    });

    // ── Legacy: the reason to press the button ──────────────────────────────
    const legacyY = bodyY + bodyHeight + 10;
    const nextPerk = LEGACY_PERKS
      .filter((perk) => !ownsPerk(perk.id))
      .sort((a, b) => a.cost - b.cost)[0];
    const legacyHeight = nextPerk ? 74 : 50;
    this.modalLayer.add(this.ui.panel(
      { x: content.x, y: legacyY, width: content.width, height: legacyHeight },
      { border: INK_UI.gold, borderWidth: 2 },
    ));
    this.modalLayer.add(this.ui.label(content.x + 14, legacyY + 10,
      t('ascent.over.legacyEarned', { earned: prompt.legacyEarned, total: prompt.legacyTotal }), 'label', {
        fontSize: '13px', wordWrap: { width: content.width - 28 },
      }));
    if (nextPerk) {
      const short = Math.max(0, nextPerk.cost - prompt.legacyTotal);
      this.modalLayer.add(this.ui.label(content.x + 14, legacyY + 32,
        short > 0
          ? t('ascent.over.perkShort', { perk: t(`empire.legacy.perk.${nextPerk.id}` as Parameters<typeof t>[0]), short })
          : t('ascent.over.perkReady', { perk: t(`empire.legacy.perk.${nextPerk.id}` as Parameters<typeof t>[0]) }),
        'caption', { wordWrap: { width: content.width - 28 } }));
      this.modalLayer.add(this.ui.statBar(
        { x: content.x + 14, y: legacyY + legacyHeight - 14, width: content.width - 28, height: 6 },
        Math.min(prompt.legacyTotal, nextPerk.cost), nextPerk.cost, INK_UI.gold,
      ));
    }

    // ── Back in, or out to spend ────────────────────────────────────────────
    const buttonY = legacyY + legacyHeight + 14;
    this.modalLayer.add(this.ui.button(
      { x: content.x, y: buttonY, width: content.width, height: 46 },
      t('ascent.over.again'),
      () => this.events.emit('ui:restart-ascent'),
      { variant: 'primary', fontSize: '15px' },
    ));
    this.modalLayer.add(this.ui.button(
      { x: content.x, y: buttonY + 54, width: content.width, height: 40 },
      t('ascent.over.return'),
      () => this.events.emit('ui:exit-to-menu'),
      { fontSize: '13px' },
    ));
  }

  // ── Persistent controls ───────────────────────────────────────────────────
  //
  // Pause, Codex and Leave used to be three small floating buttons in the bottom-right
  // corner. They now live on the shared `ActionBar` alongside the three system lanes, so
  // this mode has the same standing bottom bar as the classic ones — and, critically, the
  // player always has somewhere to *go* rather than only cards to answer.

  /** The permanent collection — the reason summoning a new champion is worth something. */
  showCodex(): void {
    this.modalLayer.removeAll(true);
    this.openPromptKey = 'codex';

    const progress = codexProgress();
    const content = this.promptFrame(
      t('ascent.codex.title'),
      `${t('ascent.codex.subtitle', progress)}\n${t('ascent.codex.hint')}`,
    );

    const unlocked = new Set(getCodex().unlocked);
    const scroll = this.ui.scrollArea({
      x: content.x,
      y: content.y,
      width: content.width,
      height: content.height - 58,
    });
    scroll.addTo(this.modalLayer);
    this.activeScrollAreas.push(scroll);

    let y = 0;
    for (const hero of heroTemplates) {
      const known = unlocked.has(hero.id);
      const tier = tierForHero(hero);
      const row = this.ui.card({ x: 0, y, width: content.width - 6, height: 54 }, {
        title: known ? heroName(hero) : '???',
        subtitle: known ? `${heroTypeLabel(hero.type)} · ${rarityLabel(hero.rarity)}` : t('ascent.codex.locked'),
        border: known ? RARITY_COLOR[tier] : INK_UI.softBrush,
        muted: !known,
      });
      scroll.content.add(row);
      y += (row.getData('cardHeight') as number ?? 54) + 8;
    }
    scroll.setContentHeight(Math.max(content.height - 58, y));

    this.modalLayer.add(this.ui.button(
      { x: content.x, y: content.y + content.height - 46, width: content.width, height: 42 },
      t('ascent.codex.close'),
      () => this.closeOverlay(),
      { variant: 'primary', fontSize: '13px' },
    ));
  }

  /** Leaving mid-run saves first, so Continue on the menu resumes exactly here. */
  private showQuitConfirm(): void {
    this.modalLayer.removeAll(true);
    this.openPromptKey = 'quit';

    const content = this.promptFrame(t('ascent.menu.confirmQuit'), t('ascent.menu.confirmQuitBody'));

    this.modalLayer.add(this.ui.button(
      { x: content.x, y: content.y, width: content.width, height: 46 },
      t('ascent.menu.quitConfirm'),
      () => this.events.emit('ui:exit-to-menu', true),
      { variant: 'primary', fontSize: '14px' },
    ));
    this.modalLayer.add(this.ui.button(
      { x: content.x, y: content.y + 58, width: content.width, height: 44 },
      t('ascent.menu.quitCancel'),
      () => this.closeOverlay(),
      { variant: 'ghost', fontSize: '13px' },
    ));
  }

  /** Closes a chrome overlay (Codex / quit) without touching the prompt queue. */
  private closeOverlay(): void {
    for (const scroll of this.activeScrollAreas) scroll.destroy();
    this.activeScrollAreas = [];
    this.modalLayer.removeAll(true);
    this.openPromptKey = '';
    this.refresh();
  }

  // ── Province inspect ──────────────────────────────────────────────────────

  /**
   * Detail for a tapped province, plus the one action it affords.
   *
   * "Select land, then choose how to take it" is the literal shape of the Conquer lane, so a
   * province the realm does not hold gets a button straight into its method sheet — the same
   * prompt the scheduler raises on its own clock, reached the direct way.
   */
  /**
   * Top edge of the province inspect card, or `undefined` when none is shown. Sits clear of
   * the action bar; a province the realm does not hold is taller because it carries the
   * "ways in" button. Shared with the map controls so the two never overlap.
   */
  private inspectCardTop(): number | undefined {
    const land = this.state.lands.find((candidate) => candidate.id === this.state.selectedLandId);
    if (!land || this.state.pendingAscentPrompt) return undefined;
    const mine = land.ownerId === PLAYER_KINGDOM_ID;
    return GAME_HEIGHT - ACTION_BAR_HEIGHT - (mine ? 90 : 134);
  }

  private renderInspect(): void {
    for (const object of this.inspectObjects) object.destroy();
    this.inspectObjects = [];

    const land = this.state.lands.find((candidate) => candidate.id === this.state.selectedLandId);
    if (!land || this.state.pendingAscentPrompt) return;

    const mine = land.ownerId === PLAYER_KINGDOM_ID;
    const cardY = this.inspectCardTop() ?? 0;

    const card = this.ui.card(
      { x: 14, y: cardY, width: GAME_WIDTH - 28, height: 78 },
      {
        title: land.name,
        subtitle: `${t('ascent.march.garrison', { value: Math.round(land.defense * 16 + land.localSoldiers * 2.5) })}`,
        rows: [
          { label: t('resource.gold'), value: String(Math.round(land.outputs.gold)) },
          { label: t('resource.food'), value: String(Math.round(land.outputs.food)) },
        ],
        border: mine ? INK_UI.jade : INK_UI.softBrush,
      },
    );
    card.setDepth(120);
    this.inspectObjects.push(card);

    if (mine) return;

    const claim = this.ui.button(
      { x: 14, y: cardY + 86, width: GAME_WIDTH - 28, height: 38 },
      t('ascent.conquer.claimThis', { land: land.name }),
      () => this.events.emit('ui:ascent-conquer', land.id),
      { variant: 'primary', fontSize: '13px' },
    );
    claim.setDepth(120);
    this.inspectObjects.push(claim);
  }
}
