/**
 * Army markers on the map: static seal/troop-count glyphs for armies sitting still,
 * smoothly-sliding markers (with a destination arrow) for armies under a movement
 * order, and a gold command pennant for the player's currently-selected army.
 * Pairs with the selected map-item renderer for glyphs and `roadCurve` for march geometry.
 */
import Phaser from 'phaser';
import { PLAYER_KINGDOM_ID, REALTIME_TICK_MS } from '../../game/constants';
import { ASCENT_TICK_MS } from '../../game/ascentConfig';
import { INK } from '../../ui/inkTheme';
import { buildRoadCurve } from '../../map/roadCurve';
import { findLand } from '../../systems/LandSystem';
import { heroFaceTextureKey } from '../../ui/FaceRenderer';
import type { GameState, Land } from '../../state/types';
import { hostKitFor } from '../../ui/ink/devices';
import type { MapItemRenderer } from '../../ui/MapItemRenderer';

type WorldTransform = (value: number) => number;
type SettlementAnchor = (land: Land) => { x: number; y: number };
type ArmyPointerHandler = (armyId: string, pointer: Phaser.Input.Pointer, event: Phaser.Types.Input.EventData) => void;

const MARKER_OFFSET_X = 18;
const MARKER_OFFSET_Y = -28;
/** Where the general's face sits beside a standing host, relative to the marker's ground line. */
const FACE_BADGE_X = 26;
const FACE_BADGE_Y = -34;
/**
 * The general's portrait beside his host.
 *
 * 26 put a face three and a quarter times a soldier's height next to the men it belonged to, which
 * on a map where a five-metre house is 11.2 px made the badge the largest thing in the province
 * after the citadel. 19 still reads at a glance and stops competing with the host it labels.
 */
const FACE_BADGE_SIZE = 19;

/** How long a host takes to settle onto its destination once the leg resolves. */
const ARRIVE_MS = 320;
/** Milliseconds between dust puffs behind a marching column. */
const DUST_INTERVAL_MS = 90;
/** How long one puff lingers before it has faded entirely. */
const DUST_LIFE_MS = 620;

/** The economy clock the current mode runs on — marches are paced against it. */
function tickMs(state: GameState): number {
  return state.gameMode === 'ascent' ? ASCENT_TICK_MS : REALTIME_TICK_MS;
}

export class ArmyRenderer {
  private markers = new Map<string, Phaser.GameObjects.Container>();
  private moveLegs = new Map<string, string>();
  /** The march tween per army. Its target is a plain `{t}` counter, so `killTweensOf(marker)`
   *  can never find it — this handle is the only way to stop one. Without it, a leg change left
   *  two tweens fighting over `setPosition`, and a destroyed marker kept walking and kicking up
   *  dust until the orphan ran out on its own. */
  private moveTweens = new Map<string, Phaser.Tweens.Tween>();
  private destinationMarkers: Phaser.GameObjects.GameObject[] = [];
  /** Signature (`total|isPlayer`) of each marker's current visual content, so we
   *  only rebuild the expensive seal+formation when it actually changes. */
  private contentSig = new Map<string, string>();
  private selectionFlags = new Map<string, Phaser.GameObjects.Container>();
  /** The general's face beside a standing host, keyed by army; absent while it marches. */
  private faceBadges = new Map<string, { heroId: string; badge: Phaser.GameObjects.GameObject }>();
  /** Live dust puffs, so they can be cleared without leaking tweens. */
  private dust: Phaser.GameObjects.Ellipse[] = [];
  private lastDustAt = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly mapItems: MapItemRenderer,
  ) {}

  /**
   * The army markers, for the view index.
   *
   * Re-read on every `drawArmies`, because a host moves. Between refreshes a marker tweens along
   * its leg, so the caller gives it a generous reach rather than re-indexing it every frame — a
   * marker is one object, and chasing it across cells would cost more than drawing it.
   */
  cullTargets(): Array<{ id: string; object: Phaser.GameObjects.Container }> {
    return [...this.markers.entries()].map(([id, object]) => ({ id, object }));
  }

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
      const kingdomColor = state.kingdoms.find((k) => k.id === army.kingdomId)?.color;
      // The player's host flies the realm's own standard — the seed its provinces are flagged
      // with (`MapScene.drawLandFlags`) — and a rival's a stable style of its own.
      const flagSeed = isPlayer
        ? state.mapConfig.seed
        : Math.max(0, state.kingdoms.findIndex((k) => k.id === army.kingdomId));

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
      const kit = hostKitFor(state, army);
      // The kit is part of what the marker *is*, so it belongs in the signature that decides
      // whether to redraw one. Without it an era turning, or a host being re-equipped, would
      // leave the old wardrobe on the map until the headcount happened to change.
      const sig = `${total}|${isPlayer ? 1 : 0}|${kingdomColor ?? 0}|${flagSeed}`
        + `|${kit.theme ?? kit.era}|${kit.tier}|${Math.round((kit.units?.archers ?? 0) / Math.max(1, total) * 8)}`
        + `|${Math.round((kit.units?.heavyInfantry ?? 0) / Math.max(1, total) * 8)}`;
      if (this.contentSig.get(army.id) !== sig) {
        // Kill the old formation's looping tween before destroying its container,
        // otherwise it keeps ticking against a dead object (CPU leak).
        this.killTweensDeep(marker);
        marker.removeAll(true);
        this.selectionFlags.delete(army.id);
        this.faceBadges.delete(army.id);
        marker.add(this.mapItems.createArmyMarker(
          total, isPlayer, kingdomColor, flagSeed, kit,
        ));
        this.contentSig.set(army.id, sig);
      }

      // The general's face beside a standing host, so "who is where" reads off the map. Only
      // while the host stands — a marching column carries its standard, not a portrait — and
      // only for the player's own hosts, whose generals are the ones with faces.
      const marching = state.movementOrders.some((candidate) => candidate.armyId === army.id);
      const general = isPlayer && !marching && !army.isLevy
        ? state.heroes.find((hero) => hero.id === army.generalHeroId)
        : undefined;
      const existing = this.faceBadges.get(army.id);
      if (existing && (!general || existing.heroId !== general.id)) {
        existing.badge.destroy();
        this.faceBadges.delete(army.id);
      }
      if (general && !this.faceBadges.has(army.id)) {
        const key = heroFaceTextureKey(this.scene, general);
        if (key) {
          const badge = this.scene.add.image(FACE_BADGE_X, FACE_BADGE_Y, key);
          const frame = this.scene.textures.getFrame(key);
          const scale = FACE_BADGE_SIZE / Math.max(1, Math.max(frame.width, frame.height));
          badge.setScale(scale);
          marker.add(badge);
          this.faceBadges.set(army.id, { heroId: general.id, badge });
        }
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
          this.stopMarch(army.id);
          this.scene.tweens.killTweensOf(marker);

          const start = curve.getPoint(0);
          marker.setPosition(start.x + MARKER_OFFSET_X, start.y + MARKER_OFFSET_Y);

          const activeMarker = marker;
          const progress = { t: 0 };
          const marchTween = this.scene.tweens.add({
            targets: progress,
            t: 1,
            // Timed to the clock this mode actually ticks on. Dragon Ascent runs at
            // ASCENT_TICK_MS, so pacing every march against the classic REALTIME_TICK_MS made
            // the marker finish its slide well before the leg resolved and then sit frozen on
            // the road — which is most of why movement "looked bad", and it was a wrong number
            // rather than a missing effect.
            duration: Math.max(1, order.legRequired - order.progress) * tickMs(state),
            // Columns set off and pull up; they do not travel at a constant rate.
            ease: 'Sine.easeInOut',
            onUpdate: () => {
              if (!activeMarker.active) return;
              const point = curve.getPoint(progress.t);
              activeMarker.setPosition(point.x + MARKER_OFFSET_X, point.y + MARKER_OFFSET_Y);
              // Dust, rather than making the marker itself jiggle.
              //
              // A previous pass added a stride bob and a lean into the direction of travel to
              // stop a marching host reading as a sliding icon. Both were a mistake: the marker
              // already contains a twelve-soldier formation with its own looping bob, so tilting
              // and bouncing the container on top made a dozen little figures wobble against
              // each other — the "many circles moving" this replaces. The column now travels
              // steadily and kicks up dust behind it, which reads as movement without
              // animating the thing that was already animated.
              this.spawnDust(point.x + MARKER_OFFSET_X, point.y + MARKER_OFFSET_Y);
            },
          });
          this.moveTweens.set(army.id, marchTween);
        }

        const destLand = findLand(state, order.path[order.path.length - 1]);
        if (destLand) {
          const anchor = getAnchor(destLand);

          // A dashed line from the column to where it is going, under the pennant.
          //
          // The pennant alone marks the destination but says nothing about *whose* march it
          // belongs to — with two or three hosts moving at once you cannot tell which arrow is
          // which. The line makes the association explicit.
          const trail = this.scene.add.graphics();
          trail.setDepth(68);
          const fromX = marker.x;
          // The marker's own origin is the block's ground line — `drawHost` anchors at `-height`
          // so the feet land at y ≈ 0. The `+6` this used to carry started the trail below the men,
          // the same off-by-a-foot-offset the standard had.
          const fromY = marker.y;
          const toX = wx(anchor.x);
          const toY = wy(anchor.y) - 12;

          // An arrow, not a dotted rule.
          //
          // This was nine evenly-weighted dashes between two points, which says *these two places
          // are related* and nothing whatever about which way anybody is walking — the same mark
          // read identically whether the host was marching out or coming home. Two things fix it
          // without any new art: the dashes **taper**, thin at the column and heavy at the target,
          // so the line has a direction even standing still; and it ends in a **head**.
          const dx = toX - fromX;
          const dy = toY - fromY;
          const len = Math.hypot(dx, dy) || 1;
          const ux = dx / len;
          const uy = dy / len;
          const HEAD = 11;
          const HEAD_HALF = 5.5;
          const shaft = Math.max(0, len - HEAD);
          const segments = 9;
          for (let i = 0; i < segments; i += 2) {
            const a = (i / segments) * shaft;
            const bEnd = Math.min(shaft, ((i + 1) / segments) * shaft);
            const t = bEnd / Math.max(1, shaft);
            trail.lineStyle(1.1 + t * 1.6, INK.sealRed, 0.34 + t * 0.4);
            trail.lineBetween(fromX + ux * a, fromY + uy * a, fromX + ux * bEnd, fromY + uy * bEnd);
          }
          // The head sits on the line's own end, pointing where the column is going.
          const tipX = fromX + ux * len;
          const tipY = fromY + uy * len;
          const backX = fromX + ux * shaft;
          const backY = fromY + uy * shaft;
          trail.fillStyle(INK.sealRed, 0.78);
          trail.fillTriangle(
            tipX, tipY,
            backX - uy * HEAD_HALF, backY + ux * HEAD_HALF,
            backX + uy * HEAD_HALF, backY - ux * HEAD_HALF,
          );
          this.destinationMarkers.push(trail);

          const arrow = this.mapItems.createDestinationArrow();
          arrow.setPosition(toX, wy(anchor.y) - 40);
          arrow.setDepth(71);
          this.destinationMarkers.push(arrow);
        }
      } else {
        // Arriving, not teleporting.
        //
        // This used to kill the march tween and snap the marker to the settlement anchor in the
        // same frame, so every journey ended in a jump — the single ugliest moment in the map's
        // animation and exactly what "looks bad after finished" describes. Now the column eases
        // the last short distance into place and settles upright.
        const center = getAnchor(land);
        const restX = wx(center.x) + MARKER_OFFSET_X;
        const restY = wy(center.y) + MARKER_OFFSET_Y;
        const wasMarching = this.moveLegs.has(army.id);
        this.moveLegs.delete(army.id);
        this.stopMarch(army.id);

        const far = Math.abs(marker.x - restX) > 1 || Math.abs(marker.y - restY) > 1;
        if (wasMarching && far) {
          this.scene.tweens.killTweensOf(marker);
          this.scene.tweens.add({
            targets: marker,
            x: restX,
            y: restY,
            rotation: 0,
            duration: ARRIVE_MS,
            // Settles rather than springing. `Back.easeOut` overshoots and snaps back, which on
            // a container full of individually-bobbing soldiers reads as a stumble on arrival.
            ease: 'Sine.easeOut',
          });
        } else if (!far) {
          marker.setRotation(0);
        } else {
          this.scene.tweens.killTweensOf(marker);
          marker.setPosition(restX, restY);
          marker.setRotation(0);
        }
      }
    }

    for (const [armyId, marker] of this.markers) {
      if (!activeIds.has(armyId)) {
        this.stopMarch(armyId);
        this.killTweensDeep(marker);
        marker.destroy();
        this.markers.delete(armyId);
        this.moveLegs.delete(armyId);
        this.contentSig.delete(armyId);
        this.selectionFlags.delete(armyId);
        this.faceBadges.delete(armyId);
      }
    }
  }

  /**
   * A puff of road dust behind a marching column.
   *
   * Rate-limited rather than emitted per frame: `onUpdate` runs every tick of the tween, and one
   * puff per frame is both a performance problem and a solid smear rather than a trail.
   */
  private spawnDust(x: number, y: number): void {
    const now = this.scene.time.now;
    if (now - this.lastDustAt < DUST_INTERVAL_MS) return;
    this.lastDustAt = now;

    const puff = this.scene.add.ellipse(
      x - 10 + Math.random() * 6,
      // Kicked up at the men's heels, not twenty pixels in front of them. The marker's origin is
      // already the ground the host stands on.
      y + 2 + Math.random() * 4,
      8 + Math.random() * 6,
      4 + Math.random() * 3,
      INK.mountain,
      0.5,
    );
    puff.setDepth(69);
    this.dust.push(puff);

    this.scene.tweens.add({
      targets: puff,
      alpha: 0,
      scaleX: 2.1,
      scaleY: 1.7,
      y: puff.y - 6,
      duration: DUST_LIFE_MS,
      ease: 'Quad.easeOut',
      onComplete: () => {
        this.dust = this.dust.filter((item) => item !== puff);
        puff.destroy();
      },
    });
  }

  /** Clears every live puff — used when the map is torn down or redrawn wholesale. */
  /** Removes an army's march tween — the `{t}` counter tween no marker-keyed kill can reach. */
  private stopMarch(armyId: string): void {
    const tween = this.moveTweens.get(armyId);
    if (tween) {
      tween.remove();
      this.moveTweens.delete(armyId);
    }
  }

  /** Scene teardown: the scene's TweenManager dies with it, but the handles must not dangle. */
  destroy(): void {
    for (const armyId of [...this.moveTweens.keys()]) {
      this.stopMarch(armyId);
    }
    this.clearDust();
  }

  clearDust(): void {
    for (const puff of this.dust) {
      this.scene.tweens.killTweensOf(puff);
      puff.destroy();
    }
    this.dust = [];
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
