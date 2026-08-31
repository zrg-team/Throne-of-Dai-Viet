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
import { marchEntersLand } from '../../systems/WarSystem';
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
/** How far the block rises on a step, and how long a step takes. */
const MARCH_TREAD = -0.9;
const MARCH_TREAD_MS = 340;
const DUST_INTERVAL_MS = 45;
/** The same pigment the ground shadow uses, so a puff reads as dust and not as sage paint. */
const DUST_INK = 0x2a2118;
/** How long one puff lingers before it has faded entirely. */
/**
 * How long a puff lasts — and therefore how long the trail is.
 *
 * A column crosses about a hundred and fifty points a second, so at half a second of life the
 * trail stretched ninety points behind the men and every puff in it was most of the way faded:
 * a long grey smear detached from the host rather than dust at its heels. Measured, not guessed
 * (`shot-march-map.mjs` prints the distance from the marker to each live puff).
 *
 * Cut again with the march column. At 300 ms the live puffs measured 12 to 50 points behind the
 * marker and 20 to 52 points across on screen — a chain of five dark ellipses, each about as wide
 * as the host, strung out on the bare road behind it. That chain is the "shadow of the moving army"
 * players report: a shadow belongs *under* a thing, and these were beside it with nobody on them.
 * At 200 ms the trail is a third as long, and the puffs now rise along the column's own length
 * rather than from one point at its head — so they read as ground under marching men.
 */
const DUST_LIFE_MS = 200;

/**
 * How far a marker paints around its own anchor, for the view index.
 *
 * A host is drawn from its feet up and out: the column, the standards beside it, the general's
 * portrait badge above the shoulder, and the dust behind. Generous rather than tight — the cost of
 * over-reaching is one marker drawn just off-screen.
 */
const MARKER_REACH = 90;

/**
 * How far along a leg a host walks when it will not enter the province at the other end.
 *
 * The road runs seat to seat, so the province line sits near the middle of it — and the middle is
 * where a host that has come to fight for a place stands: on the edge of its own ground, with the
 * target's fields in front of it. Not 1: at 1 the marker arrives somewhere the army never goes,
 * and the walk back from there is the jump this replaces.
 */
const FRONTIER_T = 0.5;

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
  /**
   * When each host last kicked up dust — **per host**, not one clock for the whole map.
   *
   * A single shared timestamp meant two columns on the road split one puff budget between them
   * and each got half a trail; three got a third each. The rate limit is about how often *a
   * column* kicks up dust, so it belongs to the column.
   */
  private lastDustAt = new Map<string, number>();
  /**
   * The leg each marching host is walking, end to end — so the view index can cover the whole
   * road rather than the point the marker happened to occupy when it was last indexed.
   */
  private legSpans = new Map<string, { x1: number; y1: number; x2: number; y2: number }>();
  /** How far back along the road each marching host reaches — the length its dust rises along. */
  private columnReach = new Map<string, number>();
  /** Milliseconds per world unit for each host's current march, so nothing else has to guess. */
  private paceMs = new Map<string, number>();
  /** Whether the world's clock is stopped. A stopped clock stops the marches with it. */
  private paused = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly mapItems: MapItemRenderer,
  ) {}

  /**
   * Holds or releases every march.
   *
   * A march is a tween, and a tween owes nothing to the economy tick — so the player stopped the
   * clock for a card and the hosts kept walking, ran out their legs against a tick that was not
   * coming, and stood frozen wherever they happened to finish. Dragon Ascent stops the clock
   * constantly, so that was most of the stop-start in a march. Carts, birds and weather already
   * follow the clock (`TrafficRenderer.setPaused`); armies now do too, and a paused column stops
   * kicking up dust because the tween that spawns it is no longer running.
   */
  setPaused(paused: boolean): void {
    if (paused === this.paused) return;
    this.paused = paused;
    for (const tween of this.moveTweens.values()) {
      if (paused) tween.pause();
      else tween.resume();
    }
  }

  /**
   * The army markers, for the view index.
   *
   * Re-read on every `drawArmies`, because a host moves. Between refreshes a marker tweens along
   * its whole leg, so a marching host is indexed by **the road it is walking** — the leg's midpoint
   * and half its length — exactly as `TrafficRenderer` indexes a cart. Chasing the marker across
   * cells every frame would cost more than drawing it, and the pose-gated `syncViewCulling` would
   * not re-run for it anyway while the camera sits still.
   *
   * A fixed 200-unit reach around the last indexed point was the previous answer, and it was one
   * province-hop from being wrong: measured on a normal Ascent map (`_marchwatch`), a marker drifts
   * up to 193 units from where it was indexed inside a single leg. A longer leg — a bigger map, a
   * wider province — would have taken a visible host off the screen with it.
   */
  cullTargets(): Array<{
    id: string; object: Phaser.GameObjects.Container; x: number; y: number; radius: number;
  }> {
    return [...this.markers.entries()].map(([id, object]) => {
      const span = this.legSpans.get(id);
      if (!span) {
        return { id, object, x: object.x, y: object.y, radius: MARKER_REACH };
      }
      return {
        id,
        object,
        x: (span.x1 + span.x2) / 2,
        y: (span.y1 + span.y2) / 2,
        radius: Math.hypot(span.x2 - span.x1, span.y2 - span.y1) / 2 + MARKER_REACH,
      };
    });
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
      // Whether this host is on the road, which decides both how it is *drawn* — in column, see
      // `MARCH_PLAN` — and whether it carries its general's portrait. Read once, above the
      // signature, because the arrangement is part of what the marker is.
      const order = state.movementOrders.find((candidate) => candidate.armyId === army.id);
      const marching = Boolean(order);
      // Which way the road runs, from this province to the next one on the path — the column is
      // drawn filed along it. Quantised to eight points of the compass: the heading is part of the
      // marker's redraw signature, and a column that rebuilt every time the road bent a degree
      // would rebuild every frame it walked.
      const heading = order && order.path.length > 0
        ? headingBetween(state, land, findLand(state, order.path[0]) ?? land, getAnchor, wx, wy)
        : 0;
      const kit = { ...hostKitFor(state, army), marching, marchHeading: heading };
      // The kit is part of what the marker *is*, so it belongs in the signature that decides
      // whether to redraw one. Without it an era turning, or a host being re-equipped, would
      // leave the old wardrobe on the map until the headcount happened to change.
      const sig = `${total}|${isPlayer ? 1 : 0}|${kingdomColor ?? 0}|${flagSeed}`
        + `|${kit.theme ?? kit.era}|${kit.tier}|${Math.round((kit.units?.archers ?? 0) / Math.max(1, total) * 8)}`
        + `|${Math.round((kit.units?.heavyInfantry ?? 0) / Math.max(1, total) * 8)}`
        // Falling in and breaking ranks each redraw the host exactly once — twice a journey, plus
        // once more wherever the road turns a corner sharp enough to change the compass point.
        + `|${marching ? `march:${heading.toFixed(2)}` : 'stand'}`;
      if (this.contentSig.get(army.id) !== sig) {
        // Kill the old formation's looping tween before destroying its container,
        // otherwise it keeps ticking against a dead object (CPU leak).
        this.killTweensDeep(marker);
        marker.removeAll(true);
        this.selectionFlags.delete(army.id);
        this.faceBadges.delete(army.id);
        const body = this.mapItems.createArmyMarker(
          total, isPlayer, kingdomColor, flagSeed, kit,
        );
        marker.add(body);
        // **The tread.**
        //
        // The men themselves cannot move: a Đông Hồ host is drawn into one Graphics, so there are
        // no individual figures to animate. What can move is the block, and a column on the road
        // rises and falls at a step's tempo. Applied to the host's own container rather than to
        // the marker, because the marker's position is written every frame by the march tween and
        // a second tween on the same property would fight it.
        //
        // Small on purpose — under a point. An earlier pass bounced the whole marker and it read
        // as hopping rather than marching.
        if (marching) {
          this.scene.tweens.add({
            targets: body,
            y: MARCH_TREAD,
            duration: MARCH_TREAD_MS,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
          });
        }
        this.contentSig.set(army.id, sig);
      }

      // The general's face beside a standing host, so "who is where" reads off the map. Only
      // while the host stands — a marching column carries its standard, not a portrait — and
      // only for the player's own hosts, whose generals are the ones with faces.
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
        // **How much of this road the host will actually walk.**
        //
        // A leg onto ground the host will not enter — a rival's province, a village, wilderness
        // with a hostile camped on it — ends in a fight picked from where the host stands, and
        // `progressMovementOrders` leaves `army.landId` alone. Walking the column the whole way
        // and then discovering it never moved is what produced the flight home; it now marches to
        // the frontier and holds there, which is the thing the rule describes.
        const legEnd = nextLand && !marchEntersLand(state, army, nextLand) ? FRONTIER_T : 1;

        if (this.moveLegs.get(army.id) !== legKey) {
          const continuing = this.moveLegs.has(army.id);
          this.moveLegs.set(army.id, legKey);
          this.stopMarch(army.id);
          this.scene.tweens.killTweensOf(marker);

          const start = curve.getPoint(0);
          marker.setPosition(start.x + MARKER_OFFSET_X, start.y + MARKER_OFFSET_Y);
          // The whole road this leg covers, so the view index can hold the marker for all of it.
          const finish = curve.getPoint(legEnd);
          this.legSpans.set(army.id, {
            x1: start.x + MARKER_OFFSET_X, y1: start.y + MARKER_OFFSET_Y,
            x2: finish.x + MARKER_OFFSET_X, y2: finish.y + MARKER_OFFSET_Y,
          });

          // How far back along the road this host reaches, so its dust rises along the whole column
          // rather than from the single point at its head. Measured once per leg from what was
          // actually drawn: `MARCH_PLAN` files the blocks front-to-back, so a host's length depends
          // on how many men it has, and a fixed offset is right for exactly one army size. The AABB
          // diagonal stands in for the long axis — a column reads the same length whether it runs
          // down the sheet (8 x 52) or across it on the diagonal (37 x 37).
          const body = marker.list[0] as Phaser.GameObjects.Container | undefined;
          const drawn = body?.getBounds ? body.getBounds() : undefined;
          this.columnReach.set(
            army.id,
            drawn ? Math.min(70, Math.hypot(drawn.width, drawn.height) * 0.5) : 0,
          );

          const activeMarker = marker;
          const progress = { t: 0 };
          // Timed to the clock this mode actually ticks on. Dragon Ascent runs at ASCENT_TICK_MS,
          // so pacing every march against the classic REALTIME_TICK_MS made the marker finish its
          // slide well before the leg resolved and then sit frozen on the road.
          const duration = Math.max(1, order.legRequired - order.progress) * tickMs(state);
          // How long this host takes to cover one world unit, so anything else that has to move it
          // — the walk home when an order ends — moves it at the pace it marches at rather than at
          // a flat time that becomes a teleport over any real distance.
          const legLength = Math.max(1, curve.getLength() * legEnd);
          this.paceMs.set(army.id, duration / legLength);
          // **A column sets off once and pulls up once — not at every waypoint.**
          //
          // Every leg used to ease in *and* out, so a host crossing four provinces came to a dead
          // stop and started again three times on the way. Easing *in* on every leg but the last
          // was no better: `easeIn` ends at full speed and the next leg starts from nothing, so
          // the stop simply moved to the far side of the boundary. A leg accelerates only if the
          // host is setting off, decelerates only if it is pulling up here, and otherwise holds
          // its pace straight through the province line.
          const stopsHere = order.path.length === 1 || legEnd < 1;
          const ease = continuing
            ? (stopsHere ? 'Sine.easeOut' : 'Linear')
            : (stopsHere ? 'Sine.easeInOut' : 'Sine.easeIn');
          const marchTween = this.scene.tweens.add({
            targets: progress,
            t: 1,
            duration,
            ease,
            onUpdate: () => {
              if (!activeMarker.active) return;
              const point = curve.getPoint(progress.t * legEnd);
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
              //
              // **At the men's heels, and behind them.**
              //
              // Two different wrong places, one after the other. It was first offset a fixed ten
              // points to the *left* of the marker whichever way the host was walking; correcting
              // that to the curve point then put it on the bare road — and the men do not stand on
              // the bare road. `MARKER_OFFSET` lifts the marker twenty-eight points above the
              // curve and eighteen across, and the marker's origin is the block's ground line, so
              // the feet are at the *marker*, not at the point. Spawning on the curve dropped every
              // puff a clear twenty-eight points below the column: the detached smudge reported
              // here.
              //
              // So: the marker's own position, walked back along the direction of travel.
              const ahead = curve.getPoint(Math.min(1, (progress.t + 0.02) * legEnd));
              const hx = ahead.x - point.x;
              const hy = ahead.y - point.y;
              const len = Math.hypot(hx, hy) || 1;
              //
              // **Along the column, not off the front of it.** The marker's origin is the block's
              // ground line, which since the march plan became a real column is the *leading*
              // rank's feet — every man is behind it. Dropping every puff four points off that
              // point put the dust in front of the host and left it there as the host walked away.
              // Each puff now rises somewhere along the host's own length.
              const back = 4 + Math.random() * (this.columnReach.get(army.id) ?? 0);
              this.spawnDust(
                army.id,
                point.x + MARKER_OFFSET_X - (hx / len) * back,
                point.y + MARKER_OFFSET_Y - (hy / len) * back,
              );
            },
          });
          // Born stopped if the world is stopped: `refresh()` can hand a new leg out while a
          // prompt holds the clock, and a tween created mid-pause would be the one thing still
          // walking.
          if (this.paused) marchTween.pause();
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
        // **Coming to rest — at walking pace, whatever the distance.**
        //
        // This used to snap, then it eased over a flat 320 ms. A fixed time is a walk over a few
        // points and a teleport over a few hundred, and a few hundred is the normal case: an
        // attack order ends with the order deleted and the host still standing in its own
        // province, so the marker had a whole leg to cover. Measured at up to 1,500 units/second
        // against a marching 100–170 — the ten-fold spike a player reads as the army snapping.
        //
        // The frontier clamp above means there is usually only the walk back from the border left
        // to do, and this covers it at the pace the host was marching at, so the return is a march
        // rather than a jump. `paceMs` is milliseconds per world unit, recorded when the leg began.
        const center = getAnchor(land);
        const restX = wx(center.x) + MARKER_OFFSET_X;
        const restY = wy(center.y) + MARKER_OFFSET_Y;
        const wasMarching = this.moveLegs.has(army.id);
        this.moveLegs.delete(army.id);
        this.stopMarch(army.id);

        const away = Math.hypot(marker.x - restX, marker.y - restY);
        if (wasMarching && away > 1) {
          this.scene.tweens.killTweensOf(marker);
          const pace = this.paceMs.get(army.id) ?? (ARRIVE_MS / 40);
          // Held in `moveTweens` like a march, because that is what it is: it moves the host
          // across the map for seconds, and it has to stop when the world's clock does.
          const settle = this.scene.tweens.add({
            targets: marker,
            x: restX,
            y: restY,
            rotation: 0,
            // Capped so a host that somehow has half the map to cross does not walk for a minute,
            // and floored so a step of two points is still a step rather than an instant.
            duration: Phaser.Math.Clamp(away * pace, ARRIVE_MS, 4000),
            // Settles rather than springing. `Back.easeOut` overshoots and snaps back, which on
            // a container full of individually-bobbing soldiers reads as a stumble on arrival.
            ease: 'Sine.easeOut',
            onComplete: () => this.moveTweens.delete(army.id),
          });
          if (this.paused) settle.pause();
          this.moveTweens.set(army.id, settle);
        } else if (away <= 1) {
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
  private spawnDust(armyId: string, x: number, y: number): void {
    const now = this.scene.time.now;
    if (now - (this.lastDustAt.get(armyId) ?? 0) < DUST_INTERVAL_MS) return;
    this.lastDustAt.set(armyId, now);

    // **Scaled to the men, not to the map.**
    //
    // A puff was eight to fourteen points across and grew to twice that, which on a host drawn
    // ten points wide is a grey ellipse larger than the column that raised it — reported as blobs
    // beside the men rather than dust behind them. A boot lifts a little dust, and there is more
    // of it than there is of any one puff: these are a third the size, half as dark, live a third
    // as long, and come twice as often.
    //
    // Cut again with the trail (see `DUST_LIFE_MS`): on screen these measured 20 to 52 points
    // across against a column eight points wide, which is not dust — it is a row of puddles. A
    // puff is now about a third of a man wide and half as dark as it was.
    const puff = this.scene.add.ellipse(
      x - 2 + Math.random() * 4,
      // Kept low. Dust hangs at the ankles for a moment before it lifts.
      y - 0.5 + Math.random() * 2,
      3 + Math.random() * 2,
      1.6 + Math.random() * 1,
      // **Ink, not mountain.**
      //
      // `INK.mountain` is a muted sage (0x8a9883) laid over a cream map: correcting a puff that
      // was too big by also making it fainter left dust the same value as the ground it sat on,
      // which is invisible rather than subtle. The ground shadow under a host is `muc` at 0.07,
      // so dust is the same pigment at rather more than double — a warm smudge that reads on
      // parchment without becoming a blot.
      DUST_INK,
      0.18,
    );
    puff.setDepth(69);
    this.dust.push(puff);

    this.scene.tweens.add({
      targets: puff,
      alpha: 0,
      // Spreads as it settles rather than billowing: a marching column is not a cavalry charge.
      scaleX: 1.6,
      scaleY: 1.3,
      y: puff.y - 2.8,
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
    // The leg it was walking goes with it: a host that has stopped is indexed where it stands.
    this.legSpans.delete(armyId);
    this.columnReach.delete(armyId);
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

/**
 * The compass point the road takes from one province to the next, in radians.
 *
 * Eight points, not a continuous angle: this feeds the marker's redraw signature, so it has to be
 * a value that changes rarely. A host walking a curve keeps one heading for the whole leg.
 */
function headingBetween(
  state: GameState,
  from: Land,
  to: Land,
  getAnchor: SettlementAnchor,
  wx: WorldTransform,
  wy: WorldTransform,
): number {
  void state;
  const a = getAnchor(from);
  const b = getAnchor(to);
  const dx = wx(b.x) - wx(a.x);
  const dy = wy(b.y) - wy(a.y);
  if (dx === 0 && dy === 0) return 0;
  const step = Math.PI / 4;
  return Math.round(Math.atan2(dy, dx) / step) * step;
}
