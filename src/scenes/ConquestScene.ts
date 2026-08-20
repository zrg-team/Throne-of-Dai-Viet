import Phaser from 'phaser';
import { ASCENT_TICK_MS } from '../game/ascentConfig';
import { INK_UI } from '../ui/InkUI';
import { ACTION_BAR_HEIGHT, GAME_HEIGHT, HEADER_HEIGHT, NEUTRAL_OWNER_ID, PLAYER_KINGDOM_ID } from '../game/constants';
import { MAP_SCALE, axialToPixel, hexCorners } from '../map/hex';
import { traceLandBoundaryLoops } from '../map/boundary';
import { advanceAscentTick } from '../systems/ascent/AscentTick';
import { rerollAscentDraft, resolveAscentPrompt } from '../systems/ascent/AscentResolver';
import { drainAscentPrompts } from '../systems/ascent/AscentState';
import { offerConquestMethods } from '../systems/ascent/ConquestSystem';
import { offerEnvoyTo } from '../systems/ascent/EnvoySystem';
import { applyAppointment, offerAppointment, offerLawChoice } from '../systems/ascent/CourtLaneSystem';
import { raiseHostNow } from '../systems/ascent/AutopilotSystem';
import { recallHost, resupplyHost, setArmyOrders } from '../systems/ascent/StandingOrders';
import { raiseHostWithPlan, type MusterPlan } from '../systems/ascent/MusterSystem';
import { pushToast } from '../systems/empire/notifications';
import { disbandArmy } from '../systems/WarSystem';
import {
  answerBattleMoment, delegateBattle, finishBattle, markPlayerSteered, setBattleFormation,
  setBattleStance,
} from '../systems/ascent/BattleSystem';
import { createAscentGameState } from '../state/GameState';
import { ASCENT_HUD_HEIGHT } from '../ui/ascent/AscentHud';
import { MapScene } from './MapScene';
import type { BattleFormation } from '../data/ascent/formations';
import type { ArmyOrders, FieldStance } from '../state/types';

/**
 * Dragon Ascent's world scene.
 *
 * Everything visible — hex terrain, the baked static layers, fog, camera pan/zoom, land
 * hit-testing, WebGL context recovery — is inherited from `MapScene` unchanged. Only four
 * things differ in this mode, and they are the only things overridden here:
 *
 *  1. it runs `advanceAscentTick` on its own faster clock instead of the classic month tick
 *  2. it drives its own HUD scene
 *  3. tapping a province inspects it rather than issuing orders (there is no unit micro)
 *  4. it answers the ascent prompt bus
 */
export class ConquestScene extends MapScene {
  private ascentAccumulator = 0;
  private frontMarker?: Phaser.GameObjects.Container;
  private ownershipTint?: Phaser.GameObjects.Graphics;
  /** Ownership map the tint was last painted for, so a tick with no flips repaints nothing. */
  private ownershipSignature = '';
  /** Merged outlines for the foreign-ground veil, rebuilt whenever ownership changes. */
  private readonly foreignLoopCache = new Map<string, Array<Array<{ x: number; y: number }>>>();

  constructor() {
    super('ConquestScene');
  }

  protected uiSceneKey(): string {
    return 'ConquestUIScene';
  }

  create(): void {
    super.create();
    // `MapScene.create` does not call `refresh`, and `update` returns early while the run is
    // paused — which it is for the whole opening prompt chain. Without this first paint the
    // ownership wash would not appear until the player had already answered several cards.
    this.repaintOwnershipTint();

    // Straight from the summary back into a fresh run, without a round trip through the menu.
    // A roguelite is judged on the run *after* the one you lost, and making the player walk
    // back out to the title screen to take it is the cheapest possible way to lose them.
    this.scene.get(this.uiSceneKey()).events.on('ui:restart-ascent', () => {
      this.scene.stop(this.uiSceneKey());
      this.scene.start('ConquestScene', {
        state: createAscentGameState({ seaSides: 1, difficulty: 'normal' }),
      });
    });
  }

  /** This mode ends in defeat rather than victory; otherwise the clock stops for the same reasons. */
  protected isWorldHalted(): boolean {
    return this.state.isDefeated || this.state.isPaused || this.state.isStrategyPause;
  }

  update(time: number, delta: number): void {
    // Deliberately not `super.update`: that drives the classic month tick, which this mode
    // replaces outright. Only the ambient-motion sync is shared.
    this.syncWorldMotion();
    if (this.isWorldHalted()) {
      return;
    }
    // Shared for the same reason: the seasonal weather drifts on the frame clock, not the tick,
    // and this mode turns the year fastest of all.
    this.seasons.update(time, delta);

    this.state.realtimeSeconds += delta / 1000;
    this.ascentAccumulator += delta;
    if (this.ascentAccumulator < ASCENT_TICK_MS) {
      return;
    }
    this.ascentAccumulator = 0;

    // Snapshot where each host stands so arrivals can be animated after the tick, matching
    // the marching-column effect MapScene plays for the classic modes.
    const before = new Map(
      this.state.armies
        .filter((army) => army.kingdomId === PLAYER_KINGDOM_ID)
        .map((army) => [army.id, army.landId] as const),
    );

    advanceAscentTick(this.state);

    for (const army of this.state.armies) {
      if (army.kingdomId !== PLAYER_KINGDOM_ID) continue;
      const fromId = before.get(army.id);
      if (!fromId || fromId === army.landId) continue;
      const fromLand = this.state.lands.find((land) => land.id === fromId);
      const toLand = this.state.lands.find((land) => land.id === army.landId);
      if (!fromLand || !toLand) continue;
      this.animateSoldierColumn(
        this.wx(fromLand.x),
        this.wy(fromLand.y),
        this.wx(toLand.x),
        this.wy(toLand.y),
        true,
      );
    }

    // An arena fight is the whole session: once it resolves, hand the result back to the setup
    // screen rather than leaving the player on a map with one province and nothing to do. The
    // record `finishBattle` wrote is the honest account of what happened, so it is what travels.
    if (this.state.ascent?.arena && !this.state.ascent.activeBattle && !this.state.pendingBattle) {
      const history = this.state.ascent.battleHistory ?? [];
      const result = history[history.length - 1];
      if (result) {
        this.scene.stop(this.uiSceneKey());
        this.scene.start('BattleArenaScene', { result });
        return;
      }
    }

    this.refresh();
  }

  protected refresh(): void {
    super.refresh();
    this.repaintOwnershipTint();
    this.drawFrontMarker();
  }

  /**
   * A translucent wash of the owner's colour over every claimed district.
   *
   * Terrain view draws ownership only as a thin coloured outline around each land, which is
   * legible on the classic modes' small starting map but not here: an Ascent run opens
   * surrounded by neutral districts that look exactly like the realm's own, so "which of this
   * is mine" is unanswerable at a glance. Control view answers it but throws away the terrain.
   * This fills the gap — terrain stays readable, ownership reads instantly.
   *
   * Drawn live above the static bake rather than baked into it: ownership changes several
   * times a minute in this mode, and re-baking the whole map for each flip would stutter.
   * Repainted only when the ownership map actually changes.
   */
  private repaintOwnershipTint(): void {
    // Control view already paints every tile in its owner's colour at full strength.
    if (this.state.mapRenderMode !== 'terrain') {
      this.ownershipTint?.setVisible(false);
      return;
    }

    const signature = this.state.lands
      .filter((land) => land.isVisible)
      .map((land) => `${land.id}:${land.ownerId}`)
      .join(',');

    if (!this.ownershipTint) {
      this.ownershipTint = this.add.graphics();
      // Between the baked static texture (1.9) and the per-land markers (2). Below 1.9 the
      // bake simply covers it — the static layers are composited into one quad drawn on top.
      this.ownershipTint.setDepth(1.95);
    }
    this.ownershipTint.setVisible(true);
    if (signature === this.ownershipSignature) return;
    this.ownershipSignature = signature;

    this.ownershipTint.clear();
    const hexSize = this.state.mapConfig.hexSize;

    // A theme may prefer to mute foreign ground as a whole region rather than hex by hex — the
    // per-hex wash below is a visible honeycomb, and its blue is a colour the Đông Hồ palette has
    // no pigment for.
    if (this.mapRenderer.drawForeignWash) {
      this.foreignLoopCache.clear();
      for (const land of this.state.lands) {
        if (!land.isVisible || land.ownerId === PLAYER_KINGDOM_ID) continue;
        const wash = this.ownershipWash(land.ownerId);
        if (!wash) continue;
        const loops = traceLandBoundaryLoops(
          this.state, this.hexTileMap, (v: number) => this.wx(v), (v: number) => this.wy(v), this.foreignLoopCache, land.id,
        );
        this.mapRenderer.drawForeignWash(this.ownershipTint, loops, land.ownerId === NEUTRAL_OWNER_ID, wash.color);
      }
      return;
    }

    for (const tile of this.state.hexTiles) {
      const land = tile.landId ? this.state.lands.find((candidate) => candidate.id === tile.landId) : undefined;
      if (!land || !land.isVisible) continue;

      const wash = this.ownershipWash(land.ownerId);
      if (!wash) continue;

      const pixel = axialToPixel(tile.coord, hexSize);
      const corners = hexCorners({ x: this.wx(pixel.x), y: this.wy(pixel.y) }, hexSize * MAP_SCALE * 1.02)
        .map(([x, y]) => ({ x, y }));

      this.ownershipTint.fillStyle(wash.color, wash.alpha);
      this.ownershipTint.fillPoints(corners, true);
    }
  }

  /**
   * Colour and strength of a district's wash.
   *
   * Tinting only *our* land does not work: the realm's colour is jade and the map is mostly
   * green grass, so the wash disappears into the terrain it sits on. The readable version is
   * the reverse — leave our ground untouched and bright, and mute everything we do not hold.
   * Contrast, not colour, is what makes the border obvious at a glance.
   */
  private ownershipWash(ownerId: string): { color: number; alpha: number } | undefined {
    if (ownerId === PLAYER_KINGDOM_ID) return undefined;
    // Deep and cool rather than the palette's near-black olive, which sits so close to the
    // grass and forest beneath it that even a heavy wash reads as "slightly dim", not "not
    // yours". Pushing it blue separates foreign ground by hue as well as by value.
    if (ownerId === NEUTRAL_OWNER_ID) return { color: 0x1b2436, alpha: 0.46 };

    // A rival's ground is muted like any other foreign land, then washed in their own colour
    // so "someone else's" and "*this* someone's" are two separate readings.
    const color = this.state.kingdoms.find((kingdom) => kingdom.id === ownerId)?.color;
    return { color: color ?? 0x1b2436, alpha: 0.5 };
  }

  /**
   * Rings the province the realm is marching on.
   *
   * Without it the map is decoration: the autopilot picks fights off-screen and the player
   * has no way to connect the March Order they just chose to anything happening on the
   * board. Amber means the host is holding because the odds are still too poor.
   */
  private drawFrontMarker(): void {
    this.frontMarker?.destroy();
    this.frontMarker = undefined;

    const frontId = this.state.ascent?.frontLandId;
    if (!frontId) return;
    const land = this.state.lands.find((candidate) => candidate.id === frontId);
    if (!land) return;

    const blocked = this.state.ascent?.frontBlocked ?? false;
    const color = blocked ? INK_UI.gold : INK_UI.cinnabar;

    const marker = this.add.container(this.wx(land.x), this.wy(land.y)).setDepth(60);
    const ring = this.add.graphics();
    ring.lineStyle(3, color, 0.95);
    ring.strokeCircle(0, 0, 24);
    ring.lineStyle(2, color, 0.5);
    ring.strokeCircle(0, 0, 31);
    marker.add(ring);

    // Four ticks around the ring read as crosshairs without needing an art asset.
    const ticks = this.add.graphics();
    ticks.lineStyle(3, color, 0.9);
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]] as const) {
      ticks.lineBetween(dx * 34, dy * 34, dx * 42, dy * 42);
    }
    marker.add(ticks);

    this.tweens.add({
      targets: ring,
      scale: { from: 0.92, to: 1.12 },
      alpha: { from: 1, to: 0.55 },
      duration: blocked ? 1400 : 850,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    this.frontMarker = marker;
  }

  protected registerUiEvents(): void {
    // Inherit the shared world controls (zoom, minimap pan, clear selection, exit to menu).
    super.registerUiEvents();

    const ui = this.scene.get(this.uiSceneKey());

    ui.events.on('ui:ascent-choice', (choiceId: string) => {
      if (resolveAscentPrompt(this.state, choiceId)) {
        this.refresh();
        ui.events.emit('state-changed');
      }
    });

    ui.events.on('ui:ascent-reroll', () => {
      if (rerollAscentDraft(this.state)) {
        ui.events.emit('state-changed');
      }
    });

    // "Select a province, then choose how to take it" — reached directly from the map or the
    // Conquer lane, rather than waiting for the scheduler to raise the prompt on its own.
    ui.events.on('ui:ascent-conquer', (landId: string) => {
      if (this.state.pendingAscentPrompt) return;
      if (offerConquestMethods(this.state, landId)) {
        drainAscentPrompts(this.state);
        this.refresh();
        ui.events.emit('state-changed');
      }
    });

    ui.events.on('ui:ascent-envoy', (kingdomId: string) => {
      if (this.state.pendingAscentPrompt) return;
      if (offerEnvoyTo(this.state, kingdomId)) {
        drainAscentPrompts(this.state);
        this.refresh();
        ui.events.emit('state-changed');
      }
    });

    // Raised from the Court lane: post a champion, or spend the throne's authority — the same
    // cards the decision director raises on its own clock, reached on demand instead.
    ui.events.on('ui:ascent-appoint', (heroId: string) => {
      if (this.state.pendingAscentPrompt) return;
      if (offerAppointment(this.state, heroId)) {
        drainAscentPrompts(this.state);
        this.refresh();
        ui.events.emit('state-changed');
      }
    });

    // Raised from the Army screen: muster a host now rather than waiting for the autopilot's
    // own recruit pass, which only fires when the realm is *below* its target host count.
    // Battle orders act on the live siege rather than resolving a prompt: the fight is part of
    // the world now, so an order is a standing instruction to it, not a turn taken in it.
    // A Moment is answered on its own channel: it is not a standing order, it is one decision
    // taken once, and it must not be confused with the stance the host is holding.
    // Leaving an arena fight goes back to the setup rather than to the map behind it.
    ui.events.on('ui:arena-leave', () => {
      const history = this.state.ascent?.battleHistory ?? [];
      this.scene.stop(this.uiSceneKey());
      this.scene.start('BattleArenaScene', { result: history[history.length - 1] });
    });
    ui.events.on('ui:battle-moment', (answer: 'commit' | 'steady') => {
      answerBattleMoment(this.state, answer);
      ui.events.emit('state-changed');
    });
    // Two dials on two clocks, plus the two exits. Reserve and rally left this channel entirely:
    // with their buttons gone from the dock they are questions the fight asks, not orders it takes.
    ui.events.on('ui:battle-order', (order: string) => {
      if (order.startsWith('stance:')) {
        // A person pressed something, so the commander stands down — see `markPlayerSteered`.
        markPlayerSteered(this.state);
        setBattleStance(this.state, order.slice(7) as FieldStance);
      } else if (order.startsWith('formation:')) {
        markPlayerSteered(this.state);
        setBattleFormation(this.state, order.slice(10) as BattleFormation);
      } else if (order === 'leave') {
        // Hand the rest of it over and step away. `delegateBattle` hands over the *remainder* —
        // the battlefield keeps running and the player can take the field back at any point — so
        // leaving is a way of playing rather than a way of skipping.
        delegateBattle(this.state, true);
        ui.events.emit('ui:battle-leave');
      }
      // "Leave it to my generals" hands back *this* fight. It used to flip the run-wide
      // `autoResolveBattles` as well, so one tap on the way out of a lost cause silently
      // disabled the mode's best screen for the rest of the run; Settings still offers that.
      // Handing over is not conceding. `finishBattle` ended the engagement on the spot and threw
      // away everything after it — the aftermath, the spoils, the chance to take the field back.
      else if (order === 'auto') delegateBattle(this.state, true);
      else if (order === 'take-field') delegateBattle(this.state, false);
      ui.events.emit('state-changed');
    });
    // Standing orders, recall and resupply act on one host and refresh at once — an order given
    // is a march started, not a wish recorded for the next tick.
    ui.events.on('ui:ascent-army-orders', (payload: { armyId: string; orders: ArmyOrders }) => {
      if (this.state.pendingAscentPrompt) return;
      if (setArmyOrders(this.state, payload.armyId, payload.orders)) {
        this.refresh();
        ui.events.emit('state-changed');
      }
    });
    ui.events.on('ui:ascent-army-recall', (armyId: string) => {
      if (this.state.pendingAscentPrompt) return;
      const result = recallHost(this.state, armyId);
      if (!result.ok && result.reason) pushToast(this.state, result.reason, 'threat');
      this.refresh();
      ui.events.emit('state-changed');
    });
    ui.events.on('ui:ascent-army-resupply', (armyId: string) => {
      if (this.state.pendingAscentPrompt) return;
      const result = resupplyHost(this.state, armyId);
      if (!result.ok && result.reason) pushToast(this.state, result.reason, 'threat');
      this.refresh();
      ui.events.emit('state-changed');
    });
    ui.events.on('ui:ascent-disband-army', (armyId: string) => {
      if (this.state.pendingAscentPrompt) return;
      if (disbandArmy(this.state, armyId)) {
        this.refresh();
        ui.events.emit('state-changed');
      }
    });
    ui.events.on('ui:ascent-raise-host', (plan?: MusterPlan) => {
      if (this.state.pendingAscentPrompt) return;
      // With a plan the form's figures are mustered as given; without one (the old one-tap
      // path) the autopilot's own sizing applies.
      const result = plan ? raiseHostWithPlan(this.state, plan) : { ok: raiseHostNow(this.state) };
      if (!result.ok && result.reason) pushToast(this.state, result.reason, 'threat');
      this.refresh();
      ui.events.emit('state-changed');
    });

    // A posting chosen on the hero picker: a seat, a province, the command of a host, or the
    // bench. The same `applyAppointment` the appointment card resolves through.
    ui.events.on('ui:ascent-assign', (payload: { heroId: string; optionId: string }) => {
      if (this.state.pendingAscentPrompt) return;
      applyAppointment(this.state, payload.heroId, payload.optionId);
      this.refresh();
      ui.events.emit('state-changed');
    });

    ui.events.on('ui:ascent-law', () => {
      if (this.state.pendingAscentPrompt) return;
      if (offerLawChoice(this.state)) {
        drainAscentPrompts(this.state);
        this.refresh();
        ui.events.emit('state-changed');
      }
    });
  }

  /**
   * Read-only inspection. Deliberately does NOT call `super.selectLand`: the base
   * implementation doubles as the "tap army, then tap land" move command, and this mode has
   * no manual marching. Tapping focuses a province so the HUD can describe it — and, for
   * ground the realm does not hold, offers the way into its acquisition methods.
   */
  protected selectLand(landId: string): void {
    this.state.selectedLandId = this.state.selectedLandId === landId ? undefined : landId;
    this.state.selectedArmyId = undefined;
    this.refresh();
    this.scene.get(this.uiSceneKey()).events.emit('state-changed');
  }

  /**
   * This mode's chrome geometry: the HUD strip at the top and the inspect card at the
   * bottom. MapScene's version guards bands that belong to the classic HUD (bottom sheet,
   * action bar, minimap) which ConquestUIScene lays out differently.
   */
  protected isScreenPointOverFixedUi(x: number, y: number): boolean {
    // `performance.now`, matching what writes it. Compared against `Date.now` this was a
    // thirteen-digit number against a five-digit one, so the suppression window never once
    // applied and a tap that dismissed a marker also selected the land beneath it.
    if (performance.now() < (window.__suppressMapInputUntil ?? 0)) return true;
    if (y <= ASCENT_HUD_BOTTOM) return true;
    // The action bar is always present, so its band is fixed UI whether or not a province
    // is selected — otherwise a tap on "Court" also drags the map underneath it.
    if (y >= ASCENT_ACTION_BAR_TOP) return true;
    if (y >= ASCENT_INSPECT_TOP && this.state.selectedLandId) return true;
    // The zoom/mode stack floats over open map, and it moves: it sits above the inspect card
    // when a province is selected and lower when none is. A fixed band would guard the wrong
    // pixels half the time, so the HUD publishes where it actually drew them. Without this the
    // tap-to-select handler here claimed the press, selected the province underneath, and the
    // re-render destroyed the button before its release could fire — the buttons were visible,
    // pressable, and inert.
    return (window.__hudTapBounds ?? []).some((rect) => (
      x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height
    ));
  }
}

/**
 * Bottom edge of the HUD strip; taps above this belong to the HUD, not the map.
 *
 * Derived rather than typed: as a hand-kept 104 against a band that actually closed at 110, the
 * bottom six pixels of the readout passed taps through to the map underneath it — and the number
 * had to be remembered every time either band's height moved.
 */
export const ASCENT_HUD_BOTTOM = HEADER_HEIGHT + ASCENT_HUD_HEIGHT;
/** Top edge of the province inspect card, shown only while a province is selected. */
export const ASCENT_INSPECT_TOP = 654;
/** Top edge of the standing action bar. Always fixed UI, selection or not. */
export const ASCENT_ACTION_BAR_TOP = GAME_HEIGHT - ACTION_BAR_HEIGHT;
