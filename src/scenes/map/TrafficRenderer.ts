/**
 * Roads connecting settlements, plus the animated ox-carts and travelers that
 * wander along them. Pairs with selected environment and item renderers.
 */
import Phaser from 'phaser';
import { buildRoadCurve } from '../../map/roadCurve';
import { faceTravel, type Walkable } from '../../ui/ink/life';
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
  /** The world-space span of each road, so the view index can place its movers without chasing them. */
  private moverSpans = new Map<string, { x1: number; y1: number; x2: number; y2: number }>();
  /** Whether the world's clock is stopped. New movers are created to match. */
  private paused = false;
  /** Movers held back by the view index because their road is off-screen. */
  private culled = new Set<string>();

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
    if (paused) {
      for (const mover of this.movers()) {
        mover.tween.pause();
      }
      return;
    }
    // Releasing the clock must not release the movers the camera has culled — they are still
    // off-screen, and resuming them here would quietly undo the view culling on every unpause.
    for (const target of this.cullTargets()) {
      if (this.culled.has(target.id)) {
        continue;
      }
      this.moverById(target.id)?.tween.resume();
    }
  }

  private movers(): TrafficMover[] {
    return [...this.cartMarkers.values(), ...[...this.travelerMarkers.values()].flat()];
  }

  /**
   * Every mover with the road it walks, for the view index.
   *
   * Indexed by the road's midpoint and half its length rather than by where the mover happens to
   * be, so a cart never has to be re-indexed as it walks. Culling these is the largest single
   * saving on the map: each one runs an `onUpdate` every frame that evaluates a spline, for every
   * road pair in the country, whether or not the camera is anywhere near it.
   */
  cullTargets(): Array<{ id: string; x: number; y: number; radius: number }> {
    const out: Array<{ id: string; x: number; y: number; radius: number }> = [];
    for (const [key, span] of this.moverSpans) {
      const x = (span.x1 + span.x2) / 2;
      const y = (span.y1 + span.y2) / 2;
      const radius = Math.hypot(span.x2 - span.x1, span.y2 - span.y1) / 2 + 40;
      // `::` because a road key is itself `landA|landB` — splitting these on `|` is ambiguous.
      if (this.cartMarkers.has(key)) {
        out.push({ id: `cart::${key}`, x, y, radius });
      }
      const walkers = this.travelerMarkers.get(key) ?? [];
      for (let index = 0; index < walkers.length; index += 1) {
        out.push({ id: `walk::${key}::${index}`, x, y, radius });
      }
    }
    return out;
  }

  /**
   * Holds or releases one mover because the camera has left or reached its road.
   *
   * Deliberately does not fight `setPaused`: releasing a mover while the world's clock is stopped
   * only makes it visible again, it does not start it walking. The two reasons a cart can be still
   * are independent, and the clock outranks the camera.
   */
  setCulled(id: string, culled: boolean): void {
    const mover = this.moverById(id);
    if (!mover) {
      return;
    }
    if (culled) {
      this.culled.add(id);
      mover.tween.pause();
    } else {
      this.culled.delete(id);
      if (!this.paused) {
        mover.tween.resume();
      }
    }
    (mover.object as unknown as { setVisible(v: boolean): unknown }).setVisible(!culled);
  }

  private moverById(id: string): TrafficMover | undefined {
    const parts = id.split('::');
    if (parts[0] === 'cart') {
      return this.cartMarkers.get(parts[1]);
    }
    return this.travelerMarkers.get(parts[1])?.[Number(parts[2])];
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
      //
      // `faceTravel` multiplies the step's direction by the direction the glyph was *drawn* in.
      // Flipping on travel alone assumes every glyph faces +x, and the Đông Hồ xe trâu is drawn
      // facing left — so under that assumption it was pointed the wrong way on BOTH legs: mirrored
      // when it went left, unmirrored when it went right.
      const heading = point.x - (mover as unknown as { x: number }).x;
      if (Math.abs(heading) > 0.05) {
        const next = heading < 0 ? -1 : 1;
        if (next !== facing) {
          facing = next;
          if (mover.setScale) faceTravel(mover as unknown as Walkable, next);
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

  /**
   * Drops a road's span once nothing walks it any more.
   *
   * Carts and travellers are retired independently, so the span survives until both are gone —
   * otherwise retiring a cart would strand its road's travellers outside the view index, and they
   * would never be culled again.
   */
  private forgetSpan(key: string, ...culledIds: string[]): void {
    for (const id of culledIds) {
      this.culled.delete(id);
    }
    if (!this.cartMarkers.has(key) && !this.travelerMarkers.has(key)) {
      this.moverSpans.delete(key);
    }
  }

  /** Remembers where a road runs, so its movers can be indexed once instead of tracked. */
  private recordSpan(key: string, curve: Phaser.Curves.Spline): void {
    const start = curve.getStartPoint();
    const end = curve.getEndPoint();
    this.moverSpans.set(key, { x1: start.x, y1: start.y, x2: end.x, y2: end.y });
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
        this.recordSpan(key, curve);

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
        this.forgetSpan(key, `cart::${key}`);
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
        this.recordSpan(key, curve);
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
        travelers.forEach((traveler, index) => {
          this.retire(traveler);
          this.culled.delete(`walk::${key}::${index}`);
        });
        this.travelerMarkers.delete(key);
        this.forgetSpan(key);
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
