/**
 * Roads connecting settlements, plus the animated ox-carts and travelers that
 * wander along them. Pairs with `InkMapRenderer` (road stroke styling) and
 * `InkMapItemRenderer` (cart/traveler glyphs).
 */
import Phaser from 'phaser';
import { buildRoadCurve } from '../../map/roadCurve';
import { hashString } from '../../utils/math';
import type { GameState, Land } from '../../state/types';
import type { InkMapRenderer } from '../../ui/MapRenderer';
import type { InkMapItemRenderer } from '../../ui/MapItemRenderer';

type WorldTransform = (value: number) => number;
type SettlementAnchor = (land: Land) => { x: number; y: number };

export class TrafficRenderer {
  private cartMarkers = new Map<string, Phaser.GameObjects.GameObject>();
  private travelerMarkers = new Map<string, Phaser.GameObjects.GameObject[]>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly inkMap: InkMapRenderer,
    private readonly inkItems: InkMapItemRenderer,
  ) {}

  /** Draws dirt roads connecting each land's settlement (village/city/castle/mine) to its neighbors. */
  drawConnections(state: GameState, wx: WorldTransform, wy: WorldTransform, getAnchor: SettlementAnchor): Phaser.GameObjects.Graphics {
    const graphics = this.scene.add.graphics();

    for (const land of state.lands) {
      for (const neighborId of land.neighbors) {
        const neighbor = state.lands.find((candidate) => candidate.id === neighborId);
        if (!neighbor || land.id > neighbor.id) {
          continue;
        }

        const from = getAnchor(land);
        const to = getAnchor(neighbor);
        const curve = buildRoadCurve(state, from, to, `${land.id}|${neighbor.id}`, wx, wy);
        this.drawRoad(graphics, curve, this.roadWidth(land), this.roadWidth(neighbor));
      }
    }

    return graphics;
  }

  /**
   * Animated ox-carts shuttling along roads between farms and the cities they're connected
   * to. Existing carts are left running (and their tweens untouched) so this can be called
   * again on every refresh to pick up newly-revealed settlements as fog of war lifts.
   */
  drawCarts(
    state: GameState,
    wx: WorldTransform,
    wy: WorldTransform,
    getAnchor: SettlementAnchor,
    getCityCenter: (land: Land) => { x: number; y: number } | undefined,
  ): Phaser.GameObjects.GameObject[] {
    const activeKeys = new Set<string>();

    for (const land of state.lands) {
      if (land.type !== 'farm' || !land.isVisible) {
        continue;
      }

      for (const neighborId of land.neighbors) {
        const neighbor = state.lands.find((candidate) => candidate.id === neighborId);
        if (!neighbor || !neighbor.isVisible || !getCityCenter(neighbor)) {
          continue;
        }

        const key = `${land.id}|${neighbor.id}`;
        activeKeys.add(key);
        if (this.cartMarkers.has(key)) {
          continue;
        }

        const from = getAnchor(land);
        const to = getAnchor(neighbor);
        const curve = buildRoadCurve(state, from, to, key, wx, wy);

        const cart = this.inkItems.createCart();
        cart.setDepth(69);
        this.cartMarkers.set(key, cart);

        const seed = hashString(`cart|${key}`);
        const progress = { t: (seed % 100) / 100 };
        const duration = 16000 + (seed % 11) * 1200;
        const updateCart = () => {
          const point = curve.getPoint(progress.t);
          cart.setPosition(point.x, point.y);
        };
        updateCart();
        this.scene.tweens.add({
          targets: progress,
          t: 1,
          duration,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
          onUpdate: updateCart,
        });
      }
    }

    for (const [key, cart] of this.cartMarkers) {
      if (!activeKeys.has(key)) {
        cart.destroy();
        this.cartMarkers.delete(key);
      }
    }

    return [...this.cartMarkers.values()];
  }

  /**
   * Slow-walking ink travelers wandering every road between connected settlements, for a
   * livelier map. Existing travelers are left running so this can be called again on every
   * refresh to pick up newly-revealed settlements as fog of war lifts.
   */
  drawTravelers(state: GameState, wx: WorldTransform, wy: WorldTransform, getAnchor: SettlementAnchor): Phaser.GameObjects.GameObject[] {
    const activeKeys = new Set<string>();

    for (const land of state.lands) {
      for (const neighborId of land.neighbors) {
        const neighbor = state.lands.find((candidate) => candidate.id === neighborId);
        if (!neighbor || land.id > neighbor.id || !land.isVisible || !neighbor.isVisible) {
          continue;
        }

        const key = `${land.id}|${neighbor.id}`;
        activeKeys.add(key);
        if (this.travelerMarkers.has(key)) {
          continue;
        }

        const from = getAnchor(land);
        const to = getAnchor(neighbor);
        const curve = buildRoadCurve(state, from, to, key, wx, wy);
        const travelers: Phaser.GameObjects.GameObject[] = [];

        for (let index = 0; index < 2; index += 1) {
          const traveler = this.inkItems.createTraveler();
          traveler.setDepth(69);
          travelers.push(traveler);

          const seed = hashString(`traveler|${key}|${index}`);
          const progress = { t: (seed % 100) / 100 };
          const duration = 20000 + (seed % 13) * 1500;
          const updateTraveler = () => {
            const point = curve.getPoint(progress.t);
            traveler.setPosition(point.x, point.y);
          };
          updateTraveler();
          this.scene.tweens.add({
            targets: progress,
            t: 1,
            duration,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
            onUpdate: updateTraveler,
          });
        }

        this.travelerMarkers.set(key, travelers);
      }
    }

    for (const [key, travelers] of this.travelerMarkers) {
      if (!activeKeys.has(key)) {
        for (const traveler of travelers) {
          traveler.destroy();
        }
        this.travelerMarkers.delete(key);
      }
    }

    return [...this.travelerMarkers.values()].flat();
  }

  /** Roads are wider where they meet a bigger settlement: castles widest, then cities/temples, then villages/mines. */
  private roadWidth(land: Land): number {
    if (land.type === 'castle' || land.type === 'enemyCastle') {
      return 7 + land.buildings.length * 0.45;
    }
    if (land.type === 'market' || land.type === 'temple') {
      return 5 + land.buildings.length * 0.35;
    }
    return 3 + land.buildings.length * 0.25;
  }

  /**
   * Draws a dirt-road-styled curve as many short segments so its width can taper between
   * the two settlements it connects (wider at a castle, narrower at a village/mine), with
   * an earthy bed and a slightly lighter, narrower worn track on top.
   */
  private drawRoad(graphics: Phaser.GameObjects.Graphics, curve: Phaser.Curves.Spline, widthFrom: number, widthTo: number): void {
    this.inkMap.drawRoad(graphics, curve.getSpacedPoints(32), widthFrom, widthTo);
  }
}
