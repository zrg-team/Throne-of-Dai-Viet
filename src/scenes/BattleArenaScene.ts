import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, PLAYER_KINGDOM_ID } from '../game/constants';
import { createAscentGameState } from '../state/GameState';
import { beginBattle } from '../systems/ascent/BattleSystem';
import type {
  Army, AscentBattleRecord, GameState, KingdomPersonality, Land, TerrainSummary,
} from '../state/types';
import { InkUI, INK_UI, scrollGestureConsumedTap, type InkScrollArea } from '../ui/InkUI';
import { createLabel } from '../ui/theme';
import { createMapRenderer, type MapRenderer } from '../ui/MapRenderer';
import { t } from '../i18n';
import { applyRenderScale } from '../game/graphicsQuality';

/**
 * The fight, on its own, with the dials exposed.
 *
 * Verifying a change to the battle meant playing Dragon Ascent until one happened to open —
 * measured, that is nine engagements in a hundred and sixty ticks, three quarters of them
 * walkovers, and no way at all to ask for the matchup you wanted to see. Every harness in
 * `test_scripts/` that touches the fight begins by driving a whole run forward until one starts,
 * which is a lot of machinery to answer "is this good yet".
 *
 * So: pick two hosts, pick the ground, pick who is across from you, and fight it. The result
 * comes back here so the next matchup is one tap away.
 *
 * **It runs the real fight.** `beginBattle`, `fightRound`, `advanceBattle` and the battle screen
 * itself are the ones the mode uses, on the same clock, through `ConquestScene`. An arena with
 * its own copy of the combat model would verify the copy. The only concessions are three
 * one-line guards — `worthWatching` and `raiseGarrisonLevy` step aside, and `advanceAscentTick`
 * runs the fight without the run around it — each of which exists so the matchup you dialled in
 * is the matchup you get.
 */

/** A step on one of the arena's dials. `value` is what the state gets; `label` is what you tap. */
interface Choice<T> {
  value: T;
  label: string;
}

type ArmSpread = { archers: number; heavy: number };

export class BattleArenaScene extends Phaser.Scene {
  private ui!: InkUI;
  private mapRenderer!: MapRenderer;
  /** Everything this screen drew, so a re-render can take it all down again. */
  private layer!: Phaser.GameObjects.Container;
  private content: Phaser.GameObjects.GameObject[] = [];
  private scroll?: InkScrollArea;

  private ourMen = 900;
  // Defaults must be steps the dials actually offer, or the row opens with nothing lit and the
  // player cannot tell whether the setting is unset or simply invisible.
  private theirMen = 1500;
  private ourArms: ArmSpread = { archers: 0.25, heavy: 0.15 };
  private theirArms: ArmSpread = { archers: 0.25, heavy: 0.15 };
  private ground: keyof TerrainSummary = 'plains';
  private doctrine: KingdomPersonality = 'aggressive';
  private martial = 70;
  /** The last fight fought here, so the arena is a loop rather than a one-shot. */
  private last?: AscentBattleRecord;

  constructor() {
    super('BattleArenaScene');
  }

  init(data?: { result?: AscentBattleRecord }): void {
    if (data?.result) this.last = data.result;
  }

  create(): void {
    applyRenderScale(this);
    this.ui = new InkUI(this);
    this.mapRenderer = createMapRenderer(this);
    this.mapRenderer.drawBackground(GAME_WIDTH, GAME_HEIGHT);
    this.layer = this.add.container(0, 0);
    this.render();
  }

  // ── the dials ─────────────────────────────────────────────────────────────

  private sizes(): Array<Choice<number>> {
    return [
      { value: 300, label: '300' },
      { value: 600, label: '600' },
      { value: 900, label: '900' },
      { value: 1500, label: '1.5k' },
      { value: 2400, label: '2.4k' },
    ];
  }

  private arms(): Array<Choice<ArmSpread>> {
    return [
      { value: { archers: 0.10, heavy: 0.10 }, label: t('arena.arms.spears') },
      { value: { archers: 0.25, heavy: 0.15 }, label: t('arena.arms.balanced') },
      { value: { archers: 0.50, heavy: 0.10 }, label: t('arena.arms.bows') },
      { value: { archers: 0.12, heavy: 0.40 }, label: t('arena.arms.heavy') },
    ];
  }

  /**
   * The four grounds a fight can be had on, at the multipliers they actually produce.
   *
   * Not invented numbers: `terrainDefenseMultiplier` reads `land.terrainSummary` and returns
   * `1 + min(0.35, rugged * 0.5)`, so 1.35 is the ceiling and a dial offering more would be
   * lying. A province made entirely of one terrain gives 1.00 / 1.20 / 1.30 / 1.35.
   */
  private grounds(): Array<Choice<keyof TerrainSummary>> {
    return [
      { value: 'plains', label: t('arena.ground.open') },
      { value: 'forest', label: t('arena.ground.rough') },
      { value: 'hills', label: t('arena.ground.hills') },
      { value: 'mountains', label: t('arena.ground.pass') },
    ];
  }

  private doctrines(): Array<Choice<KingdomPersonality>> {
    return [
      { value: 'aggressive', label: t('arena.doctrine.aggressive') },
      { value: 'defensive', label: t('arena.doctrine.defensive') },
      { value: 'economic', label: t('arena.doctrine.cautious') },
    ];
  }

  private generals(): Array<Choice<number>> {
    return [
      { value: 0, label: t('arena.general.none') },
      { value: 40, label: '40' },
      { value: 70, label: '70' },
      { value: 95, label: '95' },
    ];
  }

  // ── layout ────────────────────────────────────────────────────────────────

  /**
   * Two armies facing each other, then three dials, then the order to fight.
   *
   * The first version was seven identical rows of pills stacked down the screen — a settings
   * form, not a screen about a battle. It had no hierarchy, the thing you were actually building
   * (the matchup) was a grey line of small text at the bottom, and on a short device the last row
   * was sliced in half by the action button.
   *
   * So the two hosts are drawn side by side as opposed columns, which is what they are, with the
   * headcount as the largest thing on the screen and the odds stated between them. The three
   * settings that belong to the fight rather than to either side sit underneath. It fits without
   * scrolling on a 620-high screen, and the scroll behind it is a safety net rather than the
   * layout.
   */
  private render(): void {
    this.clearContent();
    let y = 20;

    const title = createLabel(this, GAME_WIDTH / 2, y, t('arena.title'), 'title', {
      fontSize: '22px', align: 'center',
    }).setOrigin(0.5, 0);
    this.push(title);
    y += title.height + 2;

    const blurb = createLabel(this, GAME_WIDTH / 2, y, t('arena.blurb'), 'caption', {
      fontSize: '11px', align: 'center', wordWrap: { width: GAME_WIDTH - 56 },
    }).setOrigin(0.5, 0);
    this.push(blurb);
    y += blurb.height + 10;

    // The buttons are placed first, so the body knows exactly how much room it is allowed.
    const pinnedBackY = GAME_HEIGHT - 54;
    const fightY = pinnedBackY - 60;

    const body = this.add.container(0, 0);
    let by = 0;

    by = this.renderForces(body, by);
    by = this.renderOdds(body, by);

    by = this.row(body, by, t('arena.ground'), this.grounds(), (c) => c.value === this.ground,
      (c) => { this.ground = c.value; this.render(); });
    by = this.row(body, by, t('arena.doctrine'), this.doctrines(), (c) => c.value === this.doctrine,
      (c) => { this.doctrine = c.value; this.render(); });
    by = this.row(body, by, t('arena.general'), this.generals(), (c) => c.value === this.martial,
      (c) => { this.martial = c.value; this.render(); });

    if (this.last) by = this.renderLastFight(body, by);

    const room = Math.max(120, fightY - y - 10);
    const used = Math.min(room, by + 6);
    this.scroll = this.ui.scrollArea({ x: 20, y, width: GAME_WIDTH - 40, height: used });
    this.scroll.content.add(body);
    this.scroll.setContentHeight(by + 6);
    this.scroll.addTo(this.layer);

    // Just under the dials when they fit, pinned when they do not. Clamped rather than free: the
    // body is clipped to `used`, so nothing can ever reach down and cover the button.
    const actionY = Math.min(y + used + 14, fightY);
    this.push(this.ui.button(
      { x: 28, y: actionY, width: GAME_WIDTH - 56, height: 50 },
      t('arena.fight'), () => this.startFight(), { variant: 'primary', fontSize: '17px' },
    ));
    // Follows the fight button up rather than staying pinned, or a screen whose dials fit leaves
    // sixty pixels of nothing between the two things you can press.
    this.push(this.ui.button(
      { x: 28, y: Math.min(actionY + 60, pinnedBackY), width: GAME_WIDTH - 56, height: 40 },
      t('menu.back'), () => this.scene.start('MenuScene'), { variant: 'secondary', fontSize: '14px' },
    ));
  }

  /** The two hosts, side by side, as the thing the screen is actually about. */
  private renderForces(parent: Phaser.GameObjects.Container, y: number): number {
    const gap = 12;
    const width = Math.floor((GAME_WIDTH - 56 - gap) / 2);
    const left = this.forceColumn(parent, 8, y, width, true);
    const right = this.forceColumn(parent, 8 + width + gap, y, width, false);

    // On the heading line rather than beside the headcounts: down there it sits between a + and
    // a − with four pixels either side, and reads as another control rather than as "against".
    const cross = createLabel(this, 8 + width + gap / 2, y, '✕', 'caption', {
      fontSize: '11px', align: 'center',
    }).setOrigin(0.5, 0);
    parent.add(cross);

    return Math.max(left, right) + 10;
  }

  /** One side: who they are, how many, and what they are carrying. */
  private forceColumn(
    parent: Phaser.GameObjects.Container,
    x: number,
    y: number,
    width: number,
    ours: boolean,
  ): number {
    const heading = createLabel(this, x + width / 2, y, (ours ? t('arena.ourHost') : t('arena.theirHost')).toUpperCase(),
      'caption', { fontSize: '10px', fontStyle: '700', align: 'center' }).setOrigin(0.5, 0);
    parent.add(heading);
    let cursor = y + heading.height + 4;

    // ── headcount, with a stepper either side ──────────────────────────────
    //
    // Five pills for a number is five taps' worth of screen to say one thing. A stepper says it
    // once, large, and leaves room for the arms underneath.
    const stepW = 32;
    const valueW = width - stepW * 2 - 8;
    const rowH = 38;
    const sizes = this.sizes();
    const current = ours ? this.ourMen : this.theirMen;
    const index = Math.max(0, sizes.findIndex((choice) => choice.value === current));

    const step = (delta: number): void => {
      const next = sizes[Math.min(sizes.length - 1, Math.max(0, index + delta))].value;
      if (ours) this.ourMen = next; else this.theirMen = next;
      this.render();
    };

    this.stepButton(parent, x, cursor, stepW, rowH, '−', index > 0, () => step(-1));
    parent.add(this.ui.panel({ x: x + stepW + 4, y: cursor, width: valueW, height: rowH }, {
      border: ours ? INK_UI.jade : INK_UI.softBrush,
    }));
    parent.add(createLabel(this, x + stepW + 4 + valueW / 2, cursor + 9, sizes[index].label, 'label', {
      fontSize: '18px', align: 'center',
    }).setOrigin(0.5, 0));
    this.stepButton(parent, x + stepW + valueW + 8, cursor, stepW, rowH, '+', index < sizes.length - 1, () => step(1));
    cursor += rowH + 6;

    // ── arms, two by two ───────────────────────────────────────────────────
    const arms = this.arms();
    const cellW = Math.floor((width - 5) / 2);
    const chosen = ours ? this.ourArms : this.theirArms;
    const labels = arms.map((choice) => createLabel(this, 0, 0, choice.label, 'caption', {
      fontSize: '11px', align: 'center', wordWrap: { width: cellW - 10 },
    }).setOrigin(0.5, 0));
    const textH = Math.max(...labels.map((entry) => entry.height));
    const cellH = Math.max(28, textH + 12);

    arms.forEach((choice, i) => {
      const cx = x + (i % 2) * (cellW + 5);
      const cy = cursor + Math.floor(i / 2) * (cellH + 5);
      const selected = choice.value.archers === chosen.archers && choice.value.heavy === chosen.heavy;
      parent.add(this.ui.crayonTile({ x: cx, y: cy, width: cellW, height: cellH }, { selected }));
      const text = labels[i];
      text.setPosition(cx + cellW / 2, cy + (cellH - textH) / 2);
      text.setColor(selected ? '#b33a26' : '#2a2118');
      text.setData('tileWidth', cellW);
      parent.add(text);
      const hit = this.add.zone(cx, cy, cellW, cellH).setOrigin(0, 0).setInteractive({ useHandCursor: true });
      hit.on('pointerup', (pointer: Phaser.Input.Pointer) => {
        if (scrollGestureConsumedTap(pointer)) return;
        if (ours) this.ourArms = choice.value; else this.theirArms = choice.value;
        this.render();
      });
      parent.add(hit);
    });

    return cursor + cellH * 2 + 5;
  }

  /** A − or + beside the headcount. Greyed at the ends of the range rather than removed. */
  private stepButton(
    parent: Phaser.GameObjects.Container,
    x: number, y: number, width: number, height: number,
    glyph: string, enabled: boolean, onTap: () => void,
  ): void {
    parent.add(this.ui.crayonTile({ x, y, width, height }, { selected: false }));
    parent.add(createLabel(this, x + width / 2, y + height / 2 - 9, glyph, 'label', {
      fontSize: '17px', align: 'center', color: enabled ? '#2a2118' : '#a9a08c',
    }).setOrigin(0.5, 0));
    if (!enabled) return;
    const hit = this.add.zone(x, y, width, height).setOrigin(0, 0).setInteractive({ useHandCursor: true });
    hit.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (scrollGestureConsumedTap(pointer)) return;
      onTap();
    });
    parent.add(hit);
  }

  /** What the dials add up to, in one sentence, between the two hosts and the settings. */
  private renderOdds(parent: Phaser.GameObjects.Container, y: number): number {
    const odds = this.theirMen / Math.max(1, this.ourMen);
    // Weighed against the ground, because a defender in a mountain pass is not in the fight the
    // raw headcounts describe — which is exactly what the dial is there to let you feel.
    const weighted = odds / this.groundEdge();
    const verdict = weighted < 0.6 ? t('arena.odds.easy')
      : weighted > 1.8 ? t('arena.odds.hard') : t('arena.odds.close');
    const colour = weighted < 0.6 ? '#4c5f45' : weighted > 1.8 ? '#8a2a1b' : '#7d5814';
    const text = createLabel(this, (GAME_WIDTH - 40) / 2 - 12, y + 2,
      t('arena.oddsLine', { odds: odds.toFixed(2), verdict }), 'caption', {
        fontSize: '12px', align: 'center', color: colour, wordWrap: { width: GAME_WIDTH - 76 },
      }).setOrigin(0.5, 0);
    parent.add(text);
    return y + text.height + 12;
  }

  /**
   * One labelled row of choices, for the settings that belong to neither side.
   *
   * Every label is measured before anything is drawn and the tallest one sets the row's height,
   * so a tile is never shorter than the words inside it. Vietnamese is what forces this: at a
   * quarter of the width "Trường thương" does not fit on one line, and printing it anyway ran
   * the text straight out through the tile's border.
   */
  private row<T>(
    parent: Phaser.GameObjects.Container,
    y: number,
    label: string,
    choices: Array<Choice<T>>,
    isSelected: (choice: Choice<T>) => boolean,
    onPick: (choice: Choice<T>) => void,
  ): number {
    const heading = createLabel(this, 8, y, label.toUpperCase(), 'caption', {
      fontSize: '10px', fontStyle: '700',
    });
    parent.add(heading);
    const rowY = y + heading.height + 3;

    const gap = 5;
    const width = Math.floor((GAME_WIDTH - 56 - gap * (choices.length - 1)) / choices.length);

    const labels = choices.map((choice) => createLabel(this, 0, 0, choice.label, 'caption', {
      fontSize: '11px', align: 'center', wordWrap: { width: width - 10 },
    }).setOrigin(0.5, 0));
    const textH = Math.max(...labels.map((entry) => entry.height));
    const height = Math.max(30, textH + 12);

    choices.forEach((choice, index) => {
      const x = 8 + index * (width + gap);
      const selected = isSelected(choice);
      parent.add(this.ui.crayonTile({ x, y: rowY, width, height }, { selected }));

      const text = labels[index];
      text.setPosition(x + width / 2, rowY + (height - textH) / 2);
      text.setColor(selected ? '#b33a26' : '#2a2118');
      // Marked so `verify-arena` can tell a tile's label from the page title and the buttons,
      // which are centred text of similar size and would otherwise fail the width check.
      text.setData('tileWidth', width);
      parent.add(text);

      const hit = this.add.zone(x, rowY, width, height).setOrigin(0, 0).setInteractive({ useHandCursor: true });
      // Without this a drag that happens to end on a tile chooses it, so the list could not be
      // scrolled past without changing the setup on the way through.
      hit.on('pointerup', (pointer: Phaser.Input.Pointer) => {
        if (scrollGestureConsumedTap(pointer)) return;
        onPick(choice);
      });
      parent.add(hit);
    });
    return rowY + height + 9;
  }

  private renderLastFight(parent: Phaser.GameObjects.Container, y: number): number {
    const record = this.last;
    if (!record) return y;
    const outcome = t(`arena.outcome.${record.outcome}` as Parameters<typeof t>[0]);
    const card = this.ui.card({ x: 8, y, width: GAME_WIDTH - 56, height: 70 }, {
      title: t('arena.lastFight', { outcome }),
      body: t('arena.lastFightBody', {
        rounds: record.rounds,
        ourLost: Math.max(0, record.ourStart - record.ourEnd),
        theirLost: Math.max(0, record.theirStart - record.theirEnd),
      }),
      border: record.outcome === 'they-rout' ? INK_UI.jade : INK_UI.cinnabar,
    });
    parent.add(card);
    return y + (card.getData('cardHeight') as number) + 10;
  }

  private armLabel(spread: ArmSpread): string {
    return this.arms().find((c) => c.value.archers === spread.archers && c.value.heavy === spread.heavy)?.label
      ?? this.arms()[1].label;
  }


  // ── building the fight ────────────────────────────────────────────────────

  /**
   * A state that exists to fight once.
   *
   * Built off `createAscentGameState` rather than by hand: the fight reads court modifiers,
   * kingdom personalities, terrain helpers and the hero roster, and a hand-rolled state would
   * quietly differ from a real one in exactly the places that decide a battle.
   */
  private buildArenaState(): GameState {
    const state = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
    state.ascent!.arena = true;
    state.isPaused = false;
    state.isStrategyPause = false;
    state.pendingAscentPrompt = undefined;

    const land = state.lands.find((candidate) => candidate.ownerId === PLAYER_KINGDOM_ID)
      ?? state.lands[0];
    // The ground is a dial here, so it is written onto the province the fight is fought on and
    // read back by `terrainDefenseMultiplier` exactly as any other province's would be.
    this.applyGround(land);

    const rival = state.kingdoms.find((kingdom) => kingdom.id !== PLAYER_KINGDOM_ID);
    if (rival) rival.personality = this.doctrine;

    // Nobody else on the field: relief marching in from a neighbouring province would answer a
    // question the player did not ask.
    state.armies = [];
    state.movementOrders = [];
    state.siegeOrders = [];

    const ours = this.makeHost('arena-ours', PLAYER_KINGDOM_ID, land.id, this.ourMen, this.ourArms);
    if (this.martial > 0) {
      const general = state.heroes[0];
      if (general) {
        general.stats.martial = this.martial;
        ours.generalHeroId = general.id;
      }
    }
    const theirs = this.makeHost('arena-theirs', rival?.id ?? 'northern-rival', land.id, this.theirMen, this.theirArms);
    state.armies.push(ours, theirs);

    state.pendingBattle = {
      invaderArmyId: theirs.id,
      landId: land.id,
      landName: land.name,
      kingdomId: theirs.kingdomId,
      kingdomName: rival?.name ?? 'Rival',
      isGreat: false,
      attackerPower: 0,
      defenderPower: 0,
    };

    // Open it here rather than leaving it to the first economy tick. The arena is a fight and
    // nothing else, so 3.5 seconds of staring at a map waiting for it to start is 3.5 seconds
    // of nothing — and the screen opens itself the moment `activeBattle` exists.
    beginBattle(state);
    return state;
  }

  /** Writes the chosen ground onto the province, so the fight reads it the ordinary way. */
  private applyGround(land: Land): void {
    const summary: TerrainSummary = {
      plains: 0, fields: 0, riceFields: 0, forest: 0,
      mountains: 0, hills: 0, water: 0, fortress: 0, shrine: 0,
    };
    summary[this.ground] = 12;
    land.terrainSummary = summary;
  }

  /** What the chosen ground is worth, by the same formula the fight will use. */
  private groundEdge(): number {
    const rugged = this.ground === 'mountains' ? 1
      : this.ground === 'hills' ? 0.6
        : this.ground === 'forest' ? 0.4 : 0;
    return 1 + Math.min(0.35, rugged * 0.5);
  }

  private makeHost(id: string, kingdomId: string, landId: string, men: number, arms: ArmSpread): Army {
    const archers = Math.round(men * arms.archers);
    const heavyInfantry = Math.round(men * arms.heavy);
    return {
      id,
      kingdomId,
      landId,
      name: id === 'arena-ours' ? t('arena.ourHost') : t('arena.theirHost'),
      units: { spearmen: men - archers - heavyInfantry, archers, heavyInfantry },
      morale: 85,
      supply: 90,
      level: 2,
      experience: 0,
      experienceToNextLevel: 160,
      rations: 999,
      provisions: 999,
      autoDefend: false,
    };
  }

  private startFight(): void {
    this.scene.start('ConquestScene', { state: this.buildArenaState() });
  }

  private push(item: Phaser.GameObjects.GameObject): void {
    this.layer.add(item);
    this.content.push(item);
  }

  private clearContent(): void {
    this.scroll?.destroy();
    this.scroll = undefined;
    for (const item of this.content) item.destroy();
    this.content = [];
  }
}
