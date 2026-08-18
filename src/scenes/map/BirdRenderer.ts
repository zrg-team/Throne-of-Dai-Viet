/**
 * Egrets crossing the map.
 *
 * The one thing the sheet had none of was anything *above* the ground. Everything that moved —
 * carts, travellers, the herd — moved along it, at the same scale, on the same errands, and the
 * upper two thirds of any framing of this map was empty paper. A few skeins of cò going over at
 * their own pace is the cheapest possible answer and the most Vietnamese one available.
 *
 * A skein is one container: the birds inside it hold formation and only the container is tweened,
 * so a flight of five costs one tween and five texture swaps rather than five of each. Each one
 * crosses the FRAME, waits out of sight beyond its edge, and comes back on a fresh line — see
 * `launch`, where the difference between that and crossing the world is the difference between a
 * sky with birds in it and a sky that merely contains some.
 */
import Phaser from 'phaser';
import { bakeLacBirds, type WingBeat } from '../../ui/ink/birds';
import { propImage } from '../../ui/ink/sprites';
import { birdsEnabled } from '../../game/lifeSettings';
import { mulberry32 } from '../../ui/ink/stroke';

/**
 * Just above the foreign haze (77.4) and just below the fog (77.5).
 *
 * Birds over ground the chronicle has not reached are hidden with everything else there, which is
 * right — but ground you can merely *see* is still sky you can watch a bird cross, and at 77 they
 * were being washed out by the haze over every province the realm does not hold, which early on is
 * all of them.
 */
const BIRD_DEPTH = 77.45;

/** Long enough to be a crossing rather than a fly-past, short enough to happen while you watch. */
const CROSSING_MS = { min: 26000, max: 44000 };

/**
 * The share of a crossing spent coming into and going out of sight.
 *
 * A skein used to simply stop at the far edge and stand there until its next flight — and "the far
 * edge" was wherever the view happened to be when it launched, so the moment the player panned, a
 * flight ended in mid-air in plain sight and hung there for up to fifteen seconds. Ending the
 * flight at a coordinate was the mistake; a bird leaves by getting further away.
 *
 * So each crossing opens small and faint and closes the same way, wherever it happens to be. It
 * reads as distance — a skein climbing away out of sight, or dropping into the far paddy — which
 * is what a bird actually does at the end of a crossing, and it cannot be caught standing still.
 */
const FADE_SHARE = 0.13;

interface Skein {
  container: Phaser.GameObjects.Container;
  birds: Phaser.GameObjects.Image[];
  tween?: Phaser.Tweens.Tween;
  flap?: Phaser.Time.TimerEvent;
  wait?: Phaser.Time.TimerEvent;
}

export class BirdRenderer {
  private skeins: Skein[] = [];
  private poses?: Record<WingBeat, ReturnType<typeof bakeLacBirds>['down']>;
  private paused = false;

  constructor(private readonly scene: Phaser.Scene) {}

  /**
   * Puts a few skeins over the world. Safe to call again — an existing flight is left alone, so
   * this can run on a refresh without the sky restarting.
   */
  create(worldWidth: number, worldHeight: number, seed: number): void {
    if (!birdsEnabled() || this.skeins.length > 0) {
      return;
    }
    this.poses = bakeLacBirds(this.scene);
    const rand = mulberry32(seed);
    // Three. Enough that the sky is never empty for long, few enough that they still read as birds
    // that happen to be passing rather than as a flock simulation — and each one crosses the frame
    // now rather than the world, so three is worth what a dozen used to be.
    const count = 3;

    for (let index = 0; index < count; index += 1) {
      this.skeins.push(this.buildSkein(worldWidth, worldHeight, rand, index));
    }
  }

  private buildSkein(
    worldWidth: number,
    worldHeight: number,
    rand: () => number,
    index: number,
  ): Skein {
    const container = this.scene.add.container(0, 0).setDepth(BIRD_DEPTH);
    const birds: Phaser.GameObjects.Image[] = [];
    const size = 2 + Math.floor(rand() * 4);
    // A skein is a slanted line, not a V: at this size a V reads as a bird with four wings. Each
    // bird sits behind and a little above the one in front, the way a real line of cò does.
    for (let bird = 0; bird < size; bird += 1) {
      const image = propImage(
        this.scene,
        this.poses!.down,
        -bird * (11 + rand() * 5),
        -bird * (3 + rand() * 3),
        // Small. The drum casts this bird a centimetre across and it still reads; on the map it
        // should be a mark that crosses the sky, not a prop you can identify without looking.
        0.72 + rand() * 0.3,
      );
      image.setAlpha(0.9);
      birds.push(image);
      container.add(image);
    }

    const skein: Skein = { container, birds };
    this.launch(skein, worldWidth, worldHeight, rand, index, true);
    return skein;
  }

  /**
   * Sends a skein across the VIEW once, then schedules the next crossing.
   *
   * Across the view, not across the world, which is what the first pass did and why the sky looked
   * empty: the world is some two thousand units across and the camera shows about four hundred of
   * them, so a skein crossing the whole map spent under a fifth of its flight anywhere the player
   * could see it, and with three of them up the odds of catching one were slim enough that in
   * practice nobody ever did. Birds are scenery — they belong in the frame, not in the coordinate
   * space.
   *
   * The camera is read at each launch rather than followed, so a skein already in the air keeps its
   * line while the player pans; it will simply leave the frame the way a real one would.
   */
  private launch(
    skein: Skein,
    worldWidth: number,
    worldHeight: number,
    rand: () => number,
    index: number,
    initial = false,
  ): void {
    const camera = this.scene.cameras.main;
    const viewWidth = camera.width / camera.zoom;
    const viewHeight = camera.height / camera.zoom;
    const left = camera.scrollX;
    const top = camera.scrollY;

    const eastbound = rand() > 0.5;
    const margin = 90;
    const entry = eastbound ? left - margin : left + viewWidth + margin;
    const toX = eastbound ? left + viewWidth + margin : left - margin;
    // The FIRST flight of each skein starts partway across, so the three of them are spread over
    // the sky from the opening frame. Launched together from the same edge — which is what they
    // did — three skeins fly the same line a few seconds apart and spend most of their lives
    // stacked just outside the same corner of the view.
    const head = initial ? rand() * 0.8 : 0;
    const fromX = entry + (toX - entry) * head;
    // Stratified by index and kept out of the bottom third of the frame: birds low on the sheet
    // are birds standing in a field, and three at the same height are a formation.
    const band = (index + rand()) / Math.max(1, this.skeins.length + 1);
    const y = top + viewHeight * (0.06 + band * 0.5);
    const drift = (rand() - 0.5) * viewHeight * 0.12;

    skein.container.setPosition(fromX, y);
    // Out of sight until the flight's own first frame brings it in.
    skein.container.setAlpha(0).setScale(0.62);
    // The whole skein turns, not each bird: `propImage` bakes its scale into the object, so the
    // flip has to keep it.
    const facing = eastbound ? 1 : -1;
    for (const bird of skein.birds) {
      bird.setScale(Math.abs(bird.scaleX) * facing, Math.abs(bird.scaleY));
      bird.setX(Math.abs(bird.x) * -facing);
    }

    skein.tween?.remove();
    skein.tween = this.scene.tweens.add({
      targets: skein.container,
      x: toX,
      y: y + drift,
      duration: (CROSSING_MS.min + rand() * (CROSSING_MS.max - CROSSING_MS.min)) * (1 - head),
      ease: 'Sine.easeInOut',
      paused: this.paused,
      // Driven off the flight's own progress rather than by separate tweens, so it stays exact
      // under a pause and needs nothing cancelled when a crossing is cut short.
      onUpdate: (tween) => {
        const near = Math.min(tween.progress / FADE_SHARE, (1 - tween.progress) / FADE_SHARE, 1);
        const eased = near <= 0 ? 0 : Math.pow(near, 0.7);
        skein.container.setAlpha(eased);
        skein.container.setScale(0.62 + 0.38 * eased);
      },
      onComplete: () => {
        skein.wait?.remove();
        skein.wait = this.scene.time.delayedCall(3000 + rand() * 12000, () => {
          this.launch(skein, worldWidth, worldHeight, rand, index);
        });
        if (this.paused) {
          skein.wait.paused = true;
        }
      },
    });

    // Two frames, alternating. Each skein beats at its own rate so five of them in frame do not
    // flap in lockstep, which is the one thing that would make them read as a repeating texture.
    skein.flap?.remove();
    let beat: WingBeat = 'down';
    skein.flap = this.scene.time.addEvent({
      delay: 240 + rand() * 200,
      loop: true,
      paused: this.paused,
      callback: () => {
        beat = beat === 'down' ? 'up' : 'down';
        const pose = this.poses![beat];
        for (const bird of skein.birds) {
          bird.setTexture(pose.key);
        }
      },
    });
  }

  /** Holds or releases every flight, with the world's own clock. */
  setPaused(paused: boolean): void {
    this.paused = paused;
    for (const skein of this.skeins) {
      if (skein.tween) skein.tween.paused = paused;
      if (skein.flap) skein.flap.paused = paused;
      if (skein.wait) skein.wait.paused = paused;
    }
  }

  destroy(): void {
    for (const skein of this.skeins) {
      skein.tween?.remove();
      skein.flap?.remove();
      skein.wait?.remove();
      skein.container.destroy(true);
    }
    this.skeins = [];
  }
}
