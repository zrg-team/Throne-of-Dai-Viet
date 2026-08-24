/**
 * The two armies themselves on the Dragon Ascent battle screen: one marker per host, the walk that
 * carries them over the ground each beat, the redraw that thins their ranks, and the run they make
 * when they break. `buildBattleField` lays the picture's floor and calls the ground in as well — it
 * is the only rebuild path, and `battleFieldSignature` is the guard `updateBattle` checks so that
 * rebuild fires when relief arrives or a column breaks, and not otherwise.
 *
 * `ui.ourMarkers` and `ui.theirMarkers` are the only record of what is drawn, and everything here
 * writes to them. Two live wires: `redrawHostBlock` destroys a block and puts a fresh one in
 * `entry.marker`, so nothing may hold that container across a call to it; and a marker with
 * `entry.routed` set has left the line — `slideMarkers` skipping it is what lets the rout finish.
 */
import Phaser from 'phaser';
import { ourHosts, theirHosts } from '../../../systems/ascent/BattleSystem';
import { BATTLE_TICK_MS } from '../../../game/ascentConfig';
import { compactNumber } from '../../../utils/format';
import { INK_UI } from '../../../ui/InkUI';
import { faceTravel } from '../../../ui/ink/life';
import { armyShape, compositionFor, hostKitFor, hostShapeAt } from '../../../ui/ink/devices';
import { type BattleFormation } from '../../../data/ascent/formations';
import { inkPath } from '../../../ui/ink/stroke';
import type { Army, AscentBattle } from '../../../state/types';
import { battleFieldBox, hostSize, type BattleMarker } from '../constants';
import { clearLayer, killTweensDeep } from '../layers';
import { battleBaseScale, battleLines, battleRearY, battleScaleAt } from './geometry';
import type { ConquestUIScene } from '../../ConquestUIScene';
import { warmFigureStamps } from '../../../ui/ink/figureStamps';
import { PIGMENT } from '../../../ui/ink/palette';

/** Pairs a drawn marker with its host, finding the strength label to keep current. */
function trackMarker(hostId: string, marker: Phaser.GameObjects.Container, mustered?: number): BattleMarker {
  const count = marker.list.find((child) => child.type === 'Text') as Phaser.GameObjects.Text | undefined;
  return { hostId, marker, count, mustered };
}

/** Who is standing on the field, so relief arriving or a column breaking forces a redraw. */
export function battleFieldSignature(self: ConquestUIScene, battle: AscentBattle): string {
  const ours = ourHosts(self.state, battle).map((host) => host.id);
  const theirs = theirHosts(self.state, battle).map((host) => host.id);
  return `${ours.join(',')}|${theirs.join(',')}`;
}

/**
 * The two armies on their ground.
 *
 * Every host on the field gets its own marker, stacked vertically. The maths has summed
 * across hosts since relief arrived, but the field drew one formation a side — so a
 * two-column defence looked exactly like a one-column defence with a bigger number on it.
 * Drawing them separately is what makes "their vanguard is wavering" something you can see,
 * and it is what gives Focus something to point at.
 */
export function buildBattleField(self: ConquestUIScene, battle: AscentBattle): void {
  const ui = self.battleUi;
  if (!ui) return;
  const { content, field, rivalColor } = ui;
  const { leftX, rightX, span, groundY } = ui.geometry;

  clearLayer(self, field);
  ui.groundClip?.destroy();
  ui.groundClip = undefined;
  ui.ourMarkers = [];
  ui.theirMarkers = [];
  ui.fieldSignature = battleFieldSignature(self, battle);

  // Square and full-bleed. The field is a view rather than a card (see `buildBattleUi`), and a
  // radius on a view is a vignette: on a tall phone the rounded corners and the 2px inset read
  // as the picture being cut short of its own frame.
  // **Two rules, top and bottom. No frame.**
  //
  // This was `ui.panel`, which draws a closed border — and a closed border on a box that spans
  // the whole sheet puts a dark 2px rule hard against the left and right edges of the screen.
  // Measured off the drawing buffer at three device pixels in: 109,97,78 against the 221,208,177
  // of the paper beside it, the full height of the field, both sides. That is the strip that kept
  // being reported, and squaring the corners and taking the backdrop to full opacity did nothing
  // about it because it was never the backdrop — it was the picture's own frame drawn where the
  // page ends.
  //
  // A view that runs to both edges has no left or right; it is bounded by the screen, and the
  // only edges it owns are the two horizontal ones where the rails and the header meet it.
  const box = battleFieldBox(content, ui.fieldHeight);
  const ground = self.add.graphics();
  ground.fillStyle(INK_UI.parchment, 1);
  ground.fillRect(box.x, box.y, box.width, box.height);
  for (const edgeY of [box.y + 0.5, box.y + box.height - 0.5]) {
    inkPath(
      ground,
      [{ x: box.x - 2, y: edgeY }, { x: box.x + box.width + 2, y: edgeY }],
      Math.round(box.width + edgeY),
      { width: 2, alpha: 0.86, colour: INK_UI.softBrush, wobble: 0.5, step: 16 },
    );
  }
  field.add(ground);

  // The ground itself, before anything stands on it — then flattened into one texture.
  const groundFrom = field.list.length;
  self.buildBattleGround(battle);
  self.bakeBattleGround(groundFrom);

  // Camps: the ground each side is fighting from, and what "hold" means.
  // Behind their line and a little past the field's edge, at the same scale the hosts are
  // drawn: a camp tuned against a field size that changes with the screen is a camp that is the
  // wrong size on most screens.
  // Behind their line, not on it.
  //
  // It used to be placed eight units above the ground line and drawn at nearly the men's own
  // scale, so their front rank stood *inside* the tents — the two read as one collided object
  // rather than as a line with its camp behind it. Set well back, it takes the depth scale with
  // everything else and the men occlude it, which is what "behind" looks like.
  const campY = battleRearY(self);
  field.add(self.battleCamp(rightX - 4, campY, rivalColor, 23, battleScaleAt(self, campY)));

  const ours = ourHosts(self.state, battle);
  const theirs = theirHosts(self.state, battle);
  // Bake both sides' wardrobes before a single marker is built: a first-seen figure kind
  // rasterises through the canvas API, and that cost belongs here, not under a mid-fight redraw.
  for (const host of [...ours, ...theirs]) {
    warmFigureStamps(self, hostKitFor(self.state, host),
      ours.includes(host) ? PIGMENT.muc : PIGMENT.mucSoft, 'f');
  }
  const lane = (index: number, count: number): number => groundY + (index - (count - 1) / 2) * 32;

  const lines = battleLines(self, battle.ourAdvance, battle.theirAdvance);
  ours.forEach((host, index) => {
    const marker = self.battleItems!.createArmyMarker(
      hostSize(host), true, undefined, self.state.mapConfig.seed,
      { ...hostKitFor(self.state, host), mustered: hostSize(host), shape: battle.ourFormation },
      battleBaseScale(self),
    );
    marker.setPosition(lines.ourX, lane(index, ours.length));
    field.add(marker);
    const tracked = trackMarker(host.id, marker, hostSize(host));
    tracked.halfWidth = hostHalfWidth(self, host, undefined, tracked.mustered, battle.ourFormation);
    ui.ourMarkers.push(tracked);
  });

  theirs.forEach((host, index) => {
    const marker = self.battleItems!.createArmyMarker(
      hostSize(host), false, rivalColor,
      Math.max(0, self.state.kingdoms.findIndex((k) => k.id === battle.kingdomId)),
      // Unshaped while the drum beats. `drawHost` takes `undefined` to mean "not standing in
      // anything yet", which is exactly true here and is the same state a side is drawn in while
      // it re-forms mid-fight — so the picture has a word for this already.
      {
        ...hostKitFor(self.state, host),
        mustered: hostSize(host),
        shape: self.battleOpeningSealed ? undefined : battle.theirFormation,
      },
      battleBaseScale(self),
    );
    marker.setPosition(lines.theirX, lane(index, theirs.length));
    field.add(marker);
    // They face us. On the map both hosts march the same way and it never mattered; on a field
    // where the two are looking at each other across thirty units it is the difference between
    // a battle and a queue. `faceTravel` reads the prop's own declared facing rather than
    // mirroring it blind, which is the rule for every baked prop in the game.
    faceTravel(marker, -1);
    const tracked = trackMarker(host.id, marker, hostSize(host));
    tracked.halfWidth = hostHalfWidth(self, host, undefined, tracked.mustered, battle.theirFormation);
    ui.theirMarkers.push(tracked);
    // Nothing on an enemy column is tappable any more. Concentrating the line on one of them was
    // a second cursor on a screen designed for one thumb, and it asked the player to *aim* in a
    // game whose whole language is standing orders — see `docs/14-five-shapes-two-dials.html`.
    // The cinnabar ring that marked the target goes with the order it belonged to.
  });
}

/**
 * A host that broke turns and runs off its own side of the field.
 *
 * Never `setScale(-1, 1)`: these markers are baked props with a declared native facing, and
 * flipping one directly mirrors whatever it was drawn from. `faceTravel` asks the object which
 * way it was drawn and works out the sign from that.
 */
export function routMarker(self: ConquestUIScene, hostId: string): void {
  const ui = self.battleUi;
  if (!ui) return;
  const ours = ui.ourMarkers.find((m) => m.hostId === hostId);
  const marker = ours ?? ui.theirMarkers.find((m) => m.hostId === hostId);
  if (!marker?.marker?.active) return;
  // Ours run left, theirs run right: each side flees the way it came.
  const direction: -1 | 1 = ours ? -1 : 1;
  marker.routed = true;
  self.tweens.killTweensOf(marker.marker);
  faceTravel(marker.marker, direction);
  self.tweens.add({
    targets: marker.marker,
    x: marker.marker.x + direction * (ui.geometry.span * 0.6 + 60),
    alpha: { from: 1, to: 0 },
    duration: BATTLE_TICK_MS * 2,
    ease: 'Quad.easeIn',
  });
}

/**
 * Walks a side's columns to where the fight says they now stand.
 *
 * Chained rather than yoyo'd: a yoyo returns the marker to where it *started*, so shoving on
 * contact would have undone that beat's advance every time the lines touched. The last hop
 * always lands on the true position, so the picture can never drift from the numbers.
 */
export function slideMarkers(self: ConquestUIScene,
  markers: BattleMarker[],
  x: number,
  shove: number,
  sizes: Map<string, number>,
): void {
  for (const entry of markers) {
    const { hostId, count } = entry;
    if (!entry.marker.active) continue;
    // A host that broke is no longer part of the line. Without this, `slideMarkers` dragged it
    // back into formation every beat and killed the tween carrying it off the field — measured,
    // the runner got forty pixels and never faded, because the rout and the formation were both
    // writing the same `x` and the formation won.
    if (entry.routed) continue;
    const size = sizes.get(hostId);
    if (count?.active && size !== undefined) count.setText(compactNumber(size));
    // The ranks thin. One figure stands for `MEN_PER_MARK` men, so this fires about once per
    // fifty-five lost — twenty-odd redraws across a whole engagement, at ~21 `figure()` calls
    // each. Cheap, exact, and it makes attrition the most legible thing on the screen without
    // a single number being read.
    if (size !== undefined) {
      const marks = hostShapeAt(Math.max(1, size), 1).marks;
      if (entry.marks !== undefined && marks !== entry.marks) redrawHostBlock(self, entry, size);
      entry.marks = marks;
    }
    // Read *after* the possible redraw, and this is the whole of a bug worth writing down.
    //
    // `redrawHostBlock` destroys the block and puts a new one in `entry.marker`. This loop used
    // to hold the old container in a local destructured at the top, so on every beat where a
    // host crossed a mark boundary the tween was added to an object that had just been
    // destroyed — and the new block, having been positioned where the old one stood, simply did
    // not move for that beat. Measured on a real engagement: the field stood perfectly still
    // for 673 ms in the middle of the fight, once per fifty-five men lost. That is the "teleport
    // and freeze" complaint's second half, and it survived the tween timings being fixed
    // because the tween was never running on the thing being drawn.
    const marker = entry.marker;
    // Previous beat's tween is abandoned rather than left to fight this one for the same x.
    self.tweens.killTweensOf(marker);
    if (shove === 0) {
      // The whole interval, and linear. It used to be `BATTLE_TICK_MS * 0.45` on an ease-out,
      // so a host crossed its ground in a quarter of a second and then stood perfectly still
      // for the remaining three tenths — a hop, a freeze, a hop. Measured against the beat, the
      // block was stationary for 55% of the time it was supposedly marching. Linear because a
      // column on the move does not accelerate and brake between each pair of steps.
      self.tweens.add({ targets: marker, x, duration: BATTLE_TICK_MS, ease: 'Linear' });
      continue;
    }
    // In contact: lean in, lean back, and let the two halves fill the beat between them, so
    // there is never a moment where nothing on the field is moving.
    self.tweens.chain({
      targets: marker,
      tweens: [
        { x: x + shove, duration: BATTLE_TICK_MS * 0.46, ease: 'Sine.easeInOut' },
        { x, duration: BATTLE_TICK_MS * 0.54, ease: 'Sine.easeInOut' },
      ],
    });
  }
}

/**
 * Redraws one host's block at the strength it is now.
 *
 * Rebuilt in place rather than through `buildBattleField`, because the whole field carries the
 * focus rings and the tap targets — throwing it away to shrink one column would drop the order
 * the player is in the middle of giving.
 */
/**
 * Half the ground a host's whole formation covers.
 *
 * `BATTLE_SEAM_GAP` is a distance between two hosts' *centres*, so what it has to clear is the
 * deployment, not the shield wall in the middle of it. Measured off one block, a screen thrown
 * forward of the line stands inside the enemy's rear ranks.
 */
function hostHalfWidth(self: ConquestUIScene,
  host: Army, men?: number, mustered?: number, shape?: BattleFormation,
): number {
  const size = Math.max(1, men ?? hostSize(host));
  return armyShape(
    size, compositionFor(hostKitFor(self.state, host)), battleBaseScale(self), mustered, 1, shape,
  ).width / 2;
}

export function redrawHostBlock(self: ConquestUIScene, entry: BattleMarker, men: number): void {
  const ui = self.battleUi;
  if (!ui || !self.battleItems) return;
  const battle = self.state.ascent?.activeBattle;
  if (!battle) return;
  const host = self.state.armies.find((army) => army.id === entry.hostId);
  if (!host) return;

  const ours = (battle.ourArmyIds ?? []).includes(entry.hostId);
  const { x, y } = entry.marker;
  const rebuilt = self.battleItems.createArmyMarker(
    Math.max(1, men),
    ours,
    ours ? undefined : ui.rivalColor,
    ours
      ? self.state.mapConfig.seed
      : Math.max(0, self.state.kingdoms.findIndex((k) => k.id === battle.kingdomId)),
    {
      ...hostKitFor(self.state, host),
      mustered: entry.mustered,
      // Sealed the same way the first build is. Attrition redraws a block roughly every
      // fifty-five men, so without this the enemy's shape came back the first time one of their
      // columns crossed a mark boundary — the seal would have lasted until the first casualty.
      shape: ours ? battle.ourFormation
        : self.battleOpeningSealed ? undefined : battle.theirFormation,
    },
    battleBaseScale(self),
  );
  rebuilt.setPosition(x, y);
  if (!ours) faceTravel(rebuilt, -1);
  entry.halfWidth = hostHalfWidth(self, 
    host, men, entry.mustered, ours ? battle.ourFormation : battle.theirFormation,
  );

  // Nothing rides on a block any more — the target picker and its ring are gone — so only the
  // drawing is replaced here.
  const parent = entry.marker.parentContainer;
  // Deep, because the endless step belongs to the ranks inside the block and not to the block.
  killTweensDeep(self, entry.marker);
  entry.marker.destroy();
  entry.marker = rebuilt;
  entry.count = rebuilt.list.find((child) => child.type === 'Text') as Phaser.GameObjects.Text | undefined;
  if (parent) parent.add(rebuilt);
  else ui.field.add(rebuilt);

}
