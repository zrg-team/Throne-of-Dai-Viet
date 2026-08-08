import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, HEADER_HEIGHT, PLAYER_KINGDOM_ID } from '../game/constants';
import { codexProgress, getCodex, isHeroUnlocked } from '../state/codex';
import { heroTemplates } from '../data/heroes';
import { powerCardView, skipRefundAmount } from '../systems/ascent/PowerDraftSystem';
import { tierForHero } from '../systems/ascent/SummonSystem';
import { responseCommanderName } from '../systems/ascent/WaveDirector';
import { renderHeroFace } from '../ui/FaceRenderer';
import { INK_UI, INK_UI_HEX, InkUI, type InkScrollArea, type UIBounds } from '../ui/InkUI';
import { ASCENT_HUD_HEIGHT, AscentHud } from '../ui/ascent/AscentHud';
import { ResourceBar } from '../ui/ResourceBar';
import { staggerIn } from '../ui/animations';
import { TITLE_FONT, UI_FONT } from '../ui/fonts';
import { heroName, heroTypeLabel, rarityLabel, t } from '../i18n';
import type { AscentPrompt, AscentRarity, GameState, Hero } from '../state/types';

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
 * Every player decision in this mode arrives here as one full-screen prompt. There is no
 * navigation, no action bar, and no screen to go and find.
 */
export class ConquestUIScene extends Phaser.Scene {
  private state!: GameState;
  private ui!: InkUI;
  private hud!: AscentHud;
  private resourceBar!: ResourceBar;
  private modalLayer!: Phaser.GameObjects.Container;
  private inspectObjects: Phaser.GameObjects.GameObject[] = [];
  private controlObjects: Phaser.GameObjects.GameObject[] = [];
  /** Scroll areas register a global wheel handler, so they must be destroyed explicitly. */
  private activeScrollAreas: InkScrollArea[] = [];
  private openPromptKey = '';

  constructor() {
    super('ConquestUIScene');
  }

  init(data: { state: GameState }): void {
    this.state = data.state;
    this.inspectObjects = [];
    this.controlObjects = [];
    this.activeScrollAreas = [];
    this.openPromptKey = '';
  }

  create(): void {
    this.ui = new InkUI(this);
    this.resourceBar = new ResourceBar(this, this.state);
    this.add.existing(this.resourceBar);
    this.resourceBar.setDepth(80);

    this.hud = new AscentHud(this);
    this.modalLayer = this.add.container(0, 0).setDepth(500);

    this.events.on('state-changed', () => this.refresh());
    this.refresh();
  }

  // ── Frame ─────────────────────────────────────────────────────────────────

  refresh(): void {
    if (!this.state.ascent) return;

    this.resourceBar.refresh();
    this.hud.render(this.state.ascent);
    this.renderControls();
    this.renderInspect();

    const prompt = this.state.pendingAscentPrompt;
    const key = prompt ? `${prompt.kind}:${this.promptSignature(prompt)}` : '';
    // Chrome overlays own the modal layer until dismissed; don't let a tick tear them down.
    if (this.openPromptKey === 'codex' || this.openPromptKey === 'quit') return;

    if (key !== this.openPromptKey) {
      this.openPromptKey = key;
      for (const scroll of this.activeScrollAreas) scroll.destroy();
      this.activeScrollAreas = [];
      this.modalLayer.removeAll(true);
      if (prompt) this.renderPrompt(prompt);
    }
  }

  /** Identity of a prompt's *content*, so a reroll re-renders but a tick does not. */
  private promptSignature(prompt: AscentPrompt): string {
    switch (prompt.kind) {
      case 'power-draft': return `${prompt.level}:${prompt.cards.join(',')}:${prompt.rerollCost}`;
      case 'march-order': return prompt.targets.map((target) => target.landId).join(',');
      case 'hero-summon': return prompt.heroIds.join(',');
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
      case 'march-order': this.showMarchOrder(prompt); break;
      case 'hero-summon': this.showHeroSummon(prompt); break;
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
  private optionCard(
    bounds: UIBounds,
    opts: {
      title: string;
      body: string;
      note?: string;
      noteColor?: string;
      accent: number;
      badge?: string;
      disabled?: boolean;
      onTap: () => void;
    },
  ): Phaser.GameObjects.Container {
    const container = this.add.container(bounds.x, bounds.y);
    const alpha = opts.disabled ? 0.45 : 1;

    const surface = this.ui.panel(
      { x: 0, y: 0, width: bounds.width, height: bounds.height },
      { border: opts.accent, borderWidth: 2, muted: opts.disabled },
    );
    container.add(surface);

    container.add(this.add.rectangle(0, 0, 5, bounds.height, opts.accent, alpha).setOrigin(0, 0));

    container.add(this.ui.label(16, 10, opts.title, 'label', {
      fontSize: '14px',
      wordWrap: { width: bounds.width - 32 },
    }).setAlpha(alpha));

    container.add(this.ui.label(16, 32, opts.body, 'body', {
      fontSize: '11px',
      color: INK_UI_HEX.mutedText,
      wordWrap: { width: bounds.width - 32 },
    }).setAlpha(alpha));

    if (opts.note) {
      container.add(this.add.text(16, bounds.height - 20, opts.note, {
        color: opts.noteColor ?? '#4c6b3f',
        fontFamily: UI_FONT,
        fontSize: '11px',
        fontStyle: '700',
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

    this.modalLayer.add(container);
    return container;
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

  private showMarchOrder(prompt: Extract<AscentPrompt, { kind: 'march-order' }>): void {
    // `frontLandId` is cleared the moment a province falls, so it cannot distinguish these
    // cases — keying off how much ground the realm holds does.
    const held = this.state.lands.filter((land) => land.ownerId === PLAYER_KINGDOM_ID).length;
    const content = this.promptFrame(
      t('ascent.march.title'),
      held <= 1 ? t('ascent.march.subtitleFirst') : t('ascent.march.subtitleReady', { held }),
    );

    const rowHeight = 92;
    const cards: Phaser.GameObjects.Container[] = [];
    prompt.targets.forEach((target, index) => {
      const strong = target.winChance >= 60;
      cards.push(this.optionCard(
        { x: content.x, y: content.y + index * (rowHeight + 10), width: content.width, height: rowHeight },
        {
          title: target.landName,
          body: t(`ascent.march.reward.${target.rewardTag}` as Parameters<typeof t>[0]),
          note: `${t('ascent.march.win', { pct: target.winChance })}  ·  ${t('ascent.march.garrison', { value: target.garrison })}`,
          accent: strong ? INK_UI.jade : target.winChance >= 40 ? INK_UI.gold : INK_UI.cinnabar,
          onTap: () => this.choose(target.landId),
        },
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

  private showHeroSummon(prompt: Extract<AscentPrompt, { kind: 'hero-summon' }>): void {
    const content = this.promptFrame(
      t('ascent.summon.title'),
      prompt.pityUsed ? t('ascent.summon.pity') : t('ascent.summon.subtitle'),
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
      // Kept below the badge row: the card adds its badge before this, so a portrait
      // placed level with it would draw straight over the rarity label.
      const face = renderHeroFace(this, hero, content.width - 48, 86, 0.58);
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

  private showEmpireResponse(prompt: Extract<AscentPrompt, { kind: 'empire-response' }>): void {
    const content = this.promptFrame(
      t('ascent.response.title', { kingdom: prompt.kingdomName }),
      t('ascent.response.subtitle', { ticks: prompt.ticksToArrival, threat: Math.round(prompt.threat) }),
    );

    const rowHeight = 86;
    const cards: Phaser.GameObjects.Container[] = [];

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
            pct: option.winChance ?? 0,
          });
          break;
        case 'fortify':
          title = t('ascent.response.fortify');
          body = t('ascent.response.fortifyD', { gold: option.cost?.gold ?? 0, pct: option.winChance ?? 0 });
          break;
        case 'buy-off':
          title = t('ascent.response.buyOff');
          body = t('ascent.response.buyOffD', { gold: option.cost?.gold ?? 0, ticks: option.delayTicks ?? 0 });
          break;
        default:
          title = t('ascent.response.endure');
          body = t('ascent.response.endureD', { xp: option.momentum ?? 0 });
          break;
      }

      cards.push(this.optionCard(
        { x: content.x, y: content.y + index * (rowHeight + 10), width: content.width, height: rowHeight },
        {
          title,
          body,
          note: option.affordable ? undefined : t('ascent.response.cantAfford'),
          accent: option.affordable ? INK_UI.gold : INK_UI.softBrush,
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
          onTap: () => this.choose(heroId),
        },
      );
      card.add(renderHeroFace(this, hero, content.width - 48, 78, 0.56));
      cards.push(card);
    });
    staggerIn(this, cards);
  }

  private showRunOver(prompt: Extract<AscentPrompt, { kind: 'run-over' }>): void {
    const ascent = this.state.ascent;
    const content = this.promptFrame(
      t('ascent.over.title'),
      t('ascent.over.subtitle', { waves: ascent?.wavesSurvived ?? 0 }),
    );

    const rows: Array<[string, string]> = [
      [t('ascent.over.waves'), String(ascent?.wavesSurvived ?? 0)],
      [t('ascent.over.peakPower'), Math.round(ascent?.peakPower ?? 0).toLocaleString('en-US')],
      [t('ascent.over.lands'), String(this.state.campaignScore?.peakLandsHeld ?? 0)],
      [t('ascent.over.heroes'), String(ascent?.heroesSummoned ?? 0)],
      [t('ascent.over.cards'), String(Object.values(ascent?.cardStacks ?? {}).reduce((a, b) => a + b, 0))],
      [t('ascent.over.score'), String(prompt.score)],
      [t('ascent.over.legacy'), `+${prompt.legacyEarned}`],
    ];

    rows.forEach(([label, value], index) => {
      const y = content.y + index * 34;
      this.modalLayer.add(this.ui.infoRow({ x: content.x + 8, y, width: content.width - 16, height: 24 }, label, value));
    });

    this.modalLayer.add(this.ui.button(
      { x: content.x, y: content.y + rows.length * 34 + 24, width: content.width, height: 46 },
      t('ascent.over.return'),
      () => this.events.emit('ui:exit-to-menu'),
      { variant: 'primary', fontSize: '14px' },
    ));
  }

  // ── Persistent controls ───────────────────────────────────────────────────

  /**
   * The only three chrome buttons in the mode: pause, Codex, and leave.
   *
   * Not optional polish — without a way out, a run that never reaches its defeat screen
   * traps the player in the scene with no route back to the menu and no way to save.
   */
  private renderControls(): void {
    for (const object of this.controlObjects) object.destroy();
    this.controlObjects = [];

    // Hidden while a decision is open: the prompt is the only thing to interact with.
    if (this.state.pendingAscentPrompt) return;

    const paused = this.state.isStrategyPause;
    const buttons: Array<{ label: string; variant: 'secondary' | 'ghost'; onClick: () => void }> = [
      {
        label: paused ? t('ascent.ctl.resume') : t('ascent.ctl.pause'),
        variant: paused ? 'secondary' : 'ghost',
        onClick: () => {
          this.state.isStrategyPause = !this.state.isStrategyPause;
          this.refresh();
        },
      },
      { label: t('ascent.ctl.codex'), variant: 'ghost', onClick: () => this.showCodex() },
      { label: t('ascent.ctl.menu'), variant: 'ghost', onClick: () => this.showQuitConfirm() },
    ];

    buttons.forEach((button, index) => {
      const control = this.ui.button(
        { x: GAME_WIDTH - 40 - index * 38, y: GAME_HEIGHT - 44, width: 34, height: 34 },
        button.label,
        button.onClick,
        { variant: button.variant, fontSize: '13px' },
      );
      control.setDepth(140);
      this.controlObjects.push(control);
    });

    if (paused) {
      const banner = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 78, t('ascent.hud.pause'), {
        color: '#f3dd9a',
        fontFamily: UI_FONT,
        fontSize: '12px',
        fontStyle: '700',
        align: 'center',
        backgroundColor: 'rgba(32,38,31,0.78)',
        padding: { x: 8, y: 4 },
      }).setOrigin(0.5).setDepth(140);
      this.controlObjects.push(banner);
    }
  }

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

  /** Read-only detail for a tapped province. Not a menu: nothing here is actionable. */
  private renderInspect(): void {
    for (const object of this.inspectObjects) object.destroy();
    this.inspectObjects = [];

    const land = this.state.lands.find((candidate) => candidate.id === this.state.selectedLandId);
    if (!land || this.state.pendingAscentPrompt) return;

    const card = this.ui.card(
      { x: 14, y: GAME_HEIGHT - 96, width: GAME_WIDTH - 28, height: 78 },
      {
        title: land.name,
        subtitle: `${t('ascent.march.garrison', { value: Math.round(land.defense * 16 + land.localSoldiers * 2.5) })}`,
        rows: [
          { label: t('resource.gold'), value: String(Math.round(land.outputs.gold)) },
          { label: t('resource.food'), value: String(Math.round(land.outputs.food)) },
        ],
        border: land.ownerId === 'dai-viet' ? INK_UI.jade : INK_UI.softBrush,
      },
    );
    card.setDepth(120);
    this.inspectObjects.push(card);
  }
}
