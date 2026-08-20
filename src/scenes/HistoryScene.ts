import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../game/constants';
import { applyRenderScale, designPointer } from '../game/graphicsQuality';
import { heroBio, heroName, heroTypeLabel, t } from '../i18n';
import { historyText } from '../i18n/history';
import { storyCatalogIds, storyTitle } from '../i18n/story';
import type { EraRule } from '../data/history';
import {
  FIGURE_DATES,
  FIGURE_ERA_OVERRIDE,
  figureYear,
  GLOSSARY_TERMS,
  HISTORY_ERAS,
  STORY_ANCHORS,
} from '../data/history';
import { heroTemplates } from '../data/heroes';
import { REAL_FIGURES } from '../data/heroNames';
import type { Hero } from '../state/types';
import { InkUI, INK_UI, type InkScrollArea } from '../ui/InkUI';
import { scrollGestureConsumedTap } from '../ui/InkUI';
import { createMapRenderer, type MapRenderer } from '../ui/MapRenderer';
import { renderHeroFaceInBox } from '../ui/FaceRenderer';
import { applyPaperFX } from '../ui/ink/PaperFX';
import { inkPath } from '../ui/ink/stroke';
import { RULE_COLOUR } from '../ui/ink/eraRule';
import { TITLE_FONT, UI_FONT } from '../ui/fonts';

type HistoryTab = 'dynasties' | 'figures' | 'stories' | 'terms';

const TABS: readonly HistoryTab[] = ['dynasties', 'figures', 'stories', 'terms'];

const SIDE = 12;
const LIST_WIDTH = GAME_WIDTH - SIDE * 2;
const CARD_GAP = 8;
/** Where the scrolling list starts: under the title, the subtitle and the tab strip. */
const LIST_TOP = 108;
const PORTRAIT = 46;
/** The Dynasties timeline: the rail's own x, and where the cards start to the right of it. */
const RAIL_X = 14;
const TIMELINE_X = 30;
/** Header and tabs sit above the list, so they win the tap. See `chrome`. */
const CHROME_DEPTH = 5;

/**
 * The real record behind the game, as four lists you can read.
 *
 * A scene rather than another `mode` on `MenuScene`: this is four sections with a scrolling list
 * and an expanding detail, and the menu is already the longest file in `scenes/` without carrying
 * a scroll surface anywhere in it.
 *
 * Almost none of the text here is new. The champions' biographies, the story titles and the ruler
 * capsules are the ones the game already prints elsewhere; what this scene adds is the ordering,
 * the dates, and one paragraph per entry saying what we changed. Nothing on this page is allowed
 * to blur those two apart — every entry that has an opinion labels it as ours.
 */
export class HistoryScene extends Phaser.Scene {
  private ui!: InkUI;
  private mapRenderer!: MapRenderer;
  private tab: HistoryTab = 'dynasties';
  /** The one open accordion row, by a key unique across every tab. */
  private expanded?: string;
  private content: Phaser.GameObjects.GameObject[] = [];
  /**
   * Held separately because a scroll area is not a GameObject: it hangs four handlers off the
   * scene's own pointer stream and has to be told to let go of them. Destroying the objects it
   * drew would leave those behind, and the next list would scroll two lists at once.
   */
  private scroll?: InkScrollArea;
  /**
   * Where the list should stand after the next re-render.
   *
   * Opening an entry rebuilds the whole list, and a rebuilt scroll area starts at the top — so
   * tapping the fortieth champion answered by throwing the reader back to the first. Carrying the
   * offset across keeps the row you touched under the finger that touched it. A tab change sets it
   * to zero on purpose: that IS a new list.
   */
  private pendingScroll = 0;

  constructor() {
    super('HistoryScene');
  }

  create(): void {
    applyRenderScale(this);
    applyPaperFX(this);
    this.ui = new InkUI(this);
    this.mapRenderer = createMapRenderer(this);
    // The sheet, and nothing else. The menu's diorama is a fine thing to arrive at and a poor
    // thing to read a page of prose over.
    this.mapRenderer.drawBackground(GAME_WIDTH, GAME_HEIGHT).setDepth(-10);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.clear());
    this.render();
  }

  private render(): void {
    this.clear();
    this.renderHeader();
    this.renderTabs();
    this.renderList();
  }

  /**
   * Registers a piece of page chrome above the list.
   *
   * The depth is load-bearing, not decoration. Rows scrolled off the top of the list keep live hit
   * rectangles sitting under the header — a geometry mask hides pixels, not hit areas — and with
   * `input.topOnly` on, whichever object is on top takes the event and nothing else sees it. Sat at
   * the same depth as the list, the header lost: pressing Back after a scroll did nothing at all,
   * because a card nobody could see had already claimed the tap.
   */
  private chrome<T extends Phaser.GameObjects.GameObject & { setDepth(value: number): T }>(object: T): T {
    this.content.push(object.setDepth(CHROME_DEPTH));
    return object;
  }

  private renderHeader(): void {
    this.chrome(this.ui.button({ x: SIDE, y: 10, width: 64, height: 28 }, t('history.back'), () => {
      this.scene.start('MenuScene');
    }, { variant: 'ghost', fontSize: '12px' }));

    this.chrome(this.add.text(GAME_WIDTH / 2, 14, t('history.title'), {
      color: '#2a2118',
      fontFamily: TITLE_FONT,
      fontSize: '19px',
      fontStyle: '700',
    }).setOrigin(0.5, 0));

    this.chrome(this.add.text(GAME_WIDTH / 2, 44, t('history.subtitle'), {
      color: '#6b5230',
      fontFamily: UI_FONT,
      fontSize: '11px',
      align: 'center',
      wordWrap: { width: LIST_WIDTH - 20 },
    }).setOrigin(0.5, 0));
  }

  private renderTabs(): void {
    // Four across a 390 sheet leaves 88 apiece. The labels are one word in both languages for
    // exactly this reason — "Dynasties / Triều đại" fits, "Historical figures" would not.
    const width = Math.floor((LIST_WIDTH - 3 * 4) / 4);
    TABS.forEach((tab, index) => {
      this.chrome(this.ui.button(
        { x: SIDE + index * (width + 4), y: 70, width, height: 28 },
        t(`history.tab.${tab}` as 'history.tab.dynasties'),
        () => {
          if (this.tab === tab) {
            return;
          }
          this.tab = tab;
          this.pendingScroll = 0;
          // A new list starts at the top and with nothing open. Carrying an expansion across tabs
          // means opening one and finding a different page already scrolled into its middle.
          this.expanded = undefined;
          this.render();
        },
        { variant: this.tab === tab ? 'secondary' : 'ghost', fontSize: '11px' },
      ));
    });
  }

  /** The list window: everything under the tab strip, less a hair of margin at the foot. */
  private listHeight(): number {
    return GAME_HEIGHT - LIST_TOP - 10;
  }

  private renderList(): void {
    const height = this.listHeight();
    const scroll = this.ui.scrollArea({ x: SIDE, y: LIST_TOP, width: LIST_WIDTH, height });
    this.scroll = scroll;
    // `addTo` is not optional and is not a convenience: it parents the area's swallow-zone and its
    // content in that order, so the cards sit above the zone. Left at the scene root the zone is
    // created after the container and therefore lands on top of it, and with `input.topOnly` on it
    // eats every tap the list was supposed to receive — the rows render, scroll, and do nothing.
    const layer = this.add.container(0, 0);
    scroll.addTo(layer);
    this.content.push(layer);

    // Every list stacks by each card's OWN reported height. `InkUI.card` grows to fit whatever its
    // body wraps to and the requested height is only a minimum, so a fixed stride would overlap the
    // moment an entry ran to a third line — which in Vietnamese most of them do.
    const used = this.tab === 'dynasties' ? this.buildDynasties(scroll)
      : this.tab === 'figures' ? this.buildFigures(scroll)
      : this.tab === 'stories' ? this.buildStories(scroll)
      : this.buildTerms(scroll);

    scroll.setContentHeight(Math.max(height, used));
    scroll.setScroll(this.pendingScroll);
  }

  // ── The four lists ──

  /**
   * The ages, drawn as a timeline rather than as eleven identical cards.
   *
   * A stack of same-sized boxes says every age was the same size, and they were not: Bắc thuộc ran
   * for a thousand and forty-nine years and Tây Sơn for twenty-four. Card height cannot carry that
   * — it belongs to the prose — so the *rail* does. Each age is a node on one inked line, and the
   * node's area is proportional to how long the age lasted, so a thousand years of northern rule
   * reads as a blot and the Tây Sơn as a full stop. Radius goes as the square root of the span,
   * because the eye reads a disc by its area and not by its width.
   *
   * The rail is drawn last, from the node positions the cards actually landed on, and inserted
   * *behind* them — the alternative is guessing the heights of eleven wrapped paragraphs in
   * advance, which is the same mistake as a fixed stride.
   */
  private buildDynasties(scroll: InkScrollArea): number {
    const width = LIST_WIDTH - 6 - TIMELINE_X;
    const longest = Math.max(...HISTORY_ERAS.map((era) => era.to - era.from));
    const nodes: { y: number; radius: number; rule: EraRule }[] = [];
    let y = this.buildRuleLegend(scroll);

    for (const era of HISTORY_ERAS) {
      const key = `era:${era.id}`;
      const open = this.expanded === key;
      const rulers = era.rulerSlugs
        .map((slug) => this.template(`real-${slug}`))
        .filter((hero): hero is Hero => Boolean(hero));
      const span = era.to - era.from;
      const body = open
        ? [
          historyText(`eras.${era.id}.body`),
          `${t('history.era.inGame')} — ${historyText(`eras.${era.id}.inGame`)}`,
          rulers.length ? rulers.map((hero) => heroName(hero)).join(' · ') : '',
        ].filter(Boolean).join('\n\n')
        : this.clip(historyText(`eras.${era.id}.body`), 92);
      const card = this.ui.card({ x: TIMELINE_X, y, width, height: 62 }, {
        title: historyText(`eras.${era.id}.title`),
        // The length of the age beside its dates, because "111 BC – 938" does not announce itself
        // as ten times "1778 – 1802" until you do the subtraction.
        // The rule is named only when it is not self-rule. Printing "Vietnamese rule" on eight of
        // eleven cards is a word the colour and the legend already carry; printing it on the three
        // that broke is the whole point of having the field.
        subtitle: [
          this.range(era.from, era.to),
          t('history.era.span', { years: span }),
          era.rule === 'self' ? '' : t(`history.rule.${era.rule}` as 'history.rule.self'),
        ].filter(Boolean).join('  ·  '),
        body,
        border: open ? RULE_COLOUR[era.rule] : undefined,
      });
      this.makeTappable(card, key, width);
      scroll.content.add(card);
      if (open) {
        this.revealCard(card);
      }
      nodes.push({
        // Level with the title, not with the middle of a card whose height is set by its prose.
        y: y + 18,
        radius: 3 + 6 * Math.sqrt(span / longest),
        rule: era.rule,
      });
      y += ((card.getData('cardHeight') as number | undefined) ?? 62) + CARD_GAP;
    }

    scroll.content.addAt(this.drawTimelineRail(nodes), 0);
    return y;
  }

  /**
   * The key to the colours, above the first age.
   *
   * A colour that means something and is never explained is decoration that looks like data. Three
   * swatches and three short phrases cost one or two rows and turn the rail into something a reader
   * can actually read.
   *
   * It wraps because it has to: an English phrase pair runs past 390 on one line, and a legend cut
   * off by the edge of the sheet is worse than no legend — the entry that goes missing is exactly
   * the colour that needed explaining.
   */
  private buildRuleLegend(scroll: InkScrollArea): number {
    const swatches = this.add.graphics();
    let x = 2;
    let row = 0;
    for (const rule of ['self', 'foreign'] as const) {
      const label = this.add.text(0, 0, t(`history.rule.${rule}` as 'history.rule.self'), {
        color: '#5a4c39',
        fontFamily: UI_FONT,
        fontSize: '10px',
      }).setOrigin(0, 0);
      if (x > 2 && x + 12 + label.width > LIST_WIDTH - 6) {
        x = 2;
        row += 1;
      }
      const centreY = row * 15 + 7;
      label.setPosition(x + 12, row * 15 + 1);
      swatches.fillStyle(RULE_COLOUR[rule], 0.92);
      swatches.fillCircle(x + 4, centreY, 4);
      scroll.content.add(label);
      x += 12 + label.width + 14;
    }
    scroll.content.add(swatches);
    return (row + 1) * 15 + 8;
  }

  /**
   * The little lift a newly opened entry gets.
   *
   * Opening a row rebuilds the list, so the card that grew is a brand new object appearing where a
   * short one stood — without this it simply blinks into place and the eye has to go and find what
   * changed. Six units and a sixth of a second is enough to say "this one"; anything longer and a
   * reader tapping down a list is waiting on the interface.
   */
  private revealCard(card: Phaser.GameObjects.Container): void {
    const settled = card.y;
    card.setAlpha(0).setY(settled + 6);
    // Tagged rather than inferred: the harness asserts the reveal ran without having to catch a
    // 170ms tween mid-flight, which is the kind of check that passes on a fast machine and fails in
    // CI for no reason anybody can reproduce.
    card.setData('revealed', true);
    this.tweens.add({
      targets: card,
      y: settled,
      alpha: 1,
      duration: 170,
      ease: 'Quad.easeOut',
    });
  }

  /**
   * The line down the ages: one inked segment per era, in that era's own colour.
   *
   * The rail is where "what colour means what" actually pays off. Every segment belongs to the age
   * above it, so a reader scrolling the tab watches the line run cold and stay cold for a thousand
   * years of Bắc thuộc, then turn red at Ngô Quyền and stay red. A `mixed` age is drawn as both:
   * red down to the point where the age lost the country, indigo the rest of the way — the Hồ
   * twenty-seven years in, the Nguyễn from the protectorate.
   */
  private drawTimelineRail(nodes: { y: number; radius: number; rule: EraRule }[]): Phaser.GameObjects.Graphics {
    const rail = this.add.graphics();

    for (let i = 0; i < nodes.length; i += 1) {
      const node = nodes[i];
      const next = nodes[i + 1];
      // The last age has no node below it to run to, so it gets a short tail instead of nothing —
      // a line that stops dead on its final dot reads as truncated rather than as finished.
      const bottom = next ? next.y : node.y + 26;
      if (bottom - node.y >= 1) {
        inkPath(rail, [{ x: RAIL_X, y: node.y }, { x: RAIL_X, y: bottom }], 4157 + i * 31, {
          width: 2.2,
          alpha: 0.72,
          colour: RULE_COLOUR[node.rule],
          wobble: 0.5,
          step: 22,
        });
      }
    }

    for (const node of nodes) {
      // Paper under the node first, so the rail does not show through the disc it passes behind.
      rail.fillStyle(INK_UI.parchment, 1);
      rail.fillCircle(RAIL_X, node.y, node.radius + 1.5);
      rail.fillStyle(RULE_COLOUR[node.rule], 0.92);
      rail.fillCircle(RAIL_X, node.y, node.radius);
      rail.lineStyle(0.9, INK_UI.brush, 0.45);
      rail.strokeCircle(RAIL_X, node.y, node.radius);
    }
    return rail;
  }

  private buildFigures(scroll: InkScrollArea): number {
    let y = 0;
    const grouped = this.figuresByEra();
    for (const era of HISTORY_ERAS) {
      const group = grouped.get(era.id);
      if (!group?.length) {
        continue;
      }
      const heading = this.add.text(2, y, historyText(`eras.${era.id}.title`), {
        color: '#8a5f1c',
        fontFamily: TITLE_FONT,
        fontSize: '13px',
        fontStyle: '700',
      }).setOrigin(0, 0);
      scroll.content.add(heading);
      y += heading.height + 6;

      for (const hero of group) {
        const key = `figure:${hero.id}`;
        const open = this.expanded === key;
        const dates = FIGURE_DATES[hero.id];
        const bio = heroBio(hero);
        const card = this.ui.card({ x: PORTRAIT + 8, y, width: LIST_WIDTH - PORTRAIT - 14, height: PORTRAIT }, {
          title: heroName(hero),
          subtitle: `${heroTypeLabel(hero.type)} · ${dates ? t('history.figures.lived', { dates }) : t('history.figures.unknown')}`,
          body: open ? bio : this.clip(bio),
          border: open ? INK_UI.cinnabar : undefined,
        });
        this.makeTappable(card, key, LIST_WIDTH - PORTRAIT - 14);
        scroll.content.add(card);
        if (open) {
          this.revealCard(card);
        }
        const cardHeight = (card.getData('cardHeight') as number | undefined) ?? PORTRAIT;
        // The portrait rides beside the card rather than inside it, because the card grows with
        // its prose and a face stretched to match would be worse than a face that simply sits at
        // the top of a tall entry.
        scroll.content.add(renderHeroFaceInBox(this, hero, { x: 0, y, width: PORTRAIT, height: PORTRAIT }));
        y += cardHeight + CARD_GAP;
      }
    }

    // The roster names a hundred and twenty-five real people and writes up fifty-one of them. The
    // rest get one closing card rather than fifty-one thin ones: they are listed under no century
    // and no dates because `REAL_FIGURES` carries neither, and a heading invented for them would be
    // the one kind of mistake this page cannot afford. Naming them is still worth doing — a player
    // who met Đặng Dung once should be able to confirm he was real.
    const authored = new Set(heroTemplates.map((hero) => hero.name));
    const rest = REAL_FIGURES.filter((figure) => !authored.has(figure.name)).map((figure) => figure.name);
    if (rest.length) {
      const card = this.ui.card({ x: 0, y, width: LIST_WIDTH - 6, height: 52 }, {
        title: t('history.figures.alsoDrawn'),
        body: `${t('history.figures.alsoDrawnBody', { count: rest.length })}

${rest.join(' · ')}`,
        muted: true,
      });
      scroll.content.add(card);
      y += ((card.getData('cardHeight') as number | undefined) ?? 52) + CARD_GAP;
    }
    return y;
  }

  private buildStories(scroll: InkScrollArea): number {
    let y = 0;
    for (const id of storyCatalogIds) {
      const key = `story:${id}`;
      const open = this.expanded === key;
      const happened = historyText(`stories.${id}.happened`);
      const written = happened !== `stories.${id}.happened`;
      const body = !written
        ? t('history.stories.unwritten')
        : open
          ? `${happened}\n\n${t('history.stories.inGame')} — ${historyText(`stories.${id}.inGame`)}`
          : this.clip(happened);
      const card = this.ui.card({ x: 0, y, width: LIST_WIDTH - 6, height: 58 }, {
        title: storyTitle(id),
        subtitle: STORY_ANCHORS[id] ?? '',
        body,
        border: open ? INK_UI.cinnabar : undefined,
        muted: !written,
      });
      if (written) {
        this.makeTappable(card, key, LIST_WIDTH - 6);
      }
      scroll.content.add(card);
      if (open) {
        this.revealCard(card);
      }
      y += ((card.getData('cardHeight') as number | undefined) ?? 58) + CARD_GAP;
    }
    return y;
  }

  private buildTerms(scroll: InkScrollArea): number {
    let y = 0;
    for (const term of GLOSSARY_TERMS) {
      const key = `term:${term}`;
      const open = this.expanded === key;
      const body = historyText(`terms.${term}.body`);
      const card = this.ui.card({ x: 0, y, width: LIST_WIDTH - 6, height: 52 }, {
        title: historyText(`terms.${term}.title`),
        body: open ? body : this.clip(body),
        border: open ? INK_UI.cinnabar : undefined,
      });
      this.makeTappable(card, key, LIST_WIDTH - 6);
      scroll.content.add(card);
      if (open) {
        this.revealCard(card);
      }
      y += ((card.getData('cardHeight') as number | undefined) ?? 52) + CARD_GAP;
    }
    return y;
  }

  // ── Helpers ──

  private template(id: string): Hero | undefined {
    return heroTemplates.find((hero) => hero.id === id);
  }

  /**
   * The fifty-one real champions, filed under the age each one actually belongs to and sorted
   * inside it by year.
   *
   * Filed by *date*, not by `Hero.era`. That field dresses a portrait and has six buckets against
   * eleven ages, so grouping on it put Trưng Trắc — who died in 43 — under a heading that reads
   * 939–1009, and listed everyone with the Lê wardrobe twice because two ages wear it. On a page
   * whose entire job is being accurate about the record, that was the wrong field to reach for.
   *
   * Anyone with no dates at all falls back to their wardrobe era, which is the best guess the data
   * supports and is never contradicted by a year printed on the same card.
   */
  private figuresByEra(): Map<string, Hero[]> {
    const grouped = new Map<string, Hero[]>();
    const file = (eraId: string, hero: Hero): void => {
      const list = grouped.get(eraId);
      if (list) {
        list.push(hero);
      } else {
        grouped.set(eraId, [hero]);
      }
    };

    for (const hero of heroTemplates) {
      if (!hero.id.startsWith('real-')) {
        continue;
      }
      const override = FIGURE_ERA_OVERRIDE[hero.id];
      if (override) {
        file(override, hero);
        continue;
      }
      const year = figureYear(hero.id);
      const byYear = year === undefined
        ? undefined
        : HISTORY_ERAS.find((era) => year >= era.from && year <= era.to);
      const byWardrobe = HISTORY_ERAS.find((era) => era.heroEra === hero.era);
      const era = byYear ?? byWardrobe;
      if (era) {
        file(era.id, hero);
      }
    }

    for (const list of grouped.values()) {
      list.sort((a, b) => (figureYear(a.id) ?? Number.MAX_SAFE_INTEGER) - (figureYear(b.id) ?? Number.MAX_SAFE_INTEGER));
    }
    return grouped;
  }

  /**
   * A collapsed entry's first sentence and a bit, ended on a whole word.
   *
   * Cutting at a fixed character count mid-word reads as a rendering fault rather than as a
   * summary, which is the same reason the hero panels end on a word boundary too.
   */
  private clip(text: string, limit = 108): string {
    if (text.length <= limit) {
      return text;
    }
    const cut = text.slice(0, limit);
    const lastSpace = cut.lastIndexOf(' ');
    return `${cut.slice(0, lastSpace > 40 ? lastSpace : limit).trimEnd()}…`;
  }

  /** A year range, with BC written the way each language writes it. */
  private range(from: number, to: number): string {
    return t('history.yearRange', { from: this.year(from), to: this.year(to) });
  }

  private year(value: number): string {
    return value < 0 ? t('history.yearBc', { year: -value }) : String(value);
  }

  /**
   * Makes a card open and close on tap.
   *
   * The gesture check is the whole reason this is not just `setInteractive`: a card inside a
   * scrolling list must not fire because the finger happened to lift over it at the end of a drag,
   * and `InkUI.button` already refuses that same gesture for the same reason.
   */
  private makeTappable(card: Phaser.GameObjects.Container, key: string, width: number): void {
    const height = (card.getData('cardHeight') as number | undefined) ?? 48;
    const hit = this.add.rectangle(width / 2, height / 2, width, height, 0xffffff, 0.001)
      .setInteractive({ useHandCursor: true });
    hit.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (scrollGestureConsumedTap(pointer)) {
        return;
      }
      // A geometry mask hides pixels, not hit areas. Once the list has been scrolled, the rows that
      // have gone off the top are still sitting under the header with live hit rectangles on top of
      // it — so Back stopped working, and tapping the bare paper beside it silently opened a row
      // nobody could see. Only a tap that lands inside the list window counts.
      const at = designPointer(pointer);
      if (at.y < LIST_TOP || at.y > LIST_TOP + this.listHeight()) {
        return;
      }
      this.pendingScroll = this.scroll ? -this.scroll.content.y : 0;
      this.expanded = this.expanded === key ? undefined : key;
      this.render();
    });
    card.add(hit);
  }

  private clear(): void {
    this.scroll?.destroy();
    this.scroll = undefined;
    for (const item of this.content) {
      item.destroy();
    }
    this.content = [];
  }
}
