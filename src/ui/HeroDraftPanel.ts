import Phaser from 'phaser';
import { COLORS, GAME_WIDTH } from '../game/constants';
import type { Hero } from '../state/types';
import { makeSwipeableCard, staggerIn } from './animations';
import { SHEET_BOTTOM, SHEET_TOP } from './BottomSheet';
import { renderHeroFace } from './FaceRenderer';
import { heroEffect, heroName, heroTypeLabel, rarityLabel, t } from '../i18n';
import { UI_FONT } from './fonts';

export class HeroDraftPanel {
  private lastFrontHeroId?: string;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly onPick: (heroId: string) => void,
  ) {}

  render(heroes: Hero[]): Phaser.GameObjects.GameObject[] {
    const activeHero = heroes[0];
    const items: Phaser.GameObjects.GameObject[] = [
      this.scene.add.text(GAME_WIDTH / 2, SHEET_TOP + 16, t('modal.heroes.title'), {
        color: COLORS.text,
        fontFamily: UI_FONT,
        fontSize: '17px',
        fontStyle: '700',
      }).setOrigin(0.5),
      this.scene.add.text(GAME_WIDTH / 2, SHEET_TOP + 40, t('modal.heroes.subtitle'), {
        color: '#f5dfaa',
        fontFamily: UI_FONT,
        fontSize: '11px',
      }).setOrigin(0.5),
    ];

    const isNewDraft = activeHero?.id !== this.lastFrontHeroId;
    this.lastFrontHeroId = activeHero?.id;

    const cards: Phaser.GameObjects.Container[] = [];
    let frontCard: Phaser.GameObjects.Container | undefined;
    heroes.slice(0, 3).reverse().forEach((hero, stackIndex) => {
      const realIndex = heroes.indexOf(hero);
      const card = this.createHeroCard(hero, realIndex);
      card.setRotation((realIndex - 1) * 0.032);
      card.setAlpha(realIndex === 0 ? 1 : 0.84);
      card.setScale(1 - realIndex * 0.028);
      card.setY(card.y + realIndex * 7);
      items.push(card);
      cards.push(card);
      if (realIndex === 0) {
        frontCard = card;
      }
    });

    if (isNewDraft) {
      staggerIn(this.scene, cards, { staggerMs: 90, offsetY: -30, duration: 240 });
    }

    if (frontCard && activeHero) {
      makeSwipeableCard(this.scene, frontCard, 326, 154, {
        onSwipeRight: () => this.onPick(activeHero.id),
        onSwipeLeft: () => {},
      });
    }

    const reject = this.scene.add.rectangle(52, SHEET_BOTTOM - 38, 72, 28, 0x56352c, 1).setInteractive({ useHandCursor: true });
    reject.setStrokeStyle(2, 0x9b7860, 0.95);
    const keep = this.scene.add.rectangle(338, SHEET_BOTTOM - 38, 72, 28, 0xffde72, 1).setInteractive({ useHandCursor: true });
    keep.setStrokeStyle(2, 0x9b7860, 0.95);
    keep.on('pointerup', () => activeHero && this.onPick(activeHero.id));
    items.push(
      reject,
      this.scene.add.text(52, SHEET_BOTTOM - 38, t('action.pass'), {
        color: COLORS.text,
        fontFamily: UI_FONT,
        fontSize: '12px',
      }).setOrigin(0.5),
      keep,
      this.scene.add.text(338, SHEET_BOTTOM - 38, t('action.recruit'), {
        color: COLORS.darkText,
        fontFamily: UI_FONT,
        fontSize: '12px',
        fontStyle: '700',
      }).setOrigin(0.5),
    );

    return items;
  }

  private createHeroCard(hero: Hero, index: number): Phaser.GameObjects.Container {
    const x = GAME_WIDTH / 2;
    const y = SHEET_TOP + 123 + index * 6;
    const container = this.scene.add.container(x, y);
    const card = this.scene.add.rectangle(0, 0, 326, 154, 0xf0dca8, 1).setInteractive({ useHandCursor: true });
    card.setStrokeStyle(4, index === 0 ? 0xffde72 : 0x9b7860, 0.96);
    const portrait = renderHeroFace(this.scene, hero, -98, -2, 0.72);
    const title = this.scene.add.text(-22, -60, heroName(hero), {
      color: '#2a1403',
      fontFamily: UI_FONT,
      fontSize: '17px',
      fontStyle: '700',
      wordWrap: { width: 148 },
    });
    const type = this.scene.add.text(-22, -35, `${rarityLabel(hero.rarity)} ${heroTypeLabel(hero.type)}`, {
      color: '#6b5230',
      fontFamily: UI_FONT,
      fontSize: '12px',
      fontStyle: '700',
    });
    const effect = this.scene.add.text(-22, -8, heroEffect(hero), {
      color: '#2a1403',
      fontFamily: UI_FONT,
      fontSize: '11px',
      lineSpacing: 2,
      wordWrap: { width: 154 },
    });
    const upkeep = this.scene.add.text(132, 53, `${hero.upkeepGold}g`, {
      color: '#2a1403',
      fontFamily: UI_FONT,
      fontSize: '15px',
      fontStyle: '700',
    }).setOrigin(1, 0.5);
    card.on('pointerup', () => index === 0 && this.onPick(hero.id));
    container.add([card, portrait, title, type, effect, upkeep]);
    return container;
  }
}
