/**
 * Roads connecting settlements, plus the animated ox-carts and travelers that
 * wander along them. Pairs with selected environment and item renderers.
 */
import Phaser from 'phaser';
import { buildRoadCurve } from '../../map/roadCurve';
import { hashString } from '../../utils/math';
import type { GameState, Land } from '../../state/types';
import type { MapRenderer } from '../../ui/MapRenderer';
import type { MapItemRenderer } from '../../ui/MapItemRenderer';

type WorldTransform = (value: number) => number;
type SettlementAnchor = (land: Land) => { x: number; y: number };

/** A wanderer and the looping tween that walks it, so the loop can be stopped and restarted. */
interface TrafficMover {
  object: Phaser.GameObjects.GameObject & { setPosition(x: number, y: number): unknown };
  tween: Phaser.Tweens.Tween;
}

export class TrafficRenderer {
  private cartMarkers = new Map<string, TrafficMover>();
  private travelerMarkers = new Map<string, TrafficMover[]>();
  /** Whether the world's clock is stopped. New movers are created to match. */
  private paused = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly mapRenderer: MapRenderer,
    private readonly mapItems: MapItemRenderer,
  ) {}

  /**
   * Holds or releases every cart and traveler on the map.
   *
   * These loop on `repeat: -1` and so used to keep walking through a pause: the player stopped
   * the clock and the realm's roads carried on regardless, which reads as the pause not having
   * worked. A stopped clock now stops the world it is the clock for.
   */
  setPaused(paused: boolean): void {
    if (paused === this.paused) return;
    this.paused = paused;
    for (const mover of this.movers()) {
      if (paused) mover.tween.pause();
      else mover.tween.resume();
    }
  }

  private movers(): TrafficMover[] {
    return [...this.cartMarkers.values(), ...[...this.travelerMarkers.values()].flat()];
  }

  /**
   * Walks one mover back and forth along its road, forever.
   *
   * Created already held when the world is paused, so a settlement revealed while the clock is
   * stopped does not arrive with its traffic already moving.
   */
  private walk(
    mover: Phaser.GameObjects.GameObject & {
      setPosition(x: number, y: number): unknown;
      setScale?(x: number, y: number): unknown;
    },
    curve: Phaser.Curves.Spline,
    seed: number,
    duration: number,
  ): TrafficMover {
    const progress = { t: (seed % 100) / 100 };
    let facing = 0;
    const step = () => {
      if (!mover.active) return;
      const point = curve.getPoint(progress.t);
      // Face the way you are going. These tweens yoyo, so half of every round trip is spent
      // travelling backwards down the same road — and a cart drawn with its ox in front becomes an
      // ox being pushed along behind it. Nothing else on the map moves, so it is the one thing on
      // screen the eye is already following.
      const heading = point.x - (mover as unknown as { x: number }).x;
      if (Math.abs(heading) > 0.05) {
        const next = heading < 0 ? -1 : 1;
        if (next !== facing) {
          facing = next;
          mover.setScale?.(next, 1);
        }
      }
      mover.setPosition(point.x, point.y);
    };
    step();
    const tween = this.scene.tweens.add({
      targets: progress,
      t: 1,
      duration,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
      paused: this.paused,
      onUpdate: step,
    });
    return { object: mover, tween };
  }

  /** Stops a mover's loop before destroying it, so its `onUpdate` cannot outlive its target. */
  private retire(mover: TrafficMover): void {
    mover.tween.remove();
    mover.object.destroy();
  }

  /** Draws dirt roads connecting each land's settlement (village/city/castle/mine) to its neighbors. */
  drawConnections(state: GameState, wx: WorldTransform, wy: WorldTransform, getAnchor: SettlementAnchor): Phaser.GameObjects.Graphics {
    const graphics = this.scene.add.graphics();

    for (const land of state.lands) {
      for (const neighborId of land.neighbors) {
        const neighbor = state.lands.find((candidate) => candidate.id === neighborId);
        if (
          !neighbor ||
          land.id > neighbor.id ||
          !land.isVisible ||
          !neighbor.isVisible ||
          !this.hasSettlement(land) ||
          !this.hasSettlement(neighbor)
        ) {
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
      if (land.type !== 'farm' || !land.isVisible || !this.hasSettlement(land)) {
        continue;
      }

      for (const neighborId of land.neighbors) {
        const neighbor = state.lands.find((candidate) => candidate.id === neighborId);
        if (!neighbor || !neighbor.isVisible || !this.hasSettlement(neighbor) || !getCityCenter(neighbor)) {
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

        const cart = this.mapItems.createCart();
        cart.setDepth(69);

        const seed = hashString(`cart|${key}`);
        this.cartMarkers.set(key, this.walk(cart, curve, seed, 16000 + (seed % 11) * 1200));
      }
    }

    for (const [key, cart] of this.cartMarkers) {
      if (!activeKeys.has(key)) {
        this.retire(cart);
        this.cartMarkers.delete(key);
      }
    }

    return this.movers().map((mover) => mover.object);
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
        if (!neighbor || land.id > neighbor.id || !land.isVisible || !neighbor.isVisible || !this.hasSettlement(land) || !this.hasSettlement(neighbor)) {
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
        const travelers: TrafficMover[] = [];

        for (let index = 0; index < 2; index += 1) {
          const traveler = this.mapItems.createTraveler();
          traveler.setDepth(69);
          const seed = hashString(`traveler|${key}|${index}`);
          travelers.push(this.walk(traveler, curve, seed, 20000 + (seed % 13) * 1500));
        }

        this.travelerMarkers.set(key, travelers);
      }
    }

    for (const [key, travelers] of this.travelerMarkers) {
      if (!activeKeys.has(key)) {
        for (const traveler of travelers) {
          this.retire(traveler);
        }
        this.travelerMarkers.delete(key);
      }
    }

    return [...this.travelerMarkers.values()].flat().map((mover) => mover.object);
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

  private hasSettlement(land: Land): boolean {
    return land.hasVillage;
  }

  /**
   * Draws a dirt-road-styled curve as many short segments so its width can taper between
   * the two settlements it connects (wider at a castle, narrower at a village/mine), with
   * an earthy bed and a slightly lighter, narrower worn track on top.
   */
  private drawRoad(graphics: Phaser.GameObjects.Graphics, curve: Phaser.Curves.Spline, widthFrom: number, widthTo: number): void {
    this.mapRenderer.drawRoad(graphics, curve.getSpacedPoints(32), widthFrom, widthTo);
  }
}
