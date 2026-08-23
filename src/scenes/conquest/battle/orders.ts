/**
 * The two dials at the foot of the fight — the three-posture stance strip, the five formation
 * chips in ring order, the stamina pips beside them, and the marks a press leaves behind.
 *
 * One file because they are one rebuild. `battleOrderSignature` covers all of it, and the strip is
 * torn down and built whole when it changes — never on the beat, because a card destroyed between
 * press and release never fires. That is why the press marks hang off `modalLayer` rather than the
 * chip: ordering a shape changes the signature, so anything left on the chip is destroyed a
 * millisecond after the tap. `ui.coachBounds` is recorded here, where the boxes are computed.
 */
import Phaser from 'phaser';
import { battleRimsShown } from '../../../game/battleOptions';
import { BATTLE_STAMINA_REGEN_BEATS } from '../../../game/ascentConfig';
import { battleStamina, battleTelegraph, canFormFormation } from '../../../systems/ascent/BattleSystem';
import { INK_UI, INK_UI_HEX, scrollGestureConsumedTap, type UIBounds } from '../../../ui/InkUI';
import { formationTier, FORMATION_RING } from '../../../data/ascent/formations';
import { CARD_ICON_SIZE, drawCardIcon } from '../../../ui/CardIcons';
import { t } from '../../../i18n';
import type { AscentBattle, FieldStance } from '../../../state/types';
import {
  BATTLE_DIAL_GAP,
  BATTLE_FORMATION_HEIGHT,
  BATTLE_RAILS_HEIGHT,
  BATTLE_READOUT_HEIGHT,
  BATTLE_STANCE_HEIGHT,
  FORMATION_ICON,
  battleFieldBox,
  cssHex,
} from '../constants';
import { clearLayer } from '../layers';
import type { ConquestUIScene } from '../../ConquestUIScene';


/**
 * What the two strips currently offer.
 *
 * Rebuilt when — and only when — this changes. **Never on the beat:** a card destroyed between
 * press and release never fires, which this screen has already been bitten by once.
 *
 * The telegraph is in here because the chip edges are drawn from it: a green rim under a shape
 * that no longer answers what they are forming is worse than no rim at all.
 */
export function battleOrderSignature(self: ConquestUIScene, battle: AscentBattle): string {
  const read = battleTelegraph(self.state);
  const stamina = battleStamina(battle);
  return [
    battle.stance,
    battle.stancePending ?? '',
    battle.ourFormation,
    battle.formationTarget ?? '',
    battle.reformBeats ?? 0,
    // The readout band lives in this layer, so its readings belong in the signature: the price
    // moves every beat and the landing stamp has two beats to live. Without these the band would
    // print one stale beat behind the fight it is describing.
    Math.round(battle.lastBeatLoss?.ours ?? -1),
    Math.round(battle.lastBeatLoss?.theirs ?? -1),
    battle.landedBeat ?? -1,
    read ? `${read.formation}>${read.next ?? ''}:${read.beatsLeft}` : '',
    // The pips and the clock on the next one: a pip returning must relight the dock on that
    // beat, and the filling pip is redrawn every beat it fills.
    `${stamina.pips}/${stamina.max}@${stamina.nextIn}`,
    battleRimsShown() ? 'r1' : 'r0',
    battle.delegated ? 'd1' : 'd0',
    // The world's clock. A fight opened onto a paused world used to look identical to one that
    // was running — and the pause chip has to flip to Resume on the beat the player taps it.
    self.battleHalted ? 'p1' : 'p0',
  ].join(':');
}

/**
 * The two dials, as a fixed dock ranked by how often each is touched.
 *
 * This used to be a three-way stance ring plus five buttons, and the ring did two jobs at once:
 * it carried the matchup *and* the tempo, which is why two of its three options had the same
 * exchange ratio to three decimals. `docs/14-five-shapes-two-dials.html` splits them, and the
 * split has a layout consequence that is the whole of this method:
 *
 *   **Formation is worked three to five times an engagement. Stance is worked once or twice.**
 *
 * So formation gets the widest, lowest, largest band — the arc a thumb covers without the hand
 * shifting — and stance sits above it, smaller, further away, with a lock counter in its label.
 * The two exits are not here at all; see `buildBattleExits`.
 *
 * Rebuilt only when `battleOrderSignature` changes, never on the beat: a card destroyed between
 * press and release never fires.
 */
export function buildBattleOrders(self: ConquestUIScene, battle: AscentBattle): void {
  const ui = self.battleUi;
  if (!ui) return;
  const { content, orders } = ui;

  clearLayer(self, orders);
  ui.orderSignature = battleOrderSignature(self, battle);

  // 10, down from 16. The stance strip and everything under it move up by six, which is six
  // more between the formation chips and the two buttons that end the fight.
  const dockY = content.y + ui.fieldHeight + 8 + BATTLE_RAILS_HEIGHT + 10;
  const read = battleTelegraph(self.state);

  // ── the readout ──────────────────────────────────────────────────────
  buildBattleReadout(self, battle, dockY);

  const stamina = battleStamina(battle);

  const stanceY = dockY + BATTLE_READOUT_HEIGHT + 3;
  // Recorded where they are computed. See `coachBounds`.
  // Recorded from where the header put it, not recomputed: the clock is the one part of this
  // screen that is no longer laid out against `content` at all.
  ui.coachBounds.pips = ui.pipBounds;
  // The field, because the bubbles over the two hosts live on it and the coach has to be able
  // to point at what each side is saying.
  ui.coachBounds.field = battleFieldBox(content, ui.fieldHeight);
  ui.coachBounds.rails = {
    x: content.x,
    y: content.y + ui.fieldHeight + 8,
    width: content.width,
    height: BATTLE_RAILS_HEIGHT,
  };
  ui.coachBounds.readout = {
    x: content.x, y: dockY, width: content.width, height: BATTLE_READOUT_HEIGHT,
  };
  ui.coachBounds.stance = {
    x: content.x, y: stanceY, width: content.width, height: BATTLE_STANCE_HEIGHT,
  };
  // Three, not four: Lui binh is an exit, not a posture, and lives with the exits now.
  const stances: FieldStance[] = ['defend', 'balanced', 'press'];
  const segGap = 5;
  // The last 26 points of the row are the stamina column — two ink pips stacked beside the
  // postures they budget. Not a number: a pip is a thing, and the same pip is what flies into a
  // chip when a shape is ordered and what flashes red when there is none to spend. The missing
  // pip fills slowly — that growing stroke IS the wait, and needs no countdown.
  const PIP_COLUMN = 26;
  const segW = (content.width - PIP_COLUMN - segGap * stances.length) / stances.length;
  {
    const pipR = 4.4;
    const px = content.x + content.width - PIP_COLUMN / 2 + 2;
    const pips = self.add.container(0, 0);
    for (let i = 0; i < stamina.max; i += 1) {
      const py = stanceY + 8 + (stamina.max - 1 - i) * 14;
      const pip = self.add.graphics();
      pip.lineStyle(1.4, INK_UI.brush, 0.9);
      pip.strokeCircle(px, py, pipR);
      if (i < stamina.pips) {
        pip.fillStyle(INK_UI.brush, 0.92);
        pip.fillCircle(px, py, pipR - 0.9);
      } else if (i === stamina.pips && stamina.nextIn > 0) {
        // The pip on its way back: a brush stroke growing round the ring as the clock runs down.
        const done = 1 - stamina.nextIn / Math.max(1, BATTLE_STAMINA_REGEN_BEATS);
        pip.lineStyle(2.2, INK_UI.brush, 0.7);
        pip.beginPath();
        pip.arc(px, py, pipR - 1.2, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * done, false);
        pip.strokePath();
      }
      pips.add(pip);
    }
    orders.add(pips);
    ui.staminaPips = pips;
    ui.staminaAt = { x: px, y: stanceY + 8 };
  }
  stances.forEach((id, index) => {
    const x = content.x + index * (segW + segGap);
    const bounds = { x, y: stanceY, width: segW, height: BATTLE_STANCE_HEIGHT };
    // What is *pending* reads as chosen: the player pressed it, and it lands next beat.
    // No stance is ever refused, and no stance touches stamina: this dial is the trade and only
    // the trade — the lever a player reaches for while they wait for a pip.
    const chosen = (battle.stancePending ?? battle.stance) === id;
    const tile = self.ui.crayonTile(bounds, { selected: chosen });
    orders.add(tile);
    // Stuck — no pip, and standing in a shape they beat: every chip is dim and this is the one
    // lit thing on the strip. A screen where one control glows says what to do louder than any
    // sentence, and it is the move the whole stamina rule exists to teach.
    const countered = (battle.reformBeats ?? 0) === 0 && (battle.theirReformBeats ?? 0) === 0
      && formationTier(battle.ourFormation, battle.theirFormation) < 0;
    if (id === 'defend' && !chosen && stamina.pips === 0 && countered) {
      const glow = self.add.graphics();
      glow.lineStyle(2.4, INK_UI.jade, 0.95);
      glow.strokeRoundedRect(x + 1, stanceY + 1, segW - 2, BATTLE_STANCE_HEIGHT - 2, 6);
      orders.add(glow);
      self.tweens.add({
        targets: glow, alpha: { from: 1, to: 0.3 }, duration: 650, yoyo: true, repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }
    orders.add(self.ui.label(
      x + segW / 2, stanceY + BATTLE_STANCE_HEIGHT / 2,
      t(`ascent.stance.${id}` as Parameters<typeof t>[0]), 'label',
      {
        fontSize: '10.5px',
        align: 'center',
        color: chosen ? cssHex(INK_UI.cinnabar) : INK_UI_HEX.inkText,
      },
    ).setOrigin(0.5));
    const hit = self.add.zone(x, stanceY, segW, BATTLE_STANCE_HEIGHT).setOrigin(0, 0)
      .setInteractive({ useHandCursor: true });
    hit.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (scrollGestureConsumedTap(pointer)) return;
      self.resumeBattleForOrder();
      self.events.emit('ui:battle-order', `stance:${id}`);
    });
    orders.add(hit);
  });

  // ── the fast dial ────────────────────────────────────────────────────
  // No caption. The chips carry an icon and a verb now, and the readout band above says what the
  // enemy is doing in words — between them there is nothing left for a label to add.
  const formY = stanceY + BATTLE_STANCE_HEIGHT + BATTLE_DIAL_GAP;
  ui.coachBounds.formation = {
    x: content.x, y: formY, width: content.width, height: BATTLE_FORMATION_HEIGHT,
  };
  // While the fight is held waiting for its first order, say which strip is the one to touch.
  // The note in the field tells the player to pick a formation; this is the strip it means, and
  // without it "give the first order" is a sentence with no object.
  if (self.battleAwaitingOrder) {
    const call = self.add.graphics();
    call.lineStyle(2, INK_UI.cinnabar, 0.9);
    call.strokeRoundedRect(
      content.x - 3, formY - 3, content.width + 6, BATTLE_FORMATION_HEIGHT + 6, 8,
    );
    orders.add(call);
    self.tweens.add({
      targets: call, alpha: { from: 1, to: 0.25 }, duration: 700, yoyo: true, repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }
  const reforming = (battle.reformBeats ?? 0) > 0;
  // Their *target* is what a shape has to answer — countering the thing they are walking out of
  // is the classic way to arrive one beat too late.
  // Nothing to answer while the drum is beating: the rims are drawn from the enemy's shape, and
  // a jade rim on exactly the chip that beats them is the whole leak in one mark.
  const answering = self.battleOpeningSealed ? undefined : (read ? (read.next ?? read.formation) : undefined);
  const chipGap = 5;
  const chipW = (content.width - chipGap * (FORMATION_RING.length - 1)) / FORMATION_RING.length;

  // Laid out in ring order, so the two shapes that beat what they are forming are always
  // adjacent. The counter rule is legible from the layout alone — with one honest caveat: the
  // "one left of theirs" reading wraps at the strip's end, so the rims below are the real
  // carrier of the rule, and they never wrap.
  FORMATION_RING.forEach((id, index) => {
    const x = content.x + index * (chipW + chipGap);
    const bounds = { x, y: formY, width: chipW, height: BATTLE_FORMATION_HEIGHT };
    const held = battle.ourFormation === id && !reforming;
    const walking = reforming && battle.formationTarget === id;
    // Out of stamina: every other chip dims together, which says "you cannot change anything"
    // without a word, and the tap is answered by the pips flashing red rather than by silence.
    const gone = !held && !walking && !canFormFormation(self.state, id);

    const tile = self.ui.crayonTile(bounds, { selected: held || walking });
    if (gone) tile.setAlpha(0.45);
    orders.add(tile);

    // Four readings, no text: filled = held, full jade rim = the STRONG answer to their shape,
    // faint jade = the soft answer at half tilt, red rim = loses to it. Easy and normal only —
    // on hard and nightmare the rims are gone and the player has to find the answer by trying,
    // two pips at a time. That inference is the game; see `battleRimsShown`.
    let rim = 0;
    let rimAlpha = 0.95;
    if (battleRimsShown() && answering && id !== answering) {
      const tier = formationTier(id, answering);
      if (tier > 0) {
        rim = INK_UI.jade;
        rimAlpha = tier === 2 ? 0.95 : 0.5;
      } else if (tier < 0) {
        rim = INK_UI.cinnabar;
        rimAlpha = tier === -2 ? 0.95 : 0.5;
      }
    }
    if (rim) {
      const edge = self.add.graphics();
      edge.lineStyle(2, rim, rimAlpha);
      edge.strokeRoundedRect(x + 1, formY + 1, chipW - 2, BATTLE_FORMATION_HEIGHT - 2, 6);
      orders.add(edge);
    }

    // The arrangement the shape puts its men in, drawn. A word has to be read and recognised;
    // a shape only has to be recognised, so the icon is what carries the chip at a glance and
    // the two names underneath are what the glance turns into knowledge over a few fights.
    const ink = held || walking ? INK_UI.cinnabar
      : gone ? INK_UI.softBrush
        : rim === INK_UI.jade ? INK_UI.jade : INK_UI.brush;
    /**
     * The second line is a *state*, not a name — and only when there is one.
     *
     * The Vietnamese name used to live here permanently, on the theory that a player picks the
     * vocabulary up by association. In practice it put a word nobody could read directly under
     * every word they could, five times across the busiest strip on the screen, and it did it
     * while the line beneath the chip was trying to say "re-forming · 2". Two lines of type on a
     * 52-point chip, and the one that mattered was the one that only sometimes appeared.
     *
     * So the shape's name is the icon and the verb, and this line is kept clear for the three
     * things that are true only sometimes and change what the player should press. The chip
     * shifts up when it has nothing to say, so an ordinary chip is a glyph and a word centred in
     * their own box rather than a heading over an empty line.
     */
    // The only words left on a chip: how far the men are from standing in it. Every other note
    // this line used to carry — strong/soft, winded, spent — explained a number; the rims and
    // the pips explain the thing.
    const note = walking ? t('ascent.battle.reforming', { n: String(battle.reformBeats ?? 0) }) : '';

    /**
     * The order at the top, the glyph under it, the state line pinned to the floor.
     *
     * Glyph-first read better in English, where every verb is one short word: the eye landed on
     * a picture and the word underneath confirmed it. In Vietnamese the same verb is two words
     * that wrap, so the picture was pushed down onto the state line and `đang chuyển thế · 1`
     * printed out of the bottom of the chip. The word a player is looking *for* now starts at a
     * fixed y on every chip in the row, whatever language it is in and however many lines it
     * takes, and the line that only sometimes appears has the floor to itself.
     *
     * Measured rather than placed at written-down offsets, for the same reason.
     */
    const GLYPH = 15;
    const verb = self.ui.label(
      0, 0, t(`ascent.formation.${id}.verb` as Parameters<typeof t>[0]), 'label',
      {
        fontSize: '10px',
        align: 'center',
        wordWrap: { width: chipW - 2 },
        color: held || walking ? cssHex(INK_UI.cinnabar)
          : gone ? INK_UI_HEX.mutedText : INK_UI_HEX.inkText,
      },
    ).setOrigin(0.5, 0);
    /**
     * One line, shrunk to fit — never wrapped.
     *
     * Wrapping was the whole of the remaining overlap. `đang chuyển thế · 1` is 66 points at 8px
     * in a 66-point chip, so it took two lines, and two lines of state under two lines of a
     * Vietnamese order left the glyph nowhere to be but on top of one of them. A state note is a
     * glance, not a sentence: it can afford to be small, and it cannot afford to be tall.
     */
    const noteLabel = note
      ? self.ui.label(0, 0, note, 'caption', {
        fontSize: '8px',
        align: 'center',
        color: (held || walking ? '#8a2a1b'
          : rim === INK_UI.jade ? '#4c5f45'
            : rim === INK_UI.cinnabar ? '#8a2a1b' : INK_UI_HEX.mutedText),
      }).setOrigin(0.5, 0)
      : undefined;
    if (noteLabel) {
      for (let size = 8; size >= 6.5 && noteLabel.width > chipW - 6; size -= 0.5) {
        noteLabel.setFontSize(size);
      }
    }

    // The floor the state line keeps for itself. Thirteen when there is nothing to print, so the
    // glyph does not hop up and down the chip as a shape starts and finishes re-forming — and
    // measured off the label itself when there is, because a shrunk line is shorter than 13.
    const FLOOR = noteLabel ? Math.max(13, noteLabel.height + 5) : 13;
    // The order starts at the same y on every chip in the row — that is the whole point of
    // putting it first, and centring the pair instead would set `DỰNG GIÁO` a line lower than
    // `XUNG PHONG` beside it. The glyph then takes the middle of whatever is left under it, so a
    // one-line chip does not end up with a hole in its floor.
    const top = formY + 5;
    const glyphBand = { from: top + verb.height + 1, to: formY + BATTLE_FORMATION_HEIGHT - FLOOR };

    verb.setPosition(x + chipW / 2, top);
    orders.add(verb);

    // Drawn at 15 where there is 15 to draw it in, and at whatever is left where there is not.
    // A Vietnamese order that wraps to two lines over a state line leaves about fourteen points
    // between them, and a glyph that insisted on its full size took the difference out of the
    // note underneath it.
    const glyphSize = Math.min(GLYPH, Math.max(9, glyphBand.to - glyphBand.from));
    const glyph = drawCardIcon(self, FORMATION_ICON[id], ink);
    glyph.setPosition(x + chipW / 2, (glyphBand.from + glyphBand.to) / 2)
      .setScale(glyphSize / CARD_ICON_SIZE);
    if (gone) glyph.setAlpha(0.5);
    orders.add(glyph);

    if (noteLabel) {
      noteLabel.setPosition(
        x + chipW / 2, formY + BATTLE_FORMATION_HEIGHT - 3 - noteLabel.height,
      );
      orders.add(noteLabel);
    }

    // ── the order in flight ────────────────────────────────────────────
    //
    // A formation is instant to order and slow to arrive, and until now the screen said neither.
    // Three marks, because three different things are true at three different moments and
    // merging them tells the player the wrong one:
    //
    //   the bar   — it is walking, and this is how much of the walk is left.
    //   the flare — it arrived. The one that means the shape has actually changed.
    //
    // There used to be a third, a small sỏi son square in the chip's top corner meaning "the
    // order was issued". It went, and the question that killed it was a player's: *what is the
    // red square?* By the time it appeared the chip already said `chuyển thế · 2` in words, one
    // line below it, and `stampFormationChip` had already answered the same thing far more
    // loudly on the tap itself. Three marks, two of them saying what a sentence was saying.
    if (walking) {
      const total = Math.max(1, battle.reformTotalBeats ?? battle.reformBeats ?? 1);
      const done = Math.max(0, Math.min(1, 1 - (battle.reformBeats ?? 0) / total));

      // Drawn from `reformBeats`, never tweened. `battleOrderSignature` includes that clock, so
      // this strip is torn down and rebuilt on every beat of a re-form and a tween would restart
      // each time — a bar that runs the wrong length is worse than no bar at all.
      //
      // Track first, then fill. A trained host re-forms in a single beat, where the fill is zero
      // wide for the whole of the walk: without the track there would be nothing on the chip at
      // all in the commonest case, which is the exact complaint this is here to answer.
      const bar = self.add.graphics();
      bar.fillStyle(INK_UI.cinnabar, 0.22);
      bar.fillRect(x + 2, formY + BATTLE_FORMATION_HEIGHT - 4, chipW - 4, 2.5);
      bar.fillStyle(INK_UI.cinnabar, 0.95);
      bar.fillRect(x + 2, formY + BATTLE_FORMATION_HEIGHT - 4, (chipW - 4) * done, 2.5);
      orders.add(bar);
    }


    // The beat the men actually stood up in it. Two beats, then it stops mattering.
    const beatNow = (battle.approachBeats ?? 0) + battle.round;
    if (held && battle.landedBeat !== undefined && beatNow - battle.landedBeat <= 1) {
      const flare = self.add.graphics();
      flare.lineStyle(2, battle.landedCountered ? INK_UI.jade : INK_UI.gold, 0.95);
      flare.strokeRoundedRect(x - 1, formY - 1, chipW + 2, BATTLE_FORMATION_HEIGHT + 2, 7);
      orders.add(flare);
      self.tweens.add({
        targets: flare, alpha: { from: 1, to: 0 }, duration: 520, ease: 'Quad.easeOut',
      });
    }

    const hit = self.add.zone(x, formY, chipW, BATTLE_FORMATION_HEIGHT).setOrigin(0, 0)
      .setInteractive({ useHandCursor: !gone });
    if (gone) {
      // A tap with nothing to spend: the pips flash red, the chip shivers. Every game does this
      // and nobody has to be taught it.
      hit.on('pointerup', (pointer: Phaser.Input.Pointer) => {
        if (scrollGestureConsumedTap(pointer)) return;
        refuseForStamina(self, tile);
      });
      orders.add(hit);
      return;
    }
    // The press itself. Every other button in this game dips under the thumb — `InkUI.button`
    // redraws on `pointerdown` — and these chips were a bare zone with a `pointerup` handler and
    // nothing else, so the one control the fight is built around was the one control that gave
    // no sign of having been touched.
    /**
     * The **whole chip** dips, not just the tile under it.
     *
     * It was the tile alone, which is worse than no feedback at all: the paper moved and the word
     * printed on it did not, so the chip read as a card sliding out from under its own label. The
     * order, the glyph and the state line go with it now, all scaled about the chip's centre —
     * which is what `bounds.x + chipW * 0.03` was always secretly doing for the tile.
     */
    const cx = bounds.x + chipW / 2;
    const cy = formY + BATTLE_FORMATION_HEIGHT / 2;
    const parts: Array<{ o: Phaser.GameObjects.Components.Transform; hx: number; hy: number; hs: number }> = [
      { o: tile, hx: bounds.x, hy: bounds.y, hs: 1 },
      { o: glyph, hx: glyph.x, hy: glyph.y, hs: glyphSize / CARD_ICON_SIZE },
      { o: verb, hx: verb.x, hy: verb.y, hs: 1 },
    ];
    if (noteLabel) parts.push({ o: noteLabel, hx: noteLabel.x, hy: noteLabel.y, hs: 1 });
    const press = (k: number): void => {
      for (const part of parts) {
        part.o.setScale(part.hs * k);
        part.o.setPosition(cx + (part.hx - cx) * k, cy + (part.hy - cy) * k);
      }
    };

    hit.on('pointerdown', () => press(0.93));
    const unpress = (): void => press(1);
    hit.on('pointerout', unpress);
    hit.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      unpress();
      if (scrollGestureConsumedTap(pointer)) return;
      self.resumeBattleForOrder();
      // Before the order, because the order rebuilds this strip: the mark has to be somewhere
      // that outlives the chip that raised it.
      stampFormationChip(self, bounds);
      spendPipInto(self, bounds);
      self.events.emit('ui:battle-order', `formation:${id}`);
    });
    orders.add(hit);
  });
}

/**
 * The mark a formation order leaves behind it.
 *
 * **The press had nowhere to land.** Ordering a shape changes `battleOrderSignature`, which tears
 * the whole strip down and builds it again on the same frame — so any release animation on the
 * chip was destroyed a millisecond after it started, and the only thing the player saw was the
 * dip ending. That is why the tap felt like nothing: the game answered, and then deleted the
 * answer.
 *
 * So the answer is drawn somewhere the rebuild cannot reach. A seal punching outward off the
 * chip's own outline, in sỏi son, with six flecks thrown clear of it — the print's own idea of a
 * stamp coming down — parented to `modalLayer` rather than to the dock, and gone in 340 ms.
 *
 * It does not replace the marks already on the rebuilt chip. Those say three different later
 * things: the seal says the order was *issued*, the bar says how much of the walk is left, the
 * flare says it *arrived*. This one is the only one that says *you just pressed that*.
 */
/**
 * One pip leaves the meter and lands in the chip that was ordered.
 *
 * This is the single most important animation on the screen: it is where "why did that chip
 * grey out?" becomes "I just watched myself pay." The same ink dot the meter is drawn from, on
 * the modal layer so it outlives the strip's rebuild, gone on landing.
 */
function spendPipInto(self: ConquestUIScene, bounds: UIBounds): void {
  const from = self.battleUi?.staminaAt;
  if (!from) return;
  const dot = self.add.graphics();
  dot.fillStyle(INK_UI.brush, 0.95);
  dot.fillCircle(0, 0, 4);
  dot.setPosition(from.x, from.y);
  self.modalLayer.add(dot);
  self.tweens.add({
    targets: dot,
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
    scale: { from: 1, to: 0.4 },
    alpha: { from: 1, to: 0.2 },
    duration: 380,
    ease: 'Quad.easeIn',
    onComplete: () => dot.destroy(),
  });
}

/** Nothing to spend: the pips flash red and the chip shivers. */
function refuseForStamina(self: ConquestUIScene, tile: Phaser.GameObjects.Components.Transform & { alpha?: number }): void {
  const pips = self.battleUi?.staminaPips;
  if (pips?.active) {
    const flash = self.add.graphics();
    const at = self.battleUi?.staminaAt;
    if (at) {
      flash.lineStyle(2, INK_UI.cinnabar, 0.95);
      flash.strokeCircle(at.x, at.y, 7);
      flash.strokeCircle(at.x, at.y + 14, 7);
      self.modalLayer.add(flash);
      self.tweens.add({
        targets: flash, alpha: { from: 1, to: 0 }, duration: 420, ease: 'Quad.easeOut',
        onComplete: () => flash.destroy(),
      });
    }
  }
  const x0 = tile.x;
  self.tweens.add({
    targets: tile, x: x0 + 3, duration: 40, yoyo: true, repeat: 3, ease: 'Linear',
    onComplete: () => { tile.x = x0; },
  });
}

export function stampFormationChip(self: ConquestUIScene, bounds: UIBounds): void {
  const cx = bounds.x + bounds.width / 2;
  const cy = bounds.y + bounds.height / 2;

  const ring = self.add.graphics();
  ring.lineStyle(2.4, INK_UI.cinnabar, 0.95);
  ring.strokeRoundedRect(
    -bounds.width / 2, -bounds.height / 2, bounds.width, bounds.height, 7,
  );
  ring.setPosition(cx, cy);
  self.modalLayer.add(ring);
  self.tweens.add({
    targets: ring,
    scale: { from: 0.96, to: 1.24 },
    alpha: { from: 0.95, to: 0 },
    duration: 340,
    ease: 'Quad.easeOut',
    onComplete: () => ring.destroy(),
  });

  // Thrown from the corners rather than fanned evenly: an even ring of dots reads as a loading
  // spinner, and this is a stamp coming down.
  const flecks = self.add.graphics();
  flecks.fillStyle(INK_UI.cinnabar, 0.9);
  for (let i = 0; i < 6; i += 1) {
    const angle = (i / 6) * Math.PI * 2 + 0.5;
    flecks.fillCircle(
      Math.cos(angle) * bounds.width * 0.42,
      Math.sin(angle) * bounds.height * 0.46,
      1.9,
    );
  }
  flecks.setPosition(cx, cy);
  self.modalLayer.add(flecks);
  self.tweens.add({
    targets: flecks,
    scale: { from: 0.55, to: 1.55 },
    alpha: { from: 1, to: 0 },
    duration: 380,
    ease: 'Quad.easeOut',
    onComplete: () => flecks.destroy(),
  });
}

/**
 * What they are doing, what it is costing, and whether the last order was worth making.
 *
 * The three readings a player actually needs, in the band the two strip labels used to occupy.
 * The old dock named the enemy's shape — `họ: Thế Nỏ` — which is a fact about vocabulary, not a
 * situation anybody can act on. Written plainly the ring turns out to be common sense: spears
 * stop horses, shields stop arrows, spread out and the arrows miss. The names were the barrier.
 */
function buildBattleReadout(self: ConquestUIScene, battle: AscentBattle, y: number): void {
  const ui = self.battleUi;
  if (!ui) return;
  const { content, orders } = ui;
  const walking = (battle.reformBeats ?? 0) > 0;

  /**
   * The band is the *price* now. What the enemy is doing left it for the bubble over their own
   * men, which is where it always belonged — a caption in the dock naming a shape, a hundred and
   * eighty points below the two blocks of figures it was about, made the reader take on trust
   * which of them it referred to.
   *
   * What is left is the pair of readings that genuinely belong beside the dials, because both
   * are about the order last given: what this beat cost, and whether the arms in the two hosts
   * favour us.
   */
  const loss = battle.lastBeatLoss;
  const price = walking ? t('ascent.battle.walkingWhy')
    : loss ? `${t('ascent.battle.priceOurs', { ours: String(Math.round(loss.ours)) })}  ·  `
      + t('ascent.battle.priceTheirs', { theirs: String(Math.round(loss.theirs)) })
      : t('ascent.battle.priceOpening');
  const losing = !walking && loss !== undefined && loss.ours > loss.theirs;
  orders.add(self.ui.label(content.x + 2, y, price, 'label', {
    fontSize: '11px',
    color: walking ? INK_UI_HEX.mutedText
      : losing ? '#8a2a1b'
        : loss ? '#4c5f45' : INK_UI_HEX.mutedText,
  }));

  // How the two hosts' arms meet — spears against horse, bows against spears. Computed by the
  // fight, and until now printed in a loose line under the rails, where it sat beside the
  // telegraph and was read as part of it.
  const arms = battle.ourMatchup ?? 1;
  if (Math.abs(arms - 1) > 0.03) {
    orders.add(self.ui.label(
      content.x + 2, y + 13,
      arms > 1 ? t('ascent.battle.armsGood') : t('ascent.battle.armsBad'), 'caption',
      { fontSize: '9px', color: arms > 1 ? '#4c5f45' : '#8a2a1b' },
    ));
  }


  /**
   * One slot on the right, and three things that might want it.
   *
   * Ranked, because they are about narrowing spans of time and the narrowest is the most useful:
   * *the order you just gave landed and it counters* beats *this round went your way* beats *the
   * last three did not and you have not answered*.
   *
   * Winning is announced the moment it is true. Losing is not its mirror — one bad exchange is
   * noise, and a banner that flickers on every other beat is a banner a player learns to ignore
   * inside one fight. It waits for three rounds against us with no order given in them, which is
   * the case actually worth interrupting for: somebody being countered who has not noticed.
   */
  const beatNow = (battle.approachBeats ?? 0) + battle.round;
  const landed = battle.landedBeat !== undefined && beatNow - battle.landedBeat <= 1 && !walking;
  const adrift = (battle.lostRun ?? 0) >= 3 && (battle.beatsSinceOurShape ?? 0) >= 3;
  const verdict = landed
    ? (battle.landedCountered === true
      ? { text: t('ascent.battle.landedGood'), colour: INK_UI.jade, loud: true }
      : { text: t('ascent.battle.landedEven'), colour: undefined, loud: false })
    : battle.wonLast === true
      ? { text: t('ascent.battle.winning'), colour: INK_UI.jade, loud: true }
      : adrift
        // The verb follows the meter: with a pip in hand the answer is a shape, with none it is
        // the one button that cuts the bleed while a pip comes back.
        ? {
          text: battleStamina(battle).pips > 0
            ? t('ascent.battle.losing') : t('ascent.battle.losingNoPips'),
          colour: INK_UI.cinnabar, loud: true,
        }
        : undefined;
  if (!verdict) return;

  const stamp = self.ui.label(
    content.x + content.width - 2, y + 4, verdict.text, 'label',
    {
      fontSize: verdict.loud ? '10.5px' : '9px',
      color: verdict.colour
        ? cssHex(verdict.colour)
        : INK_UI_HEX.mutedText,
    },
  ).setOrigin(1, 0);
  orders.add(stamp);
  if (verdict.loud) {
    self.tweens.add({
      targets: stamp, scale: { from: 1.28, to: 1 }, duration: 260, ease: 'Back.easeOut',
    });
  }
}
