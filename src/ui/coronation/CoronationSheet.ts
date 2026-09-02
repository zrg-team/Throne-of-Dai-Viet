import Phaser from 'phaser';
import { INK_UI, INK_UI_HEX, scrollGestureConsumedTap, type InkUI } from '../InkUI';
import { CARD_ICON_SIZE, drawCardIcon, type CardIconId } from '../CardIcons';
import { UI_FONT } from '../fonts';
import { renderLookInBox } from '../FaceRenderer';
import { drawHouseBanner, emblemIcon } from '../ascent/houseBanner';
import { dynastyRankRarity, getDynasty, type DynastyBanner, type DynastyFounder } from '../../state/dynasty';
import { HAIRS, SKINS } from '../faces/palette';
import {
  BANNER_EMBLEMS, BANNER_TRIMS, KING_DRESS_COUNT, KING_ERAS, KING_FACE_COUNT, KING_ROBES,
  ROYAL_HOUSES, buildKingLook, choiceFromStored, emblemLocked, jadeLocked, kingBeardPool,
  kingGarments, kingHairPool, kingHat, kingHatPool, kingRank, makeFounder, rollGivenName,
  rollKingChoice, warRegisterLocked,
  type KingChoice,
} from '../faces/kingLook';
import type { HeroLook, HeroLookPart } from '../faces/heroLook';
import { t } from '../../i18n';
import type { HeroEra } from '../../state/types';

/**
 * Lễ Đăng Quang — the four screens, drawn once and hosted twice.
 *
 * The rite runs inside a Dragon Ascent prompt on the first ever open, and the same steppers run
 * again from the Temple on the Tông Phả sheet, which is a menu page in a different scene. Both
 * hosts hand this class a container and a width and get a height back; the class owns the walk,
 * the choice and the redraw, and knows nothing about prompts or menu modes. Two copies of a
 * wardrobe picker would drift apart within a release — and the one that drifted would be the one
 * a player returns to after every milestone.
 *
 * The posture is Wildermyth's, not Crusader Kings': the sheet **opens on a finished, handsome
 * king** and every control nudges him. Nothing starts blank. A creator that asks a first-time
 * player to build a face from nothing stalls them before their first minute of play, which is
 * the run this screen exists to serve.
 */
export interface CoronationSheetHost {
  scene: Phaser.Scene;
  ui: InkUI;
  /**
   * `coronation` walks all four steps and ends by crowning; `temple` re-dresses a king who is
   * already crowned and never touches the name — looks change freely, the record never does.
   */
  mode: 'coronation' | 'temple';
  /** Tear the sheet down and draw it again. State lives on the sheet, not on the drawing. */
  redraw(): void;
  finish(founder: DynastyFounder): void;
  /** Coronation only: take the rolled king as-is. Writes a complete founder, never nothing. */
  skip?(): void;
  /** Temple only: leave without keeping the change. */
  cancel?(): void;
}

/** The wardrobe fields that open a grid. Each is a numeric index into a pool. */
export type GridField = 'hat' | 'hair' | 'face' | 'beard' | 'dress';

/**
 * The heading a grid wears. Spelled out rather than built as `coronation.field.${field}`:
 * `hat` is called `headwear` in the catalog, and a template that guesses a key is a key the
 * compiler cannot check — the cast that would make it compile is the whole of the trap.
 */
const GRID_TITLE: Record<GridField, Parameters<typeof t>[0]> = {
  hat: 'coronation.field.headwear',
  hair: 'coronation.field.hair',
  face: 'coronation.field.face',
  beard: 'coronation.field.beard',
  dress: 'coronation.field.dress',
};

const ROW_GAP = 7;
const STEP_ROW_H = 36;
const CHIP_ROW_H = 27;
const SWATCH_ROW_H = 24;

export class CoronationSheet {
  step = 0;
  /**
   * The wardrobe field whose option grid is open, if any.
   *
   * A step of the sheet rather than a layer over it, and that is not a shortcut. Both hosts —
   * a prompt inside the run and a menu page — already know how to tear this sheet down and draw
   * it again; a second, floating surface would need its own teardown in each of them, its own
   * scroll area registered in the right list, and its own way of not being left behind by a
   * navigation. As a step it inherits all three for free.
   */
  grid?: GridField;
  choice: KingChoice;
  houseIndex: number;
  givenName: string;
  banner: DynastyBanner;

  constructor(private readonly host: CoronationSheetHost) {
    const store = getDynasty();
    const founder = store.founder;
    // The Temple opens on the king it is re-dressing; the rite opens on a rolled one. Both open
    // on somebody — the empty state of this screen is a person, never a blank.
    this.choice = choiceFromStored(founder?.look) ?? rollKingChoice();
    const found = ROYAL_HOUSES.findIndex((house) => house.surname === (store.house ?? ''));
    this.houseIndex = found >= 0 ? found : Math.floor(Math.random() * ROYAL_HOUSES.length);
    this.givenName = founder?.givenName ?? rollGivenName(this.choice.sex);
    this.banner = founder?.banner ?? {
      field: ROYAL_HOUSES[this.houseIndex].field,
      trim: BANNER_TRIMS[0],
      emblem: 'crown',
    };
  }

  /** The steps this host walks, in order. The Temple never asks the name again. */
  private steps(): Array<'king' | 'name' | 'banner' | 'crown'> {
    return this.host.mode === 'temple' ? ['king', 'banner'] : ['king', 'name', 'banner', 'crown'];
  }

  private current(): 'king' | 'name' | 'banner' | 'crown' {
    const steps = this.steps();
    return steps[Math.min(this.step, steps.length - 1)];
  }

  private rank(): number {
    return kingRank(getDynasty().level);
  }

  private look(): HeroLook {
    return buildKingLook(this.choice, this.rank());
  }

  private house(): string {
    return ROYAL_HOUSES[this.houseIndex % ROYAL_HOUSES.length].surname;
  }

  private fullName(): string {
    return `${this.house()} ${this.givenName}`;
  }

  title(): string {
    if (this.grid) return t(GRID_TITLE[this.grid]);
    switch (this.current()) {
      case 'name': return t('coronation.name.title');
      case 'banner': return t('coronation.banner.title');
      case 'crown': return t('coronation.crown.title');
      default: return this.host.mode === 'temple' ? t('coronation.temple') : t('coronation.title');
    }
  }

  subtitle(): string {
    if (this.grid) return t('coronation.pick.subtitle');
    switch (this.current()) {
      case 'name': return t('coronation.name.subtitle');
      case 'banner': return t('coronation.banner.subtitle', { house: t('coronation.house', { name: this.house() }) });
      case 'crown': return t('coronation.crown.subtitle', {
        name: this.fullName(),
        house: t('coronation.house', { name: this.house() }),
      });
      default: return this.host.mode === 'temple'
        ? t('coronation.temple.note')
        : t('coronation.subtitle');
    }
  }

  /**
   * The pinned foot for this step.
   *
   * Shaped for `promptFoot`, which the mode's every other sheet already uses: a way back on the
   * left and the way on at the right. On the first step of the rite the "way back" is Skip —
   * there is nothing behind it, and a first-open screen with no exit is a screen that costs the
   * run it exists to serve.
   */
  foot(): { back?: { label: string; onTap: () => void }; close: { label: string; onTap: () => void } } {
    if (this.grid) {
      // One control, and it is the way out. Choosing closes the grid by itself — a picker that
      // asks for a second tap to confirm what was just tapped is a dialog, not a wardrobe.
      return {
        close: {
          label: t('coronation.pick.done'),
          onTap: () => { this.grid = undefined; this.host.redraw(); },
        },
      };
    }
    const steps = this.steps();
    const last = this.step >= steps.length - 1;
    const close = {
      label: last ? this.confirmLabel() : this.nextLabel(),
      onTap: () => {
        if (!last) {
          this.step += 1;
          this.host.redraw();
          return;
        }
        this.host.finish(this.founder());
      },
    };
    if (this.step > 0) {
      return { back: { label: this.backLabel(), onTap: () => { this.step -= 1; this.host.redraw(); } }, close };
    }
    if (this.host.mode === 'temple') {
      // Not "Back": the page already has a back bar at its foot, and two controls with the same
      // word on them doing different things is worse than either alone. This one discards.
      return { back: { label: t('coronation.temple.discard'), onTap: () => this.host.cancel?.() }, close };
    }
    return { back: { label: t('coronation.skip'), onTap: () => this.host.skip?.() }, close };
  }

  private confirmLabel(): string {
    return this.host.mode === 'temple' ? t('coronation.temple.save') : t('coronation.confirm');
  }

  private nextLabel(): string {
    const next = this.steps()[this.step + 1];
    if (next === 'name') return t('coronation.next.name');
    if (next === 'banner') return t('coronation.next.banner');
    return t('coronation.next.crown');
  }

  private backLabel(): string {
    const previous = this.steps()[this.step - 1];
    if (previous === 'king') return t('coronation.back.king');
    if (previous === 'name') return t('coronation.back.name');
    return t('coronation.back.banner');
  }

  /** The record this sheet has assembled. */
  founder(): DynastyFounder {
    return makeFounder({
      choice: this.choice,
      house: ROYAL_HOUSES[this.houseIndex % ROYAL_HOUSES.length],
      givenName: this.givenName,
      banner: this.banner,
      level: getDynasty().level,
    });
  }

  // -- drawing ---------------------------------------------------------------
  /** Draws the current step into `body`, and returns the height it used. */
  draw(body: Phaser.GameObjects.Container, width: number): number {
    if (this.grid) return this.drawGrid(body, width, this.grid);
    switch (this.current()) {
      case 'name': return this.drawName(body, width);
      case 'banner': return this.drawBanner(body, width);
      case 'crown': return this.drawCrown(body, width);
      default: return this.drawKing(body, width);
    }
  }

  private drawKing(body: Phaser.GameObjects.Container, width: number): number {
    const scene = this.host.scene;
    let y = this.drawPortrait(body, width, 0, 132);
    y = this.drawCaption(body, width, y);

    y = this.chipRow(body, width, y, t('coronation.field.sex'), [
      { label: t('coronation.sex.woman'), on: this.choice.sex === 'woman', tap: () => this.setSex('woman') },
      { label: t('coronation.sex.man'), on: this.choice.sex === 'man', tap: () => this.setSex('man') },
    ]);
    y = this.chipRow(body, width, y, t('coronation.field.age'), (['young', 'prime', 'elder'] as const)
      .map((age) => ({
        label: t(`coronation.age.${age}` as Parameters<typeof t>[0]),
        on: this.choice.age === age,
        tap: () => { this.choice.age = age; this.host.redraw(); },
      })));
    y = this.chipRow(body, width, y, t('coronation.field.court'), KING_ERAS.map((era) => ({
      label: eraLabelFor(era),
      on: this.choice.era === era,
      tap: () => { this.choice.era = era; this.host.redraw(); },
    })), { compact: true });
    body.add(scene.add.text(0, y, t('coronation.identityNote'), {
      color: INK_UI_HEX.mutedText, fontFamily: UI_FONT, fontSize: '9px', wordWrap: { width },
    }).setFixedSize(width, 0));
    y += 22;

    const warLocked = warRegisterLocked();
    y = this.chipRow(body, width, y, t('coronation.field.register'), [
      {
        label: t('coronation.register.court'),
        on: this.choice.register === 'court',
        tap: () => { this.choice.register = 'court'; this.host.redraw(); },
      },
      {
        label: warLocked ? `🔒 ${t('coronation.register.war')}` : t('coronation.register.war'),
        on: this.choice.register === 'war' && !warLocked,
        muted: warLocked,
        tap: () => {
          if (warLocked) return;
          this.choice.register = 'war';
          this.host.redraw();
        },
      },
    ]);
    if (warLocked) y = this.lockRow(body, width, y, t('coronation.lock.war'), t('coronation.lock.war.how'));

    const rank = this.rank();
    const hats = kingHatPool(this.choice, rank);
    y = this.stepper(body, width, y, t('coronation.field.headwear'),
      hatLabel(kingHat(this.choice, rank)),
      t('coronation.of', { n: this.at('hat') + 1, total: hats.length }),
      (delta) => { this.choice.hat += delta; this.host.redraw(); },
      { open: 'hat' });

    const hair = kingHairPool(this.choice, kingHat(this.choice, rank));
    y = this.stepper(body, width, y, t('coronation.field.hair'),
      t('coronation.of', { n: this.at('hair') + 1, total: hair.length }), '',
      (delta) => { this.choice.hair += delta; this.host.redraw(); },
      { open: 'hair' });

    y = this.stepper(body, width, y, t('coronation.field.face'),
      t('coronation.faceCount', { n: this.at('face') + 1, total: KING_FACE_COUNT }), '',
      (delta) => { this.choice.face += delta; this.host.redraw(); },
      { open: 'face' });

    const beards = kingBeardPool(this.choice);
    if (beards.length > 1) {
      y = this.stepper(body, width, y, t('coronation.field.beard'),
        t('coronation.of', { n: this.at('beard') + 1, total: beards.length }), '',
        (delta) => { this.choice.beard += delta; this.host.redraw(); },
        { open: 'beard' });
    }

    y = this.stepper(body, width, y, t('coronation.field.dress'),
      dressLabel(kingGarments(this.choice, rank)),
      t('coronation.of', { n: this.at('dress') + 1, total: KING_DRESS_COUNT }),
      (delta) => { this.choice.dress += delta; this.host.redraw(); },
      { open: 'dress' });

    y = this.swatchRow(body, width, y, t('coronation.field.skin'), SKINS, this.choice.skin,
      (index) => { this.choice.skin = index; this.host.redraw(); });
    y = this.swatchRow(body, width, y, t('coronation.field.hairColour'), HAIRS, this.choice.hairColour,
      (index) => { this.choice.hairColour = index; this.host.redraw(); });
    y = this.swatchRow(body, width, y, t('coronation.field.robe'), KING_ROBES, this.choice.robe,
      (index) => { this.choice.robe = index; this.host.redraw(); });

    if (jadeLocked()) y = this.lockRow(body, width, y, t('coronation.lock.jade'), t('coronation.lock.jade.how'));

    body.add(this.host.ui.button({ x: 0, y, width, height: 34 }, t('coronation.roll'), () => {
      this.choice = rollKingChoice();
      this.host.redraw();
    }, { variant: 'ghost', fontSize: '11px' }));
    return y + 34 + 8;
  }

  private setSex(sex: 'man' | 'woman'): void {
    if (this.choice.sex === sex) return;
    this.choice.sex = sex;
    // The given name carries the tên đệm, which is the strongest gender marker a Vietnamese name
    // has — Văn is a man's and Thị a woman's. Left alone, changing the founder's sex leaves the
    // other marker contradicting it, which reads as a bug in the name generator rather than as a
    // choice. Re-rolled here, and the player may still page it.
    this.givenName = rollGivenName(sex);
    this.host.redraw();
  }

  private drawName(body: Phaser.GameObjects.Container, width: number): number {
    const scene = this.host.scene;
    let y = this.drawPortrait(body, width, 0, 100);
    y = this.stepper(body, width, y, t('coronation.ho'), this.house(),
      t('coronation.of', { n: (this.houseIndex % ROYAL_HOUSES.length) + 1, total: ROYAL_HOUSES.length }),
      (delta) => {
        this.houseIndex = (this.houseIndex + delta + ROYAL_HOUSES.length * 4) % ROYAL_HOUSES.length;
        // The banner opens on the dynasty's own historical field. Adjustable on the next step,
        // but a Lê house whose banner opens crimson has been given a default that argues with it.
        this.banner = { ...this.banner, field: ROYAL_HOUSES[this.houseIndex].field };
        this.host.redraw();
      });
    y = this.stepper(body, width, y, t('coronation.given'), this.givenName, '',
      () => { this.givenName = rollGivenName(this.choice.sex); this.host.redraw(); },
      { rollOnly: true });

    const panel = this.host.ui.panel({ x: 0, y, width, height: 62 },
      { border: INK_UI.gold, fillAlpha: 0.5 });
    body.add(panel);
    body.add(this.host.ui.label(width / 2, y + 8, this.fullName(), 'label',
      { fontSize: '17px', align: 'center' }).setOrigin(0.5, 0));
    body.add(this.host.ui.label(width / 2, y + 34, t('coronation.house', { name: this.house() }), 'caption',
      { fontSize: '11.5px', align: 'center' }).setOrigin(0.5, 0));
    y += 62 + ROW_GAP;

    body.add(scene.add.text(0, y, t('coronation.nameNote'), {
      color: INK_UI_HEX.mutedText, fontFamily: UI_FONT, fontSize: '9.5px', align: 'center',
      wordWrap: { width },
    }).setFixedSize(width, 0));
    return y + 34;
  }

  private drawBanner(body: Phaser.GameObjects.Container, width: number): number {
    const scene = this.host.scene;
    let y = 4;
    const mark = drawHouseBanner(scene, this.banner, 64, 84);
    mark.setPosition((width - 64) / 2, y);
    body.add(mark);
    y += 92;

    y = this.swatchRow(body, width, y, t('coronation.banner.field'), FIELD_COLOURS,
      FIELD_COLOURS.indexOf(this.banner.field),
      (index) => { this.banner = { ...this.banner, field: FIELD_COLOURS[index] }; this.host.redraw(); });
    y = this.swatchRow(body, width, y, t('coronation.banner.trim'), BANNER_TRIMS,
      BANNER_TRIMS.indexOf(this.banner.trim),
      (index) => { this.banner = { ...this.banner, trim: BANNER_TRIMS[index] }; this.host.redraw(); });

    y = this.chipRow(body, width, y, t('coronation.banner.emblem'), BANNER_EMBLEMS.map((emblem) => {
      const locked = emblemLocked(emblem);
      return {
        label: locked ? '🔒' : '',
        icon: locked ? undefined : emblemIcon(emblem),
        on: this.banner.emblem === emblem && !locked,
        muted: locked,
        tap: () => {
          if (locked) return;
          this.banner = { ...this.banner, emblem };
          this.host.redraw();
        },
      };
    }), { compact: true });

    for (const emblem of BANNER_EMBLEMS) {
      if (!emblemLocked(emblem)) continue;
      y = this.lockRow(body, width, y, t(`coronation.emblem.${emblem}` as Parameters<typeof t>[0]),
        emblem === 'branch' ? t('coronation.lock.emblem.empires') : t('coronation.lock.emblem.mandate'));
    }

    const armyEra = ROYAL_HOUSES[this.houseIndex % ROYAL_HOUSES.length].armyEra;
    body.add(scene.add.text(0, y, t('coronation.armyNote', {
      house: t('coronation.house', { name: this.house() }),
      era: eraLabelFor(armyEra),
    }), {
      color: INK_UI_HEX.mutedText, fontFamily: UI_FONT, fontSize: '9.5px', wordWrap: { width },
    }).setFixedSize(width, 0));
    y += 32;
    body.add(scene.add.text(0, y, t('coronation.banner.where'), {
      color: INK_UI_HEX.mutedText, fontFamily: UI_FONT, fontSize: '9px', wordWrap: { width },
    }).setFixedSize(width, 0));
    return y + 32;
  }

  private drawCrown(body: Phaser.GameObjects.Container, width: number): number {
    const scene = this.host.scene;
    const store = getDynasty();
    let y = this.drawPortrait(body, width, 0, 138);

    const mark = drawHouseBanner(scene, this.banner, 40, 54);
    mark.setPosition(width - 48, 6);
    body.add(mark);

    const rarity = dynastyRankRarity(store.level);
    body.add(this.host.ui.label(width / 2, y, t('coronation.grows.rank', {
      rank: t(`coronation.rank.${rarity}` as Parameters<typeof t>[0]),
      level: store.level,
    }), 'caption', { fontSize: '10px', align: 'center' }).setOrigin(0.5, 0));
    y += 20;

    const grows = scene.add.text(10, 0, t('coronation.grows.body'), {
      color: INK_UI_HEX.mutedText, fontFamily: UI_FONT, fontSize: '10px', wordWrap: { width: width - 20 },
    }).setFixedSize(width - 20, 0);
    const head = this.host.ui.label(10, 0, t('coronation.grows.title'), 'label', { fontSize: '12px' });
    const boxHeight = 10 + head.height + 4 + grows.height + 10;
    body.add(this.host.ui.panel({ x: 0, y, width, height: boxHeight },
      { border: INK_UI.gold, fillAlpha: 0.5 }));
    head.setPosition(10, y + 10);
    grows.setPosition(10, y + 10 + head.height + 4);
    body.add(head);
    body.add(grows);
    y += boxHeight + ROW_GAP;

    y = this.drawLadder(body, width, y, store.level);

    body.add(scene.add.text(0, y, t('coronation.follows'), {
      color: INK_UI_HEX.mutedText, fontFamily: UI_FONT, fontSize: '9.5px', wordWrap: { width },
    }).setFixedSize(width, 0));
    y += 30;
    body.add(scene.add.text(0, y, t('coronation.temple.note'), {
      color: INK_UI_HEX.mutedText, fontFamily: UI_FONT, fontSize: '9px', wordWrap: { width },
    }).setFixedSize(width, 0));
    return y + 30;
  }

  /**
   * The meta, taught in one image: the same king, four times, at the four ranks the house climbs.
   *
   * This is the crown step's whole argument and the reason the rite is worth a screen at all. A
   * sentence saying "the badge steps Common to Legendary" is a claim; four portraits of the face
   * the player just made, the plate darkening and the rank seal appearing under it, is the thing
   * itself. The rank the house stands at now is ringed, so the ladder reads as a position rather
   * than as an advertisement.
   *
   * Costs four look builds and four un-cached bakes, once, on a confirmation screen.
   */
  private drawLadder(
    body: Phaser.GameObjects.Container,
    width: number,
    y: number,
    level: number,
  ): number {
    const gap = 6;
    const cell = Math.floor((width - gap * 3) / 4);
    const portrait = Math.min(cell, 74);
    const rarities = ['Common', 'Rare', 'Epic', 'Legendary'] as const;
    const here = kingRank(level);
    rarities.forEach((rarity, rank) => {
      const x = rank * (cell + gap);
      const box = { x: x + (cell - portrait) / 2, y, width: portrait, height: portrait * 1.24 };
      body.add(this.host.ui.panel({ x, y, width: cell, height: portrait * 1.24 + 16 }, {
        border: rank === here ? INK_UI.gold : INK_UI.softBrush,
        borderWidth: rank === here ? 2 : 1,
        fillAlpha: rank === here ? 0.6 : 0.3,
        muted: rank !== here,
      }));
      body.add(renderLookInBox(this.host.scene, buildKingLook(this.choice, rank), box, 0.62));
      // The rung the house stands on is named in ink, the rest in the quiet colour. The frame
      // alone could not carry it: the Legendary portrait's own cartouche is drawn heavier and in
      // cinnabar, so a heavier frame on the current cell reads as a second legendary.
      body.add(this.host.ui.label(x, y + portrait * 1.24 + 1,
        t(`coronation.rank.${rarity}` as Parameters<typeof t>[0]),
        rank === here ? 'label' : 'caption',
        { fontSize: '8px', align: 'center' }).setFixedSize(cell, 0));
    });
    return y + Math.round(portrait * 1.24) + 16 + ROW_GAP;
  }

  /** Where a field's index currently sits inside its own pool. */
  private at(field: GridField): number {
    const total = this.poolSize(field);
    return ((this.choice[field] % total) + total) % total;
  }

  private poolSize(field: GridField): number {
    const rank = this.rank();
    if (field === 'hat') return kingHatPool(this.choice, rank).length;
    if (field === 'hair') return kingHairPool(this.choice, kingHat(this.choice, rank)).length;
    if (field === 'beard') return kingBeardPool(this.choice).length;
    if (field === 'dress') return KING_DRESS_COUNT;
    return KING_FACE_COUNT;
  }

  /**
   * Every option for one field, each drawn as the king actually wearing it.
   *
   * The previews are the point. A wardrobe named in a list is a list of words a player has to
   * already know — mũ bình đính and mũ tam sơn mean nothing to most of the people this game is
   * for — and the whole argument for a creator is that the player recognises what they made.
   *
   * Costs one look build and one un-cached composition per cell, on a screen that is opened by
   * a tap and holds still afterwards. The largest grid is the twenty-four faces; the rest are
   * five to ten. Nothing here runs per frame.
   */
  private drawGrid(body: Phaser.GameObjects.Container, width: number, field: GridField): number {
    const scene = this.host.scene;
    const rank = this.rank();
    const total = this.poolSize(field);
    const here = this.at(field);
    const columns = 3;
    const gap = 6;
    const cell = Math.floor((width - gap * (columns - 1)) / columns);
    const portrait = Math.min(cell - 8, 96);
    const labelRoom = 22;
    const cellHeight = Math.round(portrait * 1.22) + labelRoom;

    let y = 0;
    for (let index = 0; index < total; index += 1) {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const x = column * (cell + gap);
      const top = row * (cellHeight + gap);
      const option: KingChoice = { ...this.choice, [field]: index };
      const chosen = index === here;
      body.add(this.host.ui.panel({ x, y: top, width: cell, height: cellHeight }, {
        border: chosen ? INK_UI.cinnabar : INK_UI.softBrush,
        borderWidth: chosen ? 2 : 1,
        fillAlpha: chosen ? 0.62 : 0.34,
      }));
      body.add(renderLookInBox(scene, buildKingLook(option, rank), {
        x: x + (cell - portrait) / 2, y: top + 3, width: portrait, height: Math.round(portrait * 1.16),
      }, 0.8));
      body.add(this.host.ui.label(x + 3, top + cellHeight - labelRoom + 2,
        this.optionLabel(field, option, index, rank),
        chosen ? 'label' : 'caption',
        { fontSize: '8px', align: 'center', wordWrap: { width: cell - 6 } }).setFixedSize(cell - 6, 0));

      const zone = scene.add.zone(x, top, cell, cellHeight).setOrigin(0, 0)
        .setInteractive({ useHandCursor: true });
      zone.on('pointerup', (pointer: Phaser.Input.Pointer) => {
        if (scrollGestureConsumedTap(pointer)) return;
        this.choice[field] = index;
        this.grid = undefined;
        this.host.redraw();
      });
      body.add(zone);
      y = top + cellHeight;
    }
    return y + 12;
  }

  /** What a cell is called. Named where the wardrobe has a name for it, numbered where it does not. */
  private optionLabel(field: GridField, option: KingChoice, index: number, rank: number): string {
    if (field === 'hat') return hatLabel(kingHat(option, rank));
    if (field === 'dress') return dressLabel(kingGarments(option, rank));
    if (field === 'beard') return t('coronation.of', { n: index + 1, total: this.poolSize(field) });
    return t('coronation.of', { n: index + 1, total: this.poolSize(field) });
  }

  // -- widgets ---------------------------------------------------------------
  private drawPortrait(body: Phaser.GameObjects.Container, width: number, y: number, height: number): number {
    const box = { x: (width - height * 0.82) / 2, y: y + 4, width: height * 0.82, height };
    body.add(this.host.ui.panel(box, { border: INK_UI.gold, fillAlpha: 0.42 }));
    // Composed fresh every draw rather than through the baked cache: the cache is keyed on a
    // hero's identity, and every tap here produces a different king under the same identity.
    // One build per tap is a tap's worth of work, not a frame's.
    body.add(renderLookInBox(this.host.scene, this.look(), box, 1));
    return y + height + 10;
  }

  private drawCaption(body: Phaser.GameObjects.Container, width: number, y: number): number {
    const rank = this.rank();
    const line = [hatLabel(kingHat(this.choice, rank)), dressLabel(kingGarments(this.choice, rank))]
      .filter(Boolean).join(' · ');
    const text = this.host.scene.add.text(0, y, line, {
      color: INK_UI_HEX.inkText, fontFamily: UI_FONT, fontSize: '10.5px', align: 'center',
      wordWrap: { width },
    }).setFixedSize(width, 0);
    body.add(text);
    return y + text.height + ROW_GAP;
  }

  /**
   * A labelled stepper: back, the value, forward.
   *
   * Built from zones on `pointerup` with the scroll guard rather than from `InkUI.button`, which
   * acts on `pointerdown`: this sheet is long enough to scroll, and a button that fires on press
   * turns every flick down the page into a change to the king's face.
   */
  private stepper(
    body: Phaser.GameObjects.Container,
    width: number,
    y: number,
    label: string,
    value: string,
    note: string,
    onStep: (delta: number) => void,
    opts: { rollOnly?: boolean; open?: GridField } = {},
  ): number {
    const scene = this.host.scene;
    body.add(this.host.ui.panel({ x: 0, y, width, height: STEP_ROW_H },
      { border: INK_UI.softBrush, fillAlpha: 0.42 }));
    const arrowWidth = 30;
    const inner = width - arrowWidth * 2;

    body.add(this.host.ui.label(arrowWidth, y + 4, label, 'caption',
      { fontSize: '8.5px', align: 'center' }).setFixedSize(inner, 0));
    body.add(this.host.ui.label(arrowWidth, y + 15, note ? `${value}  ·  ${note}` : value, 'label',
      { fontSize: '10.5px', align: 'center' }).setFixedSize(inner, 0));

    // **The middle of the row opens the whole wardrobe.**
    //
    // Arrows alone make a five-hat pool a guessing game: the player cannot see what is on the
    // other side of the tap, so choosing a hat means walking the ring and remembering. The grid
    // shows every option as the king wearing it, which is the only honest way to choose a face.
    // The arrows stay for the nudge — one more, one back — and the row says so.
    if (opts.open) {
      const field = opts.open;
      body.add(this.host.ui.label(width - arrowWidth - 26, y + 22, t('coronation.pick.all'), 'caption',
        { fontSize: '7.5px', align: 'right' }).setFixedSize(24, 0));
      const zone = scene.add.zone(arrowWidth, y, inner, STEP_ROW_H).setOrigin(0, 0)
        .setInteractive({ useHandCursor: true });
      zone.on('pointerup', (pointer: Phaser.Input.Pointer) => {
        if (scrollGestureConsumedTap(pointer)) return;
        this.grid = field;
        this.host.redraw();
      });
      body.add(zone);
    }

    const arrow = (x: number, glyph: string, delta: number): void => {
      body.add(scene.add.text(x, y + 9, glyph, {
        color: INK_UI_HEX.inkText, fontFamily: UI_FONT, fontSize: '15px', align: 'center',
      }).setFixedSize(arrowWidth, 0));
      const zone = scene.add.zone(x, y, arrowWidth, STEP_ROW_H).setOrigin(0, 0)
        .setInteractive({ useHandCursor: true });
      zone.on('pointerup', (pointer: Phaser.Input.Pointer) => {
        if (scrollGestureConsumedTap(pointer)) return;
        onStep(delta);
      });
      body.add(zone);
    };
    if (opts.rollOnly) {
      arrow(width - arrowWidth, '↻', 1);
    } else {
      arrow(0, '‹', -1);
      arrow(width - arrowWidth, '›', 1);
    }
    return y + STEP_ROW_H + ROW_GAP;
  }

  private chipRow(
    body: Phaser.GameObjects.Container,
    width: number,
    y: number,
    label: string,
    chips: Array<{ label: string; on: boolean; muted?: boolean; icon?: CardIconId; tap: () => void }>,
    opts: { compact?: boolean } = {},
  ): number {
    const scene = this.host.scene;
    // 74, measured against the longest label on the sheet: "Nguoi mo nghiep" runs about 70 units
    // at 8.5px, and at the 58 this started on it was clipped mid-word - the one Vietnamese string
    // on the page that has to be read to know what the two chips beside it mean.
    const labelWidth = 74;
    body.add(this.host.ui.label(0, y + 8, label, 'caption',
      { fontSize: '8.5px', wordWrap: { width: labelWidth - 4 } }));
    const room = width - labelWidth;
    const gap = 4;
    const chipWidth = Math.floor((room - gap * (chips.length - 1)) / chips.length);
    chips.forEach((chip, index) => {
      const x = labelWidth + index * (chipWidth + gap);
      const bounds = { x, y, width: chipWidth, height: CHIP_ROW_H - 3 };
      body.add(this.host.ui.crayonTile(bounds, { selected: chip.on }));
      if (chip.icon) {
        // Emblems are drawn, not typed: the glyph vocabulary is `CardIcons`, and a CJK or
        // dingbat stand-in for one is a tofu box on any device without that face installed.
        const glyph = drawCardIcon(scene, chip.icon,
          chip.muted ? INK_UI.softBrush : chip.on ? INK_UI.cinnabar : INK_UI.brush);
        glyph.setPosition(x + chipWidth / 2, y + (CHIP_ROW_H - 3) / 2);
        glyph.setScale(Math.min(0.72, (chipWidth - 8) / CARD_ICON_SIZE));
        body.add(glyph);
      }
      body.add(this.host.ui.label(x, y + 6, chip.label, 'button', {
        // 8.5 rather than 9.5: six court chips share 270 units, and the longest of them overran
        // its tile at the larger size. A chip whose name spills past its own outline reads broken.
        fontSize: opts.compact ? '8.5px' : '10.5px',
        align: 'center',
        color: chip.muted ? INK_UI_HEX.mutedText : chip.on ? INK_UI_HEX.inkText : INK_UI_HEX.mutedText,
      }).setFixedSize(chipWidth, 0));
      const zone = scene.add.zone(x, y, chipWidth, CHIP_ROW_H - 3).setOrigin(0, 0)
        .setInteractive({ useHandCursor: true });
      zone.on('pointerup', (pointer: Phaser.Input.Pointer) => {
        if (scrollGestureConsumedTap(pointer)) return;
        chip.tap();
      });
      body.add(zone);
    });
    return y + CHIP_ROW_H + ROW_GAP - 3;
  }

  private swatchRow(
    body: Phaser.GameObjects.Container,
    width: number,
    y: number,
    label: string,
    colours: readonly number[],
    selected: number,
    onPick: (index: number) => void,
  ): number {
    const scene = this.host.scene;
    body.add(this.host.ui.label(0, y + 5, label, 'caption', { fontSize: '9px' }));
    const labelWidth = 58;
    const gap = 6;
    const size = Math.min(22, Math.floor((width - labelWidth - gap * (colours.length - 1)) / colours.length));
    colours.forEach((colour, index) => {
      const x = labelWidth + index * (size + gap);
      const g = scene.add.graphics();
      g.fillStyle(colour, 1);
      g.fillRoundedRect(x, y, size, size, 4);
      g.lineStyle(index === ((selected % colours.length) + colours.length) % colours.length ? 2.4 : 1,
        INK_UI.brush, 0.9);
      g.strokeRoundedRect(x, y, size, size, 4);
      body.add(g);
      const zone = scene.add.zone(x - 2, y - 2, size + 4, size + 4).setOrigin(0, 0)
        .setInteractive({ useHandCursor: true });
      zone.on('pointerup', (pointer: Phaser.Input.Pointer) => {
        if (scrollGestureConsumedTap(pointer)) return;
        onPick(index);
      });
      body.add(zone);
    });
    return y + SWATCH_ROW_H + ROW_GAP;
  }

  /**
   * A greyed row that says what it is and what opens it.
   *
   * Printed rather than hidden, and this is the whole reason locks belong in a creator: nothing
   * behind one has power, so a lock is a promise rather than a paywall — and each line names a
   * system the player has not met yet, which quietly indexes the game on the first screen of it.
   */
  private lockRow(
    body: Phaser.GameObjects.Container,
    width: number,
    y: number,
    label: string,
    how: string,
  ): number {
    // Measured, not assumed: the earn conditions wrap to two lines in Vietnamese, and a fixed
    // 30-unit plate under a two-line note puts the note on top of the control below it.
    const head = this.host.ui.label(10, 0, `🔒 ${label}`, 'caption',
      { fontSize: '9.5px', wordWrap: { width: width - 20 } });
    const note = this.host.ui.label(10, 0, how, 'caption',
      { fontSize: '8.5px', color: '#8a5f1c', wordWrap: { width: width - 20 } });
    const height = 5 + head.height + 2 + note.height + 5;
    body.add(this.host.ui.panel({ x: 0, y, width, height },
      { border: INK_UI.softBrush, fillAlpha: 0.3, muted: true }));
    head.setPosition(10, y + 5);
    note.setPosition(10, y + 5 + head.height + 2);
    body.add(head);
    body.add(note);
    return y + height + ROW_GAP;
  }
}

/** Fields a banner may fly. The họ's own colour is always among them. */
const FIELD_COLOURS: readonly number[] = KING_ROBES;

/**
 * What a hat is called, by family rather than by key.
 *
 * Forty-odd part keys collapse to about twenty garments, because `hat-phocdau-short` and
 * `hat-phocdau-grand` are one cap whose wings the 1499 regulations lengthened with rank — the
 * player is choosing the cap, and the wings follow the house. Prefix matching keeps the table at
 * twenty lines instead of forty and means a part added to a family needs no new string.
 */
export function hatLabel(key: string): string {
  if (!key || key === 'scalp') return t('coronation.hat.bare');
  if (key === 'scalp-shaven') return t('coronation.hat.shaven');
  const table: Array<[string, Parameters<typeof t>[0]]> = [
    ['hat-phocdau', 'coronation.hat.phocdau'],
    ['hat-dinhtu', 'coronation.hat.dinhtu'],
    ['hat-osa', 'coronation.hat.osa'],
    ['hat-binhdinh', 'coronation.hat.binhdinh'],
    ['hat-tamson', 'coronation.hat.tamson'],
    ['hat-xungthien', 'coronation.hat.xungthien'],
    ['hat-duongcan', 'coronation.hat.duongcan'],
    ['hat-helm', 'coronation.hat.helm'],
    ['hat-khanvan', 'coronation.hat.khanvan'],
    ['hat-khandong', 'coronation.hat.khandong'],
    ['hat-khanxep', 'coronation.hat.khanxep'],
    ['hat-khanvuong', 'coronation.hat.khanvuong'],
    ['hat-non', 'coronation.hat.non'],
    ['hat-moqua', 'coronation.hat.moqua'],
    ['hat-vanhday', 'coronation.hat.vanhday'],
    ['hat-coronet', 'coronation.hat.coronet'],
    ['hat-crown', 'coronation.hat.crown'],
    ['hat-band', 'coronation.hat.band'],
  ];
  for (const [prefix, id] of table) {
    if (key.startsWith(prefix)) return t(id);
  }
  return t('coronation.hat.bare');
}

/** What the garment stack adds up to — the collar names the dress, and the bổ tử qualifies it. */
export function dressLabel(parts: HeroLookPart[]): string {
  const keys = parts.map((part) => part.key);
  const has = (prefix: string): boolean => keys.some((key) => key.startsWith(prefix));
  let name = '';
  if (has('collar-vienlinh')) name = t('coronation.dress.vienlinh');
  else if (has('collar-nguthan')) name = t('coronation.dress.nguthan');
  else if (has('collar-nhatbinh')) name = t('coronation.dress.nhatbinh');
  else if (has('collar-doikham')) name = t('coronation.dress.doikham');
  else if (has('collar-tuthan')) name = t('coronation.dress.tuthan');
  else if (has('collar-twoflap')) name = t('coronation.dress.twoflap');
  else if (has('collar-giaolinh')) name = t('coronation.dress.giaolinh');
  else if (has('collar-yem')) name = t('coronation.dress.yem');
  if (has('robe-armour')) name = name ? `${t('coronation.dress.armour')} · ${name}` : t('coronation.dress.armour');
  if (has('badge-')) name = `${name} · ${t('coronation.dress.badge')}`;
  return name;
}

/**
 * A dynasty's name, for a court chip or an army note.
 *
 * Its own key rather than a reuse of `empire.era.*`: those four are the *mode's* eras — Founding,
 * Rivalry, Empires, Mandate — and these six are centuries of Vietnamese dress. Two different
 * things called "era" in one file is how a Trần chip ends up reading "Age of Rivalry".
 */
export function eraLabelFor(era: HeroEra): string {
  return t(`coronation.era.${era}` as Parameters<typeof t>[0]);
}
