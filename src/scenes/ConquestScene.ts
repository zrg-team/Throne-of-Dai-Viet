import Phaser from 'phaser';
import { ASCENT_TICK_MS } from '../game/ascentConfig';
import { INK_UI } from '../ui/InkUI';
import { PLAYER_KINGDOM_ID } from '../game/constants';
import { advanceAscentTick } from '../systems/ascent/AscentTick';
import { rerollAscentDraft, resolveAscentPrompt } from '../systems/ascent/AscentResolver';
import { MapScene } from './MapScene';

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

  constructor() {
    super('ConquestScene');
  }

  protected uiSceneKey(): string {
    return 'ConquestUIScene';
  }

  update(_time: number, delta: number): void {
    if (this.state.isDefeated || this.state.isPaused || this.state.isStrategyPause) {
      return;
    }

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

    this.refresh();
  }

  protected refresh(): void {
    super.refresh();
    this.drawFrontMarker();
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
  }

  /**
   * Read-only inspection. Deliberately does NOT call `super.selectLand`: the base
   * implementation doubles as the "tap army, then tap land" move command, and this mode has
   * no manual marching — the autopilot marches, and targets are chosen on the March Order
   * prompt. Tapping here just focuses a province so the HUD can describe it.
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
    const suppressUntil = window.__suppressMapInputUntil ?? 0;
    if (Date.now() < suppressUntil) return true;
    if (y <= ASCENT_HUD_BOTTOM) return true;
    if (y >= ASCENT_INSPECT_TOP && this.state.selectedLandId) return true;
    return false;
  }
}

/** Bottom edge of the HUD strip; taps above this belong to the HUD, not the map. */
export const ASCENT_HUD_BOTTOM = 150;
/** Top edge of the province inspect card, shown only while a province is selected. */
export const ASCENT_INSPECT_TOP = 742;
