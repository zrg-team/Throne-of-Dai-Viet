import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, PLAYER_KINGDOM_ID } from '../game/constants';
import { createAscentGameState } from '../state/GameState';
import { beginBattle } from '../systems/ascent/BattleSystem';
import type {
  Army, AscentBattleRecord, GameState, KingdomPersonality, Land, TerrainSummary,
} from '../state/types';
import { InkUI, INK_UI } from '../ui/InkUI';
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
  private content: Phaser.GameObjects.GameObject[] = [];

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

  private render(): void {
    this.clearContent();
    let y = 26;

    const title = createLabel(this, GAME_WIDTH / 2, y, t('arena.title'), 'title', {
      fontSize: '22px', align: 'center',
    }).setOrigin(0.5, 0);
    this.content.push(title);
    y += title.height + 4;

    const blurb = createLabel(this, GAME_WIDTH / 2, y, t('arena.blurb'), 'caption', {
      fontSize: '12px', align: 'center', wordWrap: { width: GAME_WIDTH - 56 },
    }).setOrigin(0.5, 0);
    this.content.push(blurb);
    y += blurb.height + 14;

    y = this.row(y, t('arena.ourHost'), this.sizes(), (c) => c.value === this.ourMen,
      (c) => { this.ourMen = c.value; this.render(); });
    y = this.row(y, t('arena.ourArms'), this.arms(), (c) => c.label === this.armLabel(this.ourArms),
      (c) => { this.ourArms = c.value; this.render(); });
    y = this.row(y, t('arena.theirHost'), this.sizes(), (c) => c.value === this.theirMen,
      (c) => { this.theirMen = c.value; this.render(); });
    y = this.row(y, t('arena.theirArms'), this.arms(), (c) => c.label === this.armLabel(this.theirArms),
      (c) => { this.theirArms = c.value; this.render(); });
    y = this.row(y, t('arena.ground'), this.grounds(), (c) => c.value === this.ground,
      (c) => { this.ground = c.value; this.render(); });
    y = this.row(y, t('arena.doctrine'), this.doctrines(), (c) => c.value === this.doctrine,
      (c) => { this.doctrine = c.value; this.render(); });
    y = this.row(y, t('arena.general'), this.generals(), (c) => c.value === this.martial,
      (c) => { this.martial = c.value; this.render(); });

    // What you have just dialled in, said in one line. Not a prediction — the odds a fight opens
    // on are the thing `probe-fights` measures, and seeing them here is how you set up a fight
    // that is actually in doubt rather than one you have already won.
    const odds = this.theirMen / Math.max(1, this.ourMen);
    // Weighed against the ground, because a defender on a mountain pass is not in the fight the
    // raw headcounts describe — which is exactly the thing the dial is there to let you feel.
    const weighted = odds / this.groundEdge();
    const verdict = weighted < 0.6 ? t('arena.odds.easy')
      : weighted > 1.8 ? t('arena.odds.hard') : t('arena.odds.close');
    const oddsText = createLabel(this, GAME_WIDTH / 2, y + 2,
      t('arena.oddsLine', { odds: odds.toFixed(2), verdict }), 'caption', {
        fontSize: '12px', align: 'center',
      }).setOrigin(0.5, 0);
    this.content.push(oddsText);
    y += oddsText.height + 10;

    if (this.last) y = this.renderLastFight(y);

    const fight = this.ui.button(
      { x: 54, y: Math.min(y + 4, GAME_HEIGHT - 116), width: GAME_WIDTH - 108, height: 50 },
      t('arena.fight'), () => this.startFight(), { variant: 'primary', fontSize: '17px' },
    );
    this.content.push(fight);

    const back = this.ui.button(
      { x: 54, y: GAME_HEIGHT - 58, width: GAME_WIDTH - 108, height: 40 },
      t('menu.back'), () => this.scene.start('MenuScene'), { variant: 'secondary', fontSize: '14px' },
    );
    this.content.push(back);
  }

  /** One labelled row of choices. Returns the y the next row starts at. */
  private row<T>(
    y: number,
    label: string,
    choices: Array<Choice<T>>,
    isSelected: (choice: Choice<T>) => boolean,
    onPick: (choice: Choice<T>) => void,
  ): number {
    const heading = createLabel(this, 28, y, label.toUpperCase(), 'caption', {
      fontSize: '10px', fontStyle: '700',
    });
    this.content.push(heading);
    const rowY = y + heading.height + 2;

    const gap = 5;
    const width = Math.floor((GAME_WIDTH - 56 - gap * (choices.length - 1)) / choices.length);
    const height = 32;
    choices.forEach((choice, index) => {
      const x = 28 + index * (width + gap);
      const selected = isSelected(choice);
      this.content.push(this.ui.crayonTile({ x, y: rowY, width, height }, { selected }));
      this.content.push(createLabel(this, x + width / 2, rowY + 9, choice.label, 'caption', {
        fontSize: '11px', align: 'center',
        color: selected ? '#b33a26' : '#2a2118',
      }).setOrigin(0.5, 0));
      const hit = this.add.zone(x, rowY, width, height).setOrigin(0, 0).setInteractive({ useHandCursor: true });
      hit.on('pointerup', () => onPick(choice));
      this.content.push(hit);
    });
    return rowY + height + 8;
  }

  private renderLastFight(y: number): number {
    const record = this.last;
    if (!record) return y;
    const outcome = t(`arena.outcome.${record.outcome}` as Parameters<typeof t>[0]);
    const card = this.ui.card({ x: 28, y, width: GAME_WIDTH - 56, height: 74 }, {
      title: t('arena.lastFight', { outcome }),
      body: t('arena.lastFightBody', {
        rounds: record.rounds,
        ourLost: Math.max(0, record.ourStart - record.ourEnd),
        theirLost: Math.max(0, record.theirStart - record.theirEnd),
      }),
      border: record.outcome === 'they-rout' ? INK_UI.jade : INK_UI.cinnabar,
    });
    this.content.push(card);
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

  private clearContent(): void {
    for (const item of this.content) item.destroy();
    this.content = [];
  }
}
