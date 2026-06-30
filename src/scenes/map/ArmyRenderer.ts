/**
 * Army markers on the map: static seal/troop-count glyphs for armies sitting still,
 * smoothly-sliding markers (with a destination arrow) for armies under a movement
 * order, and a gold command pennant for the player's currently-selected army.
 * Pairs with the selected map-item renderer for glyphs and `roadCurve` for march geometry.
 */
import Phaser from 'phaser';
import { PLAYER_KINGDOM_ID, REALTIME_TICK_MS } from '../../game/constants';
import { buildRoadCurve } from '../../map/roadCurve';
import { findLand } from '../../systems/LandSystem';
import type { GameState, Land } from '../../state/types';
import type { MapItemRenderer } from '../../ui/MapItemRenderer';

type WorldTransform = (value: number) => number;
type SettlementAnchor = (land: Land) => { x: number; y: number };
type ArmyPointerHandler = (armyId: string, pointer: Phaser.Input.Pointer, event: Phaser.Types.Input.EventData) => void;

const MARKER_OFFSET_X = 18;
const MARKER_OFFSET_Y = -28;

export class ArmyRenderer {
  private markers = new Map<string, Phaser.GameObjects.Container>();
  private moveLegs = new Map<string, string>();
  private destinationMarkers: Phaser.GameObjects.GameObject[] = [];
  /** Signature (`total|isPlayer`) of each marker's current visual content, so we
   *  only rebuild the expensive seal+formation when it actually changes. */
  private contentSig = new Map<string, string>();
  private selectionFlags = new Map<string, Phaser.GameObjects.Container>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly mapItems: MapItemRenderer,
  ) {}

  /**
   * Draws every visible army's marker. Static markers sit at their land's settlement
   * anchor; armies with an active movement order instead get a tween that slides their
   * marker along the road curve to the next land, restarted only when the leg changes
   * so repeated calls during the same leg don't interrupt the animation.
   */
  drawArmies(
    state: GameState,
    wx: WorldTransform,
    wy: WorldTransform,
    getAnchor: SettlementAnchor,
    onArmyPointerDown: ArmyPointerHandler,
  ): void {
    for (const marker of this.destinationMarkers) {
      marker.destroy();
    }
    this.destinationMarkers = [];

    const activeIds = new Set<string>();

    for (const army of state.armies) {
      const land = findLand(state, army.landId);
      if (!land?.isVisible) {
        continue;
      }
      activeIds.add(army.id);

      const total = army.units.spearmen + army.units.archers + army.units.heavyInfantry;
      const isPlayer = army.kingdomId === PLAYER_KINGDOM_ID;

      let marker = this.markers.get(army.id);
      if (!marker) {
        marker = this.scene.add.container(0, 0);
        marker.setDepth(70);
        this.markers.set(army.id, marker);

        if (isPlayer) {
          marker.setInteractive(new Phaser.Geom.Circle(0, -18, 28), Phaser.Geom.Circle.Contains);
          marker.on(
            'pointerdown',
            (
              pointer: Phaser.Input.Pointer,
              _localX: number,
              _localY: number,
              event: Phaser.Types.Input.EventData,
            ) => onArmyPointerDown(army.id, pointer, event),
          );
        }
      }

      // Only rebuild the seal + 12-soldier formation (~40 objects + a looping bob
      // tween) when the troop count or owner actually changes. On a normal tick
      // these are unchanged, so we skip the destroy/recreate churn entirely.
      const sig = `${total}|${isPlayer ? 1 : 0}`;
      if (this.contentSig.get(army.id) !== sig) {
        // Kill the old formation's looping tween before destroying its container,
        // otherwise it keeps ticking against a dead object (CPU leak).
        this.killTweensDeep(marker);
        marker.removeAll(true);
        this.selectionFlags.delete(army.id);
        marker.add(this.mapItems.createArmyMarker(total, isPlayer));
        this.contentSig.set(army.id, sig);
      }

      const selected = state.selectedArmyId === army.id;
      const hasFlag = this.selectionFlags.has(army.id);
      if (selected && !hasFlag) {
        const flag = this.mapItems.createSelectionFlag();
        marker.add(flag);
        this.selectionFlags.set(army.id, flag);
      } else if (!selected && hasFlag) {
        this.selectionFlags.get(army.id)!.destroy();
        this.selectionFlags.delete(army.id);
      }

      const order = state.movementOrders.find((candidate) => candidate.armyId === army.id);
      if (order && order.path.length > 0) {
        const nextLand = findLand(state, order.path[0]);
        const curve = buildRoadCurve(
          state,
          getAnchor(land),
          nextLand ? getAnchor(nextLand) : getAnchor(land),
          `army|${land.id}|${order.path[0]}`,
          wx,
          wy,
        );
        const legKey = `${army.id}|${land.id}|${order.path[0]}`;

        if (this.moveLegs.get(army.id) !== legKey) {
          this.moveLegs.set(army.id, legKey);
          this.scene.tweens.killTweensOf(marker);

          const start = curve.getPoint(0);
          marker.setPosition(start.x + MARKER_OFFSET_X, start.y + MARKER_OFFSET_Y);

          const activeMarker = marker;
          const progress = { t: 0 };
          this.scene.tweens.add({
            targets: progress,
            t: 1,
            duration: Math.max(1, order.legRequired - order.progress) * REALTIME_TICK_MS,
            ease: 'Linear',
            onUpdate: () => {
              const point = curve.getPoint(progress.t);
              activeMarker.setPosition(point.x + MARKER_OFFSET_X, point.y + MARKER_OFFSET_Y);
            },
          });
        }

        const destLand = findLand(state, order.path[order.path.length - 1]);
        if (destLand) {
          const anchor = getAnchor(destLand);
          const arrow = this.mapItems.createDestinationArrow();
          arrow.setPosition(wx(anchor.x), wy(anchor.y) - 40);
          arrow.setDepth(71);
          this.destinationMarkers.push(arrow);
        }
      } else {
        this.moveLegs.delete(army.id);
        this.scene.tweens.killTweensOf(marker);
        const center = getAnchor(land);
        marker.setPosition(wx(center.x) + MARKER_OFFSET_X, wy(center.y) + MARKER_OFFSET_Y);
      }
    }

    for (const [armyId, marker] of this.markers) {
      if (!activeIds.has(armyId)) {
        this.killTweensDeep(marker);
        marker.destroy();
        this.markers.delete(armyId);
        this.moveLegs.delete(armyId);
        this.contentSig.delete(armyId);
        this.selectionFlags.delete(armyId);
      }
    }
  }

  /** Kills tweens on a container and every nested descendant (e.g. the formation's
   *  looping bob), so destroying it doesn't leave orphaned tweens updating dead objects. */
  private killTweensDeep(obj: Phaser.GameObjects.GameObject): void {
    this.scene.tweens.killTweensOf(obj);
    const list = (obj as Phaser.GameObjects.Container).list;
    if (Array.isArray(list)) {
      for (const child of list) this.killTweensDeep(child);
    }
  }
}
