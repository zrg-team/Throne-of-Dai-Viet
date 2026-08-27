/**
 * The chrome every Dragon Ascent sheet is drawn inside: the dim, the centred title/subtitle stack,
 * and — for prompts long enough to need it — a scrolling body with a fixed footer beneath. Lanes,
 * the Codex and the quit sheet call `promptFrame` too, so this is the one layout every full-screen
 * surface in the mode agrees on; the dim starts at `HEADER_HEIGHT + ASCENT_HUD_HEIGHT` rather than
 * 0, leaving the POWER band lit above it while the player chooses.
 *
 * `choose` is that same exchange going the other way — `ui:ascent-choice`, which `ConquestScene`
 * hands to the systems. Nothing in this file calls it; it sits with the frame because the two are
 * the ends of one question. A scroll area pushed onto `activeScrollAreas` is destroyed by
 * `releaseOverlay`, and one that misses that list leaves a global wheel handler on a dead scene.
 */
import { t } from '../../../i18n';
import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, HEADER_HEIGHT } from '../../../game/constants';
import { INK_UI, type UIBounds } from '../../../ui/InkUI';
import { playArrivalFanfare } from '../../../ui/ascent/arrivalFanfare';
import { ASCENT_HUD_HEIGHT } from '../../../ui/ascent/AscentHud';
import { TITLE_FONT, UI_FONT } from '../../../ui/fonts';
import type { ConquestUIScene } from '../../ConquestUIScene';


/**
 * Full-screen frame shared by every prompt. Returns the content area to lay out into.
 *
 * The dim starts *below* the HUD band on purpose: POWER stays lit and readable while the
 * player chooses, so the "▲ POWER +7%" badge on a card has the number it refers to sitting
 * right above it — and the count-up is visible the moment the choice lands.
 */
export function promptFrame(
  self: ConquestUIScene,
  title: string,
  subtitle: string,
  opts: {
    /**
     * Take the run's readout band as well — for a **lane**, never for a decision card.
     *
     * POWER, the level, the wave countdown and the threat figure are what you read *between*
     * decisions; a card's "▲ POWER +7%" badge points straight up at the number it is talking
     * about, so a prompt must leave that band lit. A lane is a page you have opened to work in,
     * and there the same band is forty-eight points of chrome above a list — reported as *too
     * much space for header; compact it and give the bottom more room for buttons.* Covered
     * opaquely while the page is up, and lit again the moment it closes.
     */
    coverReadout?: boolean;
  } = {},
): UIBounds {
  const top = opts.coverReadout ? HEADER_HEIGHT : HEADER_HEIGHT + ASCENT_HUD_HEIGHT;

  if (opts.coverReadout) {
    // Opaque over the readout, and only over it: the 0.93 below is what makes a sheet read as
    // *over* the map, and a band of it laid over the lit HUD would show the figures through.
    self.modalLayer.add(self.add
      .rectangle(0, top, GAME_WIDTH, ASCENT_HUD_HEIGHT, INK_UI.overlay, 1)
      .setOrigin(0, 0)
      .setInteractive());
  }
  const dimTop = opts.coverReadout ? top + ASCENT_HUD_HEIGHT : top;
  const dim = self.add
    .rectangle(0, dimTop, GAME_WIDTH, GAME_HEIGHT - dimTop, INK_UI.overlay, 0.93)
    .setOrigin(0, 0)
    .setInteractive();
  self.modalLayer.add(dim);

  // Stack, don't place at fixed offsets: titles wrap to two lines in Vietnamese (and for
  // long empire names), which collided with a hardcoded subtitle position.
  let cursor = top + 14;

  const titleText = self.add.text(GAME_WIDTH / 2, cursor, title, {
    color: '#2a2118',
    fontFamily: TITLE_FONT,
    fontSize: '20px',
    fontStyle: '700',
    align: 'center',
    lineSpacing: 2,
    wordWrap: { width: GAME_WIDTH - 48 },
  }).setOrigin(0.5, 0);
  self.modalLayer.add(titleText);
  cursor += titleText.height + 6;

  const subtitleText = self.add.text(GAME_WIDTH / 2, cursor, subtitle, {
    color: '#5a4c39',
    fontFamily: UI_FONT,
    fontSize: '12px',
    align: 'center',
    lineSpacing: 2,
    wordWrap: { width: GAME_WIDTH - 56 },
  }).setOrigin(0.5, 0);
  self.modalLayer.add(subtitleText);
  cursor += subtitleText.height + 14;

  return { x: 20, y: cursor, width: GAME_WIDTH - 40, height: GAME_HEIGHT - cursor - 20 };
}

export function choose(self: ConquestUIScene, choiceId: string): void {
  // A ruler joining is the one draw in a run that changes the board, so it gets the one
  // celebration the mode has. Fired from the tap rather than from the system, because the
  // systems are Phaser-free by design and a tween cannot live there.
  const joining = self.state.heroDeck.find((hero) => hero.id === choiceId);
  if (joining?.arrival) {
    playArrivalFanfare(self, GAME_WIDTH / 2, GAME_HEIGHT / 2);
  }
  self.events.emit('ui:ascent-choice', choiceId);
}

/**
 * A prompt body that scrolls, with a fixed footer below it.
 *
 * The counterpart of `laneList` for the decision prompts. Every prompt renderer used to lay its
 * cards out at a fixed stride straight into `modalLayer` and discard the `content.height` that
 * `promptFrame` returns, so nothing ever compared what it was drawing against the room it had.
 * `GAME_HEIGHT` is clamped to **620 on a desktop browser** (`constants.ts`), where a four-card
 * draft plus its footer needs about 775px — the last card and both buttons were simply below the
 * bottom edge, unreachable. It fits on a 390x844 phone, which is why it looked fine in testing.
 *
 * `footerHeight` is the room to keep clear at the foot for fixed buttons; pass 0 for none.
 */
export function promptScrollBody(self: ConquestUIScene,
  title: string,
  subtitle: string,
  footerHeight: number,
): { content: UIBounds; body: Phaser.GameObjects.Container; bodyWidth: number; finish: (usedHeight: number) => void } {
  const content = promptFrame(self, title, subtitle);
  // Measured once and used for both the mask and the content floor below. Deriving them separately
  // let a very short sheet floor the viewport at 80 while the content height stayed under it, which
  // pinned `maxScroll` to 0 and made the sheet unscrollable exactly when it needed to scroll most.
  const viewportHeight = Math.max(80, content.height - footerHeight);
  const scroll = self.ui.scrollArea({
    x: content.x,
    y: content.y,
    width: content.width,
    height: viewportHeight,
  });
  scroll.addTo(self.modalLayer);
  // Required: `releaseOverlay` destroys these, and an InkScrollArea that is never destroyed
  // leaves its global wheel handler hooked to a dead scene.
  self.activeScrollAreas.push(scroll);

  return {
    content,
    body: scroll.content,
    // The scroll area's own width, less a little so a card's right edge never sits under the mask.
    bodyWidth: content.width - 6,
    finish: (usedHeight: number) => {
      scroll.setContentHeight(Math.max(viewportHeight, usedHeight));
      drawHoldHint(self, content, footerHeight);
    },
  };
}

/**
 * "Hold to choose", printed only on pages where holding is actually required.
 *
 * `optionCard` is the one control in the game that wants a press held (see `CARD_HOLD_MS`), and it
 * is a *silent* requirement: a card that refuses a tap reads as broken rather than as careful. The
 * complaint was exactly that — the cards still had to be held, with nothing anywhere saying so.
 *
 * Drawn from `finish` rather than from the frame, because the frame is built before anybody knows
 * what the page contains. `optionCard` raises a flag as it draws; a page of plain rows or a lane
 * never raises it and never gets the line. Nothing has to be told which pages have cards on them,
 * which is the only version of this that stays true as pages are added.
 *
 * Sits under the scroll viewport and above the footer buttons — outside the scrolling content, so
 * it cannot scroll away from the cards it is describing.
 */
function drawHoldHint(self: ConquestUIScene, content: UIBounds, footerHeight: number): void {
  if (!self.promptUsedHoldCards) return;
  self.promptUsedHoldCards = false;
  const y = content.y + Math.max(80, content.height - footerHeight) + 3;
  // Never over the footer's own buttons: on the shortest screen the viewport already reaches them.
  if (y > content.y + content.height - 10) return;
  const hint = self.ui.label(content.x + content.width / 2, y, t('ascent.card.holdHint'), 'caption', {
    fontSize: '9px', align: 'center', wordWrap: { width: content.width - 8 },
  }).setOrigin(0.5, 0);
  self.modalLayer.add(hint);
}
