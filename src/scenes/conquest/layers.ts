/**
 * Teardown for the battle screen's layers — the other half of the arrangement that keeps the field,
 * the readout, the orders, the moment, the relief strip, the exits and the pips in containers of
 * their own so each can be rebuilt on its own clock.
 *
 * Every one of those rebuilds must come through `clearLayer` rather than `removeAll(true)`: the
 * layers torn down most often are the ones holding endless tweens, and Phaser keeps updating a
 * tween whose target has been destroyed. The pair live up here rather than in `battle/` — where
 * every caller is — because a shared helper has to sit in a file that imports no sibling back.
 *
 * `clearLanePage` is the lane's equivalent, and lives here for the same reason.
 */
import Phaser from 'phaser';
import type { ConquestUIScene } from '../ConquestUIScene';

/**
 * Empties a layer, and takes its tweens with it.
 *
 * `Container.removeAll(true)` destroys the children; it does **not** touch the tweens pointing at
 * them, and Phaser's tween manager keeps updating a tween whose target is destroyed until the
 * tween ends on its own. One with `repeat: -1` never does.
 *
 * The battle screen has two of those. The clash mark over the seam pulses forever and lives in
 * the readout, which is rebuilt on every beat; `marchInPlace` gives every rank of every host
 * block an endless step, and a block is rebuilt each time its strength drops a mark. Measured
 * across a single 26-beat engagement the manager climbed from 11 live tweens to 73 and was still
 * rising — sixty updates a second each, every one of them writing to an object that no longer
 * existed.
 */
export function clearLayer(self: ConquestUIScene, target: Phaser.GameObjects.Container): void {
  for (const child of target.list) killTweensDeep(self, child);
  target.removeAll(true);
}

/**
 * Kills every tween pointing at an object *or at anything inside it*.
 *
 * The depth is the whole point. `marchInPlace` tweens each rank of a host block, and a rank is a
 * `Graphics` child of the marker container — so `killTweensOf(marker)` finds nothing at all and
 * every rebuilt block left its old ranks stepping in place forever, invisible and still costing.
 */
export function killTweensDeep(self: ConquestUIScene, object: Phaser.GameObjects.GameObject): void {
  self.tweens.killTweensOf(object);
  const nested = object as Phaser.GameObjects.Container;
  if (Array.isArray(nested.list)) for (const child of nested.list) killTweensDeep(self, child);
}

/**
 * Takes down whatever page is currently in the lane, so another can be built into it.
 *
 * Nine copies of these three lines were spread across six files, and the one that mattered was the
 * one that had already been forgotten: cancelling a claim repainted the build screen without them,
 * leaving the outgoing page's scroll areas alive. An `InkScrollArea` registers a *global* wheel
 * handler, so a leaked one goes on eating the wheel over a page it no longer draws — and a mask
 * does not clip input, so its dead rows stay tappable underneath the live ones.
 *
 * The modal layer is emptied with `removeAll(true)` rather than `clearLayer`: a lane page holds no
 * endless tweens, and paying a deep tween sweep on every page turn is not free.
 */
export function clearLanePage(self: ConquestUIScene): void {
  for (const scroll of self.activeScrollAreas) scroll.destroy();
  self.activeScrollAreas = [];
  self.modalLayer.removeAll(true);
}
