/**
 * Roads connecting settlements, plus the animated ox-carts and travelers that
 * wander along them. Pairs with `InkMapRenderer` (road stroke styling) and
 * `InkMapItemRenderer` (cart/traveler glyphs).
 */
import Phaser from 'phaser';
import { createRng } from '../../map/random';
import { hashString } from '../../utils/math';
import type { GameState, Land } from '../../state/types';
import type { InkMapRenderer } from '../../ui/MapRenderer';
import type { InkMapItemRenderer } from '../../ui/MapItemRenderer';

type WorldTransform = (value: number) => number;
type SettlementAnchor = (land: Land) => { x: number; y: number };

export class TrafficRenderer {
  private cartMarkers: Phaser.GameObjects.GameObject[] = [];
  private travelerMarkers: Phaser.GameObjects.GameObject[] = [];

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
        const curve = this.buildRoadCurve(state, from, to, `${land.id}|${neighbor.id}`, wx, wy);
        this.drawRoad(graphics, curve, this.roadWidth(land), this.roadWidth(neighbor));
      }
    }

    return graphics;
  }

  /** Animated ox-carts shuttling along roads between farms and the cities they're connected to. */
  drawCarts(
    state: GameState,
    wx: WorldTransform,
    wy: WorldTransform,
    getAnchor: SettlementAnchor,
    getCityCenter: (land: Land) => { x: number; y: number } | undefined,
  ): Phaser.GameObjects.GameObject[] {
    for (const cart of this.cartMarkers) {
      cart.destroy();
    }
    this.cartMarkers = [];

    for (const land of state.lands) {
      if (land.type !== 'farm' || !land.isVisible) {
        continue;
      }

      for (const neighborId of land.neighbors) {
        const neighbor = state.lands.find((candidate) => candidate.id === neighborId);
        if (!neighbor || !neighbor.isVisible || !getCityCenter(neighbor)) {
          continue;
        }

        const from = getAnchor(land);
        const to = getAnchor(neighbor);
        const curve = this.buildRoadCurve(state, from, to, `${land.id}|${neighbor.id}`, wx, wy);

        const cart = this.inkItems.createCart();
        cart.setDepth(69);
        this.cartMarkers.push(cart);

        const seed = hashString(`cart|${land.id}|${neighbor.id}`);
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

    return this.cartMarkers;
  }

  /** Slow-walking ink travelers wandering every road between connected settlements, for a livelier map. */
  drawTravelers(state: GameState, wx: WorldTransform, wy: WorldTransform, getAnchor: SettlementAnchor): Phaser.GameObjects.GameObject[] {
    for (const traveler of this.travelerMarkers) {
      traveler.destroy();
    }
    this.travelerMarkers = [];

    for (const land of state.lands) {
      for (const neighborId of land.neighbors) {
        const neighbor = state.lands.find((candidate) => candidate.id === neighborId);
        if (!neighbor || land.id > neighbor.id || !land.isVisible || !neighbor.isVisible) {
          continue;
        }

        const from = getAnchor(land);
        const to = getAnchor(neighbor);
        const curve = this.buildRoadCurve(state, from, to, `${land.id}|${neighbor.id}`, wx, wy);

        for (let index = 0; index < 2; index += 1) {
          const traveler = this.inkItems.createTraveler();
          traveler.setDepth(69);
          this.travelerMarkers.push(traveler);

          const seed = hashString(`traveler|${land.id}|${neighbor.id}|${index}`);
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
      }
    }

    return this.travelerMarkers;
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
   * A gently winding spline between two settlements: a couple of waypoints are nudged
   * sideways by a deterministic, seeded amount so the road meanders instead of running
   * dead straight.
   */
  private buildRoadCurve(
    state: GameState,
    from: { x: number; y: number },
    to: { x: number; y: number },
    seedKey: string,
    wx: WorldTransform,
    wy: WorldTransform,
  ): Phaser.Curves.Spline {
    const rng = createRng(state.mapConfig.seed + hashString(seedKey));
    const fromW = { x: wx(from.x), y: wy(from.y) };
    const toW = { x: wx(to.x), y: wy(to.y) };
    const dx = toW.x - fromW.x;
    const dy = toW.y - fromW.y;
    const length = Math.hypot(dx, dy) || 1;
    const normalX = -dy / length;
    const normalY = dx / length;

    const points: Phaser.Math.Vector2[] = [new Phaser.Math.Vector2(fromW.x, fromW.y)];
    const waypointCount = length > 90 ? 2 : 1;
    for (let index = 1; index <= waypointCount; index += 1) {
      const t = index / (waypointCount + 1);
      const jitter = (rng() - 0.5) * length * 0.22;
      points.push(
        new Phaser.Math.Vector2(fromW.x + dx * t + normalX * jitter, fromW.y + dy * t + normalY * jitter),
      );
    }
    points.push(new Phaser.Math.Vector2(toW.x, toW.y));

    return new Phaser.Curves.Spline(points);
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
