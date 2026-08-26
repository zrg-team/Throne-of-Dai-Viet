/**
 * The three screens at a run's edges: the founding that picks the dynasty's champion, the mandate
 * the new reign chooses on its first morning, and the Reckoning that sums the reign up and sells
 * the next one. `heroDeckPrompt`/`heroDeckCard` live here because the founding is their first
 * caller; `prompts/court.ts` draws the same deck for the summon and the Favor draft.
 *
 * The deck is the one prompt family that skips `promptScrollBody` — an `InkScrollArea` would eat
 * a vertical flick — so nothing it builds is registered in `activeScrollAreas`, and every object
 * it makes must be added to `self.modalLayer` or `releaseOverlay` never destroys it.
 */
import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../../../game/constants';
import { codexProgress } from '../../../state/codex';
import { powerCardView } from '../../../systems/ascent/PowerDraftSystem';
import { tierForHero } from '../../../systems/ascent/SummonSystem';
import { renderHeroFaceInBox } from '../../../ui/FaceRenderer';
import { chronicleTally } from '../../../systems/story/StorySystem';
import { INK_UI, INK_UI_HEX, scrollGestureConsumedTap } from '../../../ui/InkUI';
import { arrivalPreview } from '../../../data/heroArrivals';
import { sawtoothBand, seal } from '../../../ui/ink/devices';
import { THRONE_HALL_HEIGHT, throneHallDiorama } from '../../../ui/ascent/throneHall';
import { CARD_STACK_PEEK, CardStack } from '../../../ui/ascent/CardStack';
import { drawCardIcon, iconForOption } from '../../../ui/CardIcons';
import { staggerIn } from '../../../ui/animations';
import { captureScreen } from '../../../ui/captureScreen';
import { TITLE_FONT, UI_FONT } from '../../../ui/fonts';
import { heroBio, heroName, heroTypeLabel, rarityLabel, t } from '../../../i18n';
import type { AscentPrompt, Hero } from '../../../state/types';
import { PROMPT_FOOTER_HEIGHT, RARITY_COLOR, RARITY_WASH, cssHex, heroStatLine } from '../constants';
import type { ConquestUIScene } from '../../ConquestUIScene';

/**
 * The founding: the champion who raises the dynasty you rule, dealt as a hand you hold.
 *
 * Three heroes, one 390-wide screen. Three columns cannot carry a bio, and three full cards
 * do not fit down the page, so the older layout was a carousel with two arrows nobody pressed.
 * A deck fixes the same problem with the gesture a phone already teaches: the front card is
 * whole, the ones behind it are visibly still there, and the thumb decides.
 */
export function showFounder(self: ConquestUIScene, prompt: Extract<AscentPrompt, { kind: 'founder' }>): void {
  const codex = codexProgress();
  const heroes = prompt.options
    .map((id) => self.state.heroDeck.find((candidate) => candidate.id === id))
    .filter((hero): hero is Hero => Boolean(hero));
  if (heroes.length === 0) {
    self.promptFrame(t('ascent.founder.title'), t('ascent.founder.subtitle'));
    return;
  }

  heroDeckPrompt(self, {
    title: t('ascent.founder.title'),
    subtitle: `${t('ascent.founder.subtitle')}
${t('ascent.codex.subtitle', codex)}`,
    heroes,
    noteFor: (hero) => arrivalPreview(hero) ?? t(`ascent.founder.gift.${hero.type}` as Parameters<typeof t>[0]),
    confirmLabel: t('ascent.founder.confirm'),
    onSelect: (hero) => self.choose(hero.id),
  });
}

/**
 * The court on the morning it changes hands: the hall, the empty seat, and your two standards.
 *
 * This was a single flag on bare paper, which said "here is a colour" and nothing else. The
 * screen it sits on is the one that announces a reign, so it now draws the place the reign
 * happens — roof, colonnade, steps, bronze urns, and nobody in the courtyard, because the
 * court has not been called yet. The flags stay, one at each side and named underneath: every
 * province the player takes will fly them, and this is still the cheapest place to teach a
 * colour the rest of the run depends on reading quickly.
 */
function addThroneHall(self: ConquestUIScene, parent: Phaser.GameObjects.Container, width: number): number {
  // On a short surface — `GAME_HEIGHT` clamps to 620 in a desktop browser — the court plus the
  // three advantages overruns the sheet by about a dozen pixels, and the whole screen starts
  // scrolling for no gain. The diorama is the part that can afford to give: it is a picture,
  // not information.
  const scale = GAME_HEIGHT < 700 ? 0.84 : 1;
  const drawn = Math.round(THRONE_HALL_HEIGHT * scale);
  const hall = throneHallDiorama(self, width, self.state.mapConfig.seed);
  hall.setScale(scale).setPosition((width * (1 - scale)) / 2, 0);
  parent.add(hall);

  const band = self.add.graphics();
  sawtoothBand(band, 0, drawn + 4, width, 7, 0.5);
  parent.add(band);

  const caption = self.add.text(0, drawn + 16, t('ascent.founder.standard'), {
    color: INK_UI_HEX.mutedText, fontFamily: UI_FONT, fontSize: '10px', align: 'center',
    wordWrap: { width },
  }).setFixedSize(width, 0);
  parent.add(caption);
  return drawn + 16 + caption.height + 10;
}

/**
 * The reign's first card: you take the throne, and choose what it already holds.
 *
 * Three across rather than stacked, because these are three *different first moves* and the
 * player should see all three at once to compare them. At 390 wide that is ~109px a column,
 * which fits a glyph, a name and one line and nothing else — no rarity badge in particular,
 * since `BADGE_CLEARANCE` (86) would drive the title width negative.
 *
 * Built the way `actionTiles` builds a row: every text object first, one `Math.max` over their
 * heights, *then* the surfaces. Letting each card size itself independently gives a ragged row.
 */
export function showMandate(self: ConquestUIScene, prompt: Extract<AscentPrompt, { kind: 'mandate' }>): void {
  const { body, bodyWidth, finish } = self.promptScrollBody(
    t('ascent.mandate.title'),
    t('ascent.mandate.subtitle'),
    0,
  );

  const top = addThroneHall(self, body, bodyWidth);
  const GAP = 8;
  const column = Math.floor((bodyWidth - GAP * 2) / 3);

  // Pass one: build the text, keep it, and remember the tallest.
  const built = prompt.options.map((cardId, index) => {
    const view = powerCardView(self.state, cardId);
    const x = index * (column + GAP);
    const title = self.ui.label(x + 10, 44, view?.name ?? cardId, 'label', {
      fontSize: '11.5px', align: 'center', wordWrap: { width: column - 20 },
    }).setFixedSize(column - 20, 0);
    const desc = self.add.text(x + 10, 0, view?.description ?? '', {
      color: INK_UI_HEX.mutedText, fontFamily: UI_FONT, fontSize: '10px', align: 'center',
      wordWrap: { width: column - 20 },
    }).setFixedSize(column - 20, 0);
    return { cardId, x, title, desc };
  });
  const headHeight = 44 + Math.max(...built.map((b) => b.title.height)) + 6;
  const height = headHeight + Math.max(...built.map((b) => b.desc.height)) + 12;

  // Pass two: surfaces behind the measured text, every column the same height.
  const cards = built.map(({ cardId, x, title, desc }) => {
    const card = self.add.container(x, top);
    title.setPosition(10, 44);
    desc.setPosition(10, headHeight);
    const surface = self.ui.panel({ x: 0, y: 0, width: column, height },
      { border: INK_UI.brush, borderWidth: 1.2, borderAlpha: 0.52 });
    card.add(surface);
    const wash = self.add.graphics();
    wash.fillStyle(INK_UI.gold, 0.09);
    wash.fillRoundedRect(2, 2, column - 4, height - 4, 8);
    card.add(wash);
    const glyph = drawCardIcon(self, iconForOption(cardId) ?? 'crown', INK_UI.gold);
    glyph.setPosition(column / 2, 26);
    card.add(glyph);
    card.add(title);
    card.add(desc);
    const zone = self.add.zone(0, 0, column, height).setOrigin(0, 0).setInteractive({ useHandCursor: true });
    zone.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (scrollGestureConsumedTap(pointer)) return;
      self.choose(cardId);
    });
    card.add(zone);
    body.add(card);
    return card;
  });
  staggerIn(self, cards);
  finish(top + height + 16);
}

/**
 * One champion, drawn as a card you would hold: portrait first, then who they are, then the
 * one line that says what taking them changes on the board.
 *
 * Fixed height on purpose — every card in a stack has to be the same size, or the ones peeking
 * out behind the front one stick out at different distances and the deck reads as a mess. The
 * height comes from the room the screen actually has, so the only thing that gives is the bio:
 * `maxLines` is computed from what is left after the note is placed, rather than letting a long
 * life story push the gift line off the bottom edge.
 */
function heroDeckCard(self: ConquestUIScene,
  hero: Hero,
  width: number,
  height: number,
  opts: { badge?: string; note?: string },
): Phaser.GameObjects.Container {
  const container = self.add.container(0, 0);
  const tier = tierForHero(hero);
  const PAD = 12;
  const textWidth = width - PAD * 2;

  // Paper, wash and the rarity rail first: everything else is read off them.
  container.add(self.ui.panel({ x: 0, y: 0, width, height }, {
    border: INK_UI.brush, borderWidth: 1.2, borderAlpha: 0.52,
  }));
  const wash = self.add.graphics();
  wash.fillStyle(RARITY_COLOR[tier], RARITY_WASH[tier]);
  wash.fillRoundedRect(2, 2, width - 4, height - 4, 8);
  container.add(wash);
  // A ruler's card is the only one in the mode that gets a ground of its own, and a chop.
  if (hero.arrival) {
    const ground = self.add.graphics();
    ground.fillStyle(INK_UI.gold, 0.1);
    ground.fillRoundedRect(2, 2, width - 4, height - 4, 8);
    container.add(ground);
  }
  const rail = self.add.graphics();
  rail.fillStyle(RARITY_COLOR[tier], 1);
  rail.fillRect(1, 6, 4.5, height - 12);
  container.add(rail);

  // Rarity on the left, whatever the screen wants to shout on the right.
  container.add(self.add.text(PAD, 10, rarityLabel(hero.rarity), {
    color: INK_UI_HEX.mutedText, fontFamily: UI_FONT, fontSize: '10px', fontStyle: '700',
  }));
  if (opts.badge) {
    container.add(self.add.text(width - PAD, 10, opts.badge, {
      color: '#8a5f1c', fontFamily: UI_FONT, fontSize: '10px', fontStyle: '700',
    }).setOrigin(1, 0));
  }

  const faceHeight = Phaser.Math.Clamp(Math.round(height * 0.42), 88, 142);
  const faceWidth = Math.round(faceHeight * 0.78);
  container.add(renderHeroFaceInBox(self, hero, {
    x: (width - faceWidth) / 2, y: 26, width: faceWidth, height: faceHeight,
  }));

  let cursor = 26 + faceHeight + 6;
  const name = self.add.text(width / 2, cursor, heroName(hero), {
    color: INK_UI_HEX.inkText, fontFamily: TITLE_FONT, fontSize: '17px', fontStyle: '700',
    align: 'center', wordWrap: { width: textWidth },
  }).setOrigin(0.5, 0);
  container.add(name);
  cursor += name.height + 2;

  const line = self.add.text(width / 2, cursor,
    `${heroTypeLabel(hero.type)}   ·   ${heroStatLine(hero)}`, {
      color: INK_UI_HEX.mutedText, fontFamily: UI_FONT, fontSize: '10.5px', align: 'center',
    }).setOrigin(0.5, 0);
  container.add(line);
  cursor += line.height + 6;

  const rule = self.add.graphics();
  sawtoothBand(rule, PAD + 12, cursor, textWidth - 24, 5, 0.4);
  container.add(rule);
  cursor += 12;

  // The note is pinned to the foot, so the bio is given exactly the gap that is left.
  let noteTop = height - PAD;
  if (opts.note) {
    const note = self.add.text(width / 2, 0, opts.note, {
      color: '#8a5f1c', fontFamily: UI_FONT, fontSize: '10.5px', fontStyle: '700',
      align: 'center', wordWrap: { width: textWidth },
    }).setOrigin(0.5, 0);
    noteTop = height - PAD - note.height;
    note.setY(noteTop);
    container.add(note);
  }

  const BIO_LINE = 15;
  const bioRoom = noteTop - 6 - cursor;
  const bioLines = Math.max(1, Math.floor(bioRoom / BIO_LINE));
  const bio = self.add.text(width / 2, cursor, heroBio(hero), {
    color: INK_UI_HEX.mutedText, fontFamily: UI_FONT, fontSize: '10.5px', align: 'center',
    lineSpacing: 2, wordWrap: { width: textWidth }, maxLines: bioLines,
  }).setOrigin(0.5, 0);
  // `maxLines` alone cuts the last line dead, mid-word, with nothing to say it was cut — the
  // life stories in this game run long enough that a card regularly ended on "Trước khi".
  // Re-set it to the lines that fit, ending on a whole word and an ellipsis.
  const wrapped = bio.getWrappedText();
  if (wrapped.length > bioLines) {
    bio.setText(`${wrapped.slice(0, bioLines).join(' ').replace(/[\s,;:.—–-]+$/u, '')}…`);
  }
  // A two-line life against a card sized for six leaves a hole in the middle of the paper, so
  // the bio floats in the gap it was given rather than clinging to the rule above it.
  bio.setY(cursor + Math.max(0, Math.round((bioRoom - bio.height) / 2)));
  container.add(bio);

  if (hero.arrival) {
    const chop = self.add.graphics();
    seal(chop, width - 28, height - 26, 22, 'lotus');
    container.add(chop);
  }

  // Gold and Jade pulls glow — the one moment the mode leans into the gacha reveal.
  if (tier === 'gold' || tier === 'jade') {
    const glow = self.add.graphics();
    glow.lineStyle(3, RARITY_COLOR[tier], 0.8);
    glow.strokeRoundedRect(-2, -2, width + 4, height + 4, 10);
    container.add(glow);
    self.tweens.add({
      targets: glow, alpha: { from: 0.25, to: 1 }, duration: 900, yoyo: true, repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  return container;
}

/**
 * Every "choose a champion out of a draw" screen in the mode: the founding, the summon, and
 * the court's presentation.
 *
 * One deck, flicked through with the thumb, plus buttons that do exactly what the gestures do —
 * the gestures are the fast path, never the only path, because a mouse has no thumb and a
 * player who has not read the hint still has to be able to finish the screen. Deliberately not
 * built on `promptScrollBody`: an `InkScrollArea` drives itself off the scene's pointer stream,
 * so a vertical flick would scroll the sheet *and* take the card.
 */
export function heroDeckPrompt(self: ConquestUIScene, opts: {
  title: string;
  subtitle: string;
  heroes: Hero[];
  badgeFor?: (hero: Hero) => string | undefined;
  noteFor?: (hero: Hero) => string | undefined;
  confirmLabel: string;
  ignoreLabel?: string;
  onSelect: (hero: Hero) => void;
  onIgnore?: () => void;
}): void {
  const content = self.promptFrame(opts.title, opts.subtitle);

  // Room for the footer buttons, the dots-and-hint strip, and the two cards fanned below.
  const HINT_STRIP = 38;
  const available = content.height - PROMPT_FOOTER_HEIGHT - HINT_STRIP - CARD_STACK_PEEK;
  const cardHeight = Phaser.Math.Clamp(available, 200, 340);
  // The fanned cards rotate a little, so the deck is inset from the content edges or their
  // corners clip through the screen's margin.
  const cardWidth = content.width - 12;
  const cardX = content.x + 6;
  const cardY = content.y + Math.max(0, Math.round((available - cardHeight) / 2));

  const cards = opts.heroes.map((hero) => heroDeckCard(self, hero, cardWidth, cardHeight, {
    badge: opts.badgeFor?.(hero),
    note: opts.noteFor?.(hero),
  }));

  const stripY = cardY + cardHeight + CARD_STACK_PEEK + 8;

  // Which of them you are holding. Three cards deep, the fan alone does not say "of three".
  const dots = self.add.graphics();
  self.modalLayer.add(dots);
  const paintDots = (index: number): void => {
    dots.clear();
    const span = opts.heroes.length * 14;
    opts.heroes.forEach((_, i) => {
      dots.fillStyle(i === index ? INK_UI.cinnabar : INK_UI.softBrush, i === index ? 1 : 0.35);
      dots.fillCircle(GAME_WIDTH / 2 - span / 2 + 7 + i * 14, stripY + 4, i === index ? 4 : 3);
    });
  };

  const stack = new CardStack(self, {
    x: cardX,
    y: cardY,
    width: cardWidth,
    height: cardHeight,
    cards,
    onSelect: (index) => opts.onSelect(opts.heroes[index]),
    onBrowse: paintDots,
  });
  self.modalLayer.add(stack.view);
  paintDots(0);

  // How the deck works, said once, under it. A gesture nobody is told about is a gesture nobody
  // makes — the carousel this replaced had exactly that problem and answered it with arrows.
  self.modalLayer.add(self.add.text(GAME_WIDTH / 2, stripY + 14, t('ascent.pick.hint'), {
    color: INK_UI_HEX.mutedText, fontFamily: UI_FONT, fontSize: '10px', align: 'center',
    wordWrap: { width: content.width - 60 },
  }).setOrigin(0.5, 0));

  // The arrows stay, for the mouse and for the player who has not tried the flick yet.
  if (opts.heroes.length > 1) {
    const arrow = (x: number, glyph: string, step: number): void => {
      const hit = self.add.text(x, stripY + 12, glyph, {
        color: INK_UI_HEX.mutedText, fontFamily: UI_FONT, fontSize: '20px',
      }).setOrigin(0.5, 0).setInteractive({ useHandCursor: true });
      hit.on('pointerup', () => stack.browse(step));
      self.modalLayer.add(hit);
    };
    arrow(content.x + 10, '◀', -1);
    arrow(content.x + content.width - 10, '▶', 1);
  }

  const footerY = GAME_HEIGHT - PROMPT_FOOTER_HEIGHT + 8;
  if (opts.ignoreLabel && opts.onIgnore) {
    const gap = 10;
    const half = Math.floor((content.width - gap) / 2);
    self.modalLayer.add(self.ui.button(
      { x: content.x, y: footerY, width: half, height: 40 },
      opts.ignoreLabel,
      opts.onIgnore,
      { variant: 'ghost', fontSize: '13px' },
    ));
    self.modalLayer.add(self.ui.button(
      { x: content.x + half + gap, y: footerY, width: content.width - half - gap, height: 40 },
      opts.confirmLabel,
      () => stack.select(),
      { variant: 'primary', fontSize: '13px' },
    ));
    return;
  }
  self.modalLayer.add(self.ui.button(
    { x: content.x, y: footerY, width: content.width, height: 40 },
    opts.confirmLabel,
    () => stack.select(),
    { variant: 'primary', fontSize: '14px' },
  ));
}

/**
 * The Reckoning, written as a **chiếu chỉ** — the edict a court promulgates when a reign closes.
 *
 * It was a stack of admin: a score plate, seven label-and-number rows, and a gold panel selling
 * the meta-shop. Correct, and nothing anyone would keep. This is the last thing a run says and
 * the only screen a player has any reason to show somebody else, so it is now the one page in
 * the game built to be *looked at*: the double rule and the sawtooth register the drum uses, the
 * decree line down the middle, and a seal pressed crooked in the corner the way a hand presses
 * one.
 *
 * **What it counts changed with it.** The old rows summed the realm — power, provinces, cards —
 * which is the state of a machine and not the story of a reign. A war is remembered by its dead,
 * and the numbers were already being spent and thrown away: `recordEngagement` now keeps them
 * (`battleReport`), so the edict can say how many of the enemy fell, how many of ours did, and
 * how many hosts were broken.
 *
 * **No Legacy panel.** It was the loudest thing on the page and it was an advertisement — a gold
 * border, a progress bar and a line about what is nearly affordable, on the screen commemorating
 * a dynasty that just ended. Legacy still banks exactly as before and the front page still spends
 * it; it is simply not what this page is for.
 *
 * **It can be kept.** `captureScreen` takes the frame and hands it to the share sheet, which on
 * a phone means Photos. The layout is deliberately fixed rather than scrolling for this reason —
 * a snapshot photographs what is on the glass, so a page that scrolls is a page that saves half
 * of itself.
 */
export function showRunOver(self: ConquestUIScene, prompt: Extract<AscentPrompt, { kind: 'run-over' }>): void {
  const ascent = self.state.ascent;
  const score = self.state.campaignScore;
  const beatBest = prompt.score > prompt.previousBest;

  // The reign leads the subtitle when it has a name. The Reckoning previously said only how the
  // dynasty fell, so a run that legislated its way to the Hong Duc code closed on exactly the
  // same sentence as one that never passed a law — the two things it is most worth telling apart.
  const fall = prompt.cause === 'capital'
    ? t('ascent.over.causeCapital', { land: prompt.landName ?? '', waves: ascent?.wavesSurvived ?? 0 })
    : t('ascent.over.causeAnnihilated', { waves: ascent?.wavesSurvived ?? 0 });
  const content = self.promptFrame(
    prompt.reign ?? t('ascent.over.title'),
    prompt.reignDetail ? `${prompt.reignDetail}
${fall}` : fall,
  );

  // Every band on this page is paid for out of one budget, because the page must not scroll and
  // `GAME_HEIGHT` clamps as low as 620 — where the frame above has already spent most of it on a
  // two-line reign name. It is a *document*: a decree that stops two thirds of the way down with a
  // drift of blank paper under it is a form, not an edict, so the slack — nothing at 620, two
  // hundred points at 1040 — is spent on the plate, the tiles and the air between the bands.
  // `tight` is the one hard branch: at the clamp the shelf line goes and the tiles drop to 38.
  const BUTTONS = 40 + 8 + 46 + 8 + 40;
  const FLOOR = 92 + 10 + 3 * 38 + 2 * 8 + 10 + 12 + BUTTONS;
  const tight = content.height < FLOOR + 34;
  const slack = Math.max(0, content.height - (FLOOR + (tight ? 0 : 34)));
  const plateH = 92 + Math.min(38, Math.round(slack * 0.26));
  const shelfH = tight ? 0 : 34;
  // The controls take the foot and never move; everything above is measured back from them.
  const buttonY = content.y + content.height - BUTTONS - 2;
  const air = Math.min(20, Math.max(6, Math.round(slack * 0.12)));
  /**
   * The tiles are what *fills* the page, so their height is derived from the room left rather
   * than picked and then padded around. Clamped both ways: 38 is the floor at the 620 clamp, and
   * past 78 a six-tile grid stops reading as a ledger and starts reading as six buttons.
   */
  const gridRoom = buttonY - (content.y + plateH + 10 + air) - air - shelfH - 10;
  const tileH = Math.max(38, Math.min(78, Math.floor((gridRoom - 16) / 3)));

  // ── The edict plate ─────────────────────────────────────────────────────
  const plate = self.add.graphics();
  self.modalLayer.add(plate);
  // Two rules, the outer heavy and the inner hairline, with the drum's sawtooth between them at
  // the head. This is the register the whole game's chrome is drawn in — see `devices.ts` — and
  // it is the difference between a panel and a document.
  plate.fillStyle(INK_UI.parchment, 0.96);
  plate.fillRect(content.x, content.y, content.width, plateH);
  plate.lineStyle(2.2, beatBest ? INK_UI.gold : INK_UI.brush, 0.95);
  plate.strokeRect(content.x, content.y, content.width, plateH);
  plate.lineStyle(0.9, INK_UI.brush, 0.5);
  plate.strokeRect(content.x + 4, content.y + 4, content.width - 8, plateH - 8);
  sawtoothBand(plate, content.x + 8, content.y + 8, content.width - 16, 5, 0.5);

  const edict = self.add.text(content.x + 14, content.y + 20, t('ascent.over.edict'), {
    color: cssHex(INK_UI.cinnabarDark),
    fontFamily: TITLE_FONT,
    fontSize: '13px',
    fontStyle: '700',
  });
  edict.setLetterSpacing?.(2.4);
  self.modalLayer.add(edict);

  // A hand-ruled line under the head, the way a decree separates its formula from its substance.
  plate.lineStyle(0.9, INK_UI.brush, 0.35);
  plate.lineBetween(content.x + 14, content.y + 36, content.x + content.width - 14, content.y + 36);

  const scoreY = content.y + 36 + Math.max(6, Math.round((plateH - 36 - 48) / 2));
  self.modalLayer.add(self.ui.label(content.x + 14, scoreY,
    beatBest ? t('ascent.over.newBest') : t('ascent.over.scoreLabel'), 'caption', { fontSize: '10px' }));
  self.modalLayer.add(self.ui.label(content.x + 14, scoreY + 12,
    prompt.score.toLocaleString('en-US'), 'label', { fontSize: '32px' }));
  self.modalLayer.add(self.ui.label(content.x + content.width - 64, scoreY + 24,
    t('ascent.over.best', { best: Math.max(prompt.previousBest, prompt.score).toLocaleString('en-US') }),
    'caption', { align: 'right', fontSize: '10px' }).setOrigin(1, 0));

  // Pressed, not printed: the seal rides the corner and overhangs the rule, because that is what
  // a seal does to a document and it is the one mark on the page that says somebody signed this.
  const stamp = self.add.graphics();
  self.modalLayer.add(stamp);
  seal(stamp, content.x + content.width - 32, content.y + plateH - 32, 46,
    beatBest ? 'star' : 'lotus');

  // ── The ledger: what the reign spent and what it took ───────────────────
  const gridY = content.y + plateH + 10 + air;
  const colW = (content.width - 8) / 2;
  const tiles: Array<[string, string, number]> = [
    [t('ascent.over.waves'), String(ascent?.wavesSurvived ?? 0), INK_UI.gold],
    // The two headline numbers this page exists to add. Both were spent by every fight in the
    // run and neither was ever added up until `recordEngagement`.
    [t('ascent.over.slain'), (score?.enemySoldiersSlain ?? 0).toLocaleString('en-US'), INK_UI.cinnabar],
    [t('ascent.over.hostsBroken'), String(score?.armiesDefeated ?? 0), INK_UI.cinnabar],
    [t('ascent.over.ourDead'), (score?.ownSoldiersLost ?? 0).toLocaleString('en-US'), INK_UI.softBrush],
    [t('ascent.over.peakPower'), Math.round(ascent?.peakPower ?? 0).toLocaleString('en-US'), INK_UI.jade],
    [t('ascent.over.lands'), String(score?.peakLandsHeld ?? 0), INK_UI.jade],
  ];
  tiles.forEach(([label, value, accent], index) => {
    const x = content.x + (index % 2) * (colW + 8);
    const y = gridY + Math.floor(index / 2) * (tileH + 8);
    self.modalLayer.add(self.ui.panel({ x, y, width: colW, height: tileH },
      { border: INK_UI.softBrush, fillAlpha: 0.5 }));
    // A hairline of the tile's own ink down its left edge — the same rule the option cards use
    // to say what class a row belongs to, at a sixth of the width.
    const edge = self.add.graphics();
    edge.fillStyle(accent, 0.9);
    edge.fillRect(x + 1.5, y + 5, 2.5, tileH - 10);
    self.modalLayer.add(edge);
    // The caption sits on the tile's head and the figure on its foot, so the pair reads as a
    // ledger entry at any height the grid takes. Both offsets are `tight`-aware: at the 38-point
    // floor a 9px caption and a 20px figure are 33 points of type in a 38-point box, and the
    // caption printed straight through the number.
    self.modalLayer.add(self.ui.label(x + 12, y + (tight ? 4 : 7), label, 'caption',
      { fontSize: tight ? '8px' : '9px' }));
    self.modalLayer.add(self.ui.label(x + 12, y + tileH - (tight ? 21 : 28), value, 'label',
      { fontSize: tight ? '15px' : '20px' }));
  });
  let cursor = gridY + 3 * (tileH + 8) - 8 + air;

  // ── The shelf, in one line ──────────────────────────────────────────────
  // Champions, powers and stories were three rows of a table each; they are counts, not a
  // reckoning, and they belong under the ledger rather than in it.
  if (!tight) {
    const storyTally = chronicleTally(self.state);
    const endings = storyTally['chinh-su'] + storyTally['da-su'] + storyTally['ngoai-truyen'];
    const cards = Object.values(ascent?.cardStacks ?? {}).reduce((a, b) => a + b, 0);
    self.modalLayer.add(self.ui.label(content.x + content.width / 2, cursor,
      t('ascent.over.shelf', { heroes: ascent?.heroesSummoned ?? 0, cards, stories: endings }),
      'caption', { fontSize: '10px', align: 'center', wordWrap: { width: content.width - 8 } })
      .setOrigin(0.5, 0));
    cursor += 16;

    // The dead this reign put up a shrine to, by name. `state.memorials` is not the Chronicle's
    // sixty-entry ring and is never evicted — a shrine the record forgets is not a shrine. It is
    // the one line here whose height nothing bounds (a long reign enshrines several names and it
    // wraps), so it is only printed when there is room above the controls for it to wrap into.
    const named = (self.state.memorials ?? []).map((entry) => entry.name).filter(Boolean);
    if (named.length > 0 && cursor + 24 < buttonY) {
      const line = self.ui.label(content.x + content.width / 2, cursor,
        t('ascent.over.enshrined', { names: named.join(' · ') }), 'caption',
        { fontSize: '9px', align: 'center', wordWrap: { width: content.width - 8 } })
        .setOrigin(0.5, 0);
      self.modalLayer.add(line);
      cursor += line.height + 4;
    }
  }

  // ── Keep it, then go again ──────────────────────────────────────────────
  const keep = self.ui.button(
    { x: content.x, y: buttonY, width: content.width, height: 40 },
    t('ascent.over.keep'),
    () => {
      // The label is the whole feedback channel: there is no toast on this screen and a share
      // sheet that is still opening looks exactly like a button that did nothing.
      const face = keep.list.find((part): part is Phaser.GameObjects.Text => (
        part instanceof Phaser.GameObjects.Text));
      face?.setText(t('ascent.over.keeping'));
      void captureScreen(self.game, prompt.reign ?? t('ascent.over.title')).then((result) => {
        face?.setText(t(result === 'failed' ? 'ascent.over.keepFailed' : 'ascent.over.kept'));
      });
    },
    { fontSize: '13px' },
  );
  self.modalLayer.add(keep);

  self.modalLayer.add(self.ui.button(
    { x: content.x, y: buttonY + 48, width: content.width, height: 46 },
    t('ascent.over.again'),
    () => self.events.emit('ui:restart-ascent'),
    { variant: 'primary', fontSize: '15px' },
  ));
  // The Codex belongs here and nowhere else in a run: this is the moment the collection actually
  // changed, and the only moment a player has a reason to look at what they have recorded. On the
  // action bar it was a button promising something to do about a list of "???" rows.
  const codex = codexProgress();
  self.modalLayer.add(self.ui.button(
    { x: content.x, y: buttonY + 102, width: content.width / 2 - 5, height: 40 },
    t('ascent.codex.button', codex),
    () => self.showCodex(),
    { fontSize: '12px' },
  ));
  self.modalLayer.add(self.ui.button(
    { x: content.x + content.width / 2 + 5, y: buttonY + 102, width: content.width / 2 - 5, height: 40 },
    t('ascent.over.return'),
    () => self.events.emit('ui:exit-to-menu'),
    { fontSize: '13px' },
  ));
}
