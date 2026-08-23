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
import { codexProgress, storyProgress } from '../../../state/codex';
import { getMemorials } from '../../../systems/story/echoes';
import { LEGACY_PERKS, ownsPerk } from '../../../state/legacy';
import { powerCardView } from '../../../systems/ascent/PowerDraftSystem';
import { tierForHero } from '../../../systems/ascent/SummonSystem';
import { renderHeroFaceInBox } from '../../../ui/FaceRenderer';
import { chronicleTally } from '../../../systems/story/StorySystem';
import { storyCatalogIds } from '../../../i18n/story';
import { INK_UI, INK_UI_HEX, scrollGestureConsumedTap } from '../../../ui/InkUI';
import { arrivalPreview } from '../../../data/heroArrivals';
import { sawtoothBand, seal } from '../../../ui/ink/devices';
import { THRONE_HALL_HEIGHT, throneHallDiorama } from '../../../ui/ascent/throneHall';
import { CARD_STACK_PEEK, CardStack } from '../../../ui/ascent/CardStack';
import { drawCardIcon, iconForOption } from '../../../ui/CardIcons';
import { staggerIn } from '../../../ui/animations';
import { TITLE_FONT, UI_FONT } from '../../../ui/fonts';
import { heroBio, heroName, heroTypeLabel, rarityLabel, t } from '../../../i18n';
import type { AscentPrompt, Hero } from '../../../state/types';
import { PROMPT_FOOTER_HEIGHT, RARITY_COLOR, RARITY_WASH, heroStatLine } from '../constants';
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
 * The summary. This is the screen that has to sell the *next* run, and it was the least
 * readable screen in the game: seven dim rows of brown-on-brown sitting directly on the
 * dimmed map, ending in one button back to the menu. Nothing named what had killed you,
 * nothing compared the run to your best, and nothing hinted that banked Legacy buys
 * permanent upgrades — so a loss taught the player nothing and offered them nothing.
 *
 * Now: a panel so the text has its own ground, the cause of death in plain words, the score
 * against the record you are chasing, what the run banked and what that is nearly enough to
 * buy, and a one-tap way back in.
 */
export function showRunOver(self: ConquestUIScene, prompt: Extract<AscentPrompt, { kind: 'run-over' }>): void {
  const ascent = self.state.ascent;
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

  // ── The headline: this run against the record ───────────────────────────
  const headHeight = 78;
  const head = self.ui.panel(
    { x: content.x, y: content.y, width: content.width, height: headHeight },
    { border: beatBest ? INK_UI.gold : INK_UI.softBrush, borderWidth: 2 },
  );
  self.modalLayer.add(head);
  self.modalLayer.add(self.ui.label(content.x + 16, content.y + 12,
    beatBest ? t('ascent.over.newBest') : t('ascent.over.scoreLabel'), 'caption', {}));
  self.modalLayer.add(self.ui.label(content.x + 16, content.y + 30,
    prompt.score.toLocaleString('en-US'), 'label', { fontSize: '30px' }));
  self.modalLayer.add(self.ui.label(content.x + content.width - 16, content.y + 34,
    t('ascent.over.best', { best: Math.max(prompt.previousBest, prompt.score).toLocaleString('en-US') }),
    'caption', { align: 'right' }).setOrigin(1, 0));

  // ── What the run was made of ────────────────────────────────────────────
  const rows: Array<[string, string]> = [
    [t('ascent.over.waves'), String(ascent?.wavesSurvived ?? 0)],
    [t('ascent.over.peakPower'), Math.round(ascent?.peakPower ?? 0).toLocaleString('en-US')],
    [t('ascent.over.lands'), String(self.state.campaignScore?.peakLandsHeld ?? 0)],
    [t('ascent.over.heroes'), String(ascent?.heroesSummoned ?? 0)],
    [t('ascent.over.cards'), String(Object.values(ascent?.cardStacks ?? {}).reduce((a, b) => a + b, 0))],
  ];
  // The Chronicle, at the one moment the run is being summed up. Five stories conclude in a
  // typical run and the Reckoning used to mention none of them; a reign that mostly followed the
  // record is a different reign from one that mostly did not, and this is the line that says so.
  const storyTally = chronicleTally(self.state);
  const endings = storyTally['chinh-su'] + storyTally['da-su'] + storyTally['ngoai-truyen'];
  if (endings > 0) {
    rows.push([t('ascent.over.stories'), String(endings)]);
    rows.push(['', t('ascent.over.storyLine', storyTally)]);
  }
  // The dead this reign put up a shrine to, by name. `state.memorials` is not the Chronicle's
  // sixty-entry ring and is never evicted — a shrine the record forgets is not a shrine — and
  // until now nothing drew it at all.
  const memorials = self.state.memorials ?? [];
  if (memorials.length > 0) {
    rows.push([t('ascent.over.memorials'), String(memorials.length)]);
    rows.push(['', memorials.map((entry) => entry.name).filter(Boolean).join(' · ')]);
  }
  const bodyY = content.y + headHeight + 10;
  const bodyHeight = rows.length * 26 + 20;
  self.modalLayer.add(self.ui.panel(
    { x: content.x, y: bodyY, width: content.width, height: bodyHeight },
    { border: INK_UI.softBrush },
  ));
  rows.forEach(([label, value], index) => {
    self.modalLayer.add(self.ui.infoRow(
      { x: content.x + 14, y: bodyY + 12 + index * 26, width: content.width - 28, height: 22 },
      label, value,
    ));
  });

  // ── Legacy: the reason to press the button ──────────────────────────────
  const legacyY = bodyY + bodyHeight + 10;
  const nextPerk = LEGACY_PERKS
    .filter((perk) => !ownsPerk(perk.id))
    .sort((a, b) => a.cost - b.cost)[0];
  const legacyHeight = nextPerk ? 74 : 50;
  self.modalLayer.add(self.ui.panel(
    { x: content.x, y: legacyY, width: content.width, height: legacyHeight },
    { border: INK_UI.gold, borderWidth: 2 },
  ));
  self.modalLayer.add(self.ui.label(content.x + 14, legacyY + 10,
    t('ascent.over.legacyEarned', { earned: prompt.legacyEarned, total: prompt.legacyTotal }), 'label', {
      fontSize: '13px', wordWrap: { width: content.width - 28 },
    }));
  if (nextPerk) {
    const short = Math.max(0, nextPerk.cost - prompt.legacyTotal);
    self.modalLayer.add(self.ui.label(content.x + 14, legacyY + 32,
      short > 0
        ? t('ascent.over.perkShort', { perk: t(`empire.legacy.perk.${nextPerk.id}` as Parameters<typeof t>[0]), short })
        : t('ascent.over.perkReady', { perk: t(`empire.legacy.perk.${nextPerk.id}` as Parameters<typeof t>[0]) }),
      'caption', { wordWrap: { width: content.width - 28 } }));
    self.modalLayer.add(self.ui.statBar(
      { x: content.x + 14, y: legacyY + legacyHeight - 14, width: content.width - 28, height: 6 },
      Math.min(prompt.legacyTotal, nextPerk.cost), nextPerk.cost, INK_UI.gold,
    ));
  }

  // ── Back in, or out to spend ────────────────────────────────────────────
  const buttonY = legacyY + legacyHeight + 14;
  self.modalLayer.add(self.ui.button(
    { x: content.x, y: buttonY, width: content.width, height: 46 },
    t('ascent.over.again'),
    () => self.events.emit('ui:restart-ascent'),
    { variant: 'primary', fontSize: '15px' },
  ));
  // The Codex belongs here and nowhere else in a run: this is the moment the collection actually
  // changed, and the only moment a player has a reason to look at what they have recorded. On the
  // action bar it was a button promising something to do about a list of "???" rows.
  const codex = codexProgress();
  self.modalLayer.add(self.ui.button(
    { x: content.x, y: buttonY + 54, width: content.width / 2 - 5, height: 40 },
    t('ascent.codex.button', codex),
    () => self.showCodex(),
    { fontSize: '12px' },
  ));
  // The other shelf, beside the champions: how much of the Chronicle this player has actually
  // met. The catalogue is several times larger than one run and nothing else says so.
  const stories = storyProgress(storyCatalogIds.length);
  self.modalLayer.add(self.ui.label(
    content.x, buttonY + 100,
    // The dead of *every* reign, not this one: `getMemorials` reads the cross-run echo ring, so
    // a name enshrined three dynasties ago is still counted here beside the stories met.
    `${t('ascent.codex.stories')}  ${stories.met}/${stories.total}`
      + (getMemorials().length > 0 ? `   ·   ${t('ascent.chronicle.memorials')} ${getMemorials().length}` : ''),
    'caption', { fontSize: '11px' },
  ));
  self.modalLayer.add(self.ui.button(
    { x: content.x + content.width / 2 + 5, y: buttonY + 54, width: content.width / 2 - 5, height: 40 },
    t('ascent.over.return'),
    () => self.events.emit('ui:exit-to-menu'),
    { fontSize: '13px' },
  ));
}
