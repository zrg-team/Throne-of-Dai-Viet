import type { ForeignChoice, Kingdom } from '../state/types';
import { t } from '../i18n';

/** A foreign-affairs dilemma template, instantiated against a specific empire (and sometimes a rival). */
export interface ForeignCardTemplate {
  id: string;
  weight: number;
  /** Requires a second empire to name as the rival. */
  needsRival?: boolean;
  /** Only drawn when the asking empire's opinion is at/below this. */
  maxOpinion?: number;
  /** Only drawn when the asking empire's opinion is at/above this. */
  minOpinion?: number;
  build: (kingdom: Kingdom, rival?: Kingdom) => {
    title: string;
    description: string;
    choices: ForeignChoice[];
  };
}

export const foreignCardTemplates: ForeignCardTemplate[] = [
  {
    id: 'tribute',
    weight: 3,
    maxOpinion: 60,
    build: (k) => ({
      title: t('fcard.tribute.title'),
      description: t('fcard.tribute.desc', { kingdom: k.name }),
      choices: [
        { id: 'pay', label: t('fcard.tribute.pay'), description: t('fcard.tribute.pay.d'), delta: { gold: -35 }, opinionDelta: 10 },
        { id: 'refuse', label: t('fcard.tribute.refuse'), description: t('fcard.tribute.refuse.d'), opinionDelta: -12, provoke: 25 },
      ],
    }),
  },
  {
    id: 'grain',
    weight: 2,
    build: (k) => ({
      title: t('fcard.grain.title'),
      description: t('fcard.grain.desc', { kingdom: k.name }),
      choices: [
        { id: 'give', label: t('fcard.grain.give'), description: t('fcard.grain.give.d'), delta: { food: -40 }, opinionDelta: 14, trustDelta: 4 },
        { id: 'refuse', label: t('fcard.grain.refuse'), description: t('fcard.grain.refuse.d'), opinionDelta: -8 },
      ],
    }),
  },
  {
    id: 'passage',
    weight: 2,
    build: (k) => ({
      title: t('fcard.passage.title'),
      description: t('fcard.passage.desc', { kingdom: k.name }),
      choices: [
        { id: 'allow', label: t('fcard.passage.allow'), description: t('fcard.passage.allow.d'), delta: { gold: 12 }, opinionDelta: 8 },
        { id: 'deny', label: t('fcard.passage.deny'), description: t('fcard.passage.deny.d'), opinionDelta: -8, provoke: 8 },
      ],
    }),
  },
  {
    id: 'marriage',
    weight: 2,
    minOpinion: 45,
    build: (k) => ({
      title: t('fcard.marriage.title'),
      description: t('fcard.marriage.desc', { kingdom: k.name }),
      choices: [
        { id: 'accept', label: t('fcard.marriage.accept'), description: t('fcard.marriage.accept.d'), delta: { gold: -25 }, opinionStanding: 22, trustDelta: 8 },
        { id: 'decline', label: t('fcard.marriage.decline'), description: t('fcard.marriage.decline.d'), opinionDelta: -10 },
      ],
    }),
  },
  {
    id: 'joinwar',
    weight: 2,
    needsRival: true,
    build: (k, r) => ({
      title: t('fcard.joinwar.title'),
      description: t('fcard.joinwar.desc', { kingdom: k.name, rival: r?.name ?? '' }),
      choices: [
        { id: 'join', label: t('fcard.joinwar.join'), description: t('fcard.joinwar.join.d'), opinionDelta: 14, rivalOpinionDelta: -22, requiresArmy: true },
        { id: 'stay', label: t('fcard.joinwar.stay'), description: t('fcard.joinwar.stay.d'), opinionDelta: -8 },
      ],
    }),
  },
  {
    id: 'ultimatum',
    weight: 3,
    maxOpinion: 38,
    build: (k) => ({
      title: t('fcard.ultimatum.title'),
      description: t('fcard.ultimatum.desc', { kingdom: k.name }),
      choices: [
        { id: 'submit', label: t('fcard.ultimatum.submit'), description: t('fcard.ultimatum.submit.d'), delta: { gold: -45 }, opinionDelta: 10, prestigeDelta: -8, appease: true },
        { id: 'defy', label: t('fcard.ultimatum.defy'), description: t('fcard.ultimatum.defy.d'), opinionDelta: -8, prestigeDelta: 10, provoke: 40, requiresArmy: true },
      ],
    }),
  },

  // ── Opportunity events ────────────────────────────────────────────────────
  // Low-stakes, mostly upside choices that fill the quiet stretches between threats
  // with a small decision. They reuse the whole foreign-card pipeline (UI, resolve, bots).
  {
    id: 'caravan',
    weight: 3,
    build: (k) => ({
      title: t('fcard.caravan.title'),
      description: t('fcard.caravan.desc', { kingdom: k.name }),
      choices: [
        { id: 'trade', label: t('fcard.caravan.trade'), description: t('fcard.caravan.trade.d'), delta: { supplies: -25, gold: 55 }, opinionDelta: 6 },
        { id: 'decline', label: t('fcard.caravan.decline'), description: t('fcard.caravan.decline.d'), opinionDelta: -2 },
      ],
    }),
  },
  {
    id: 'scholars',
    weight: 2,
    build: (k) => ({
      title: t('fcard.scholars.title'),
      description: t('fcard.scholars.desc', { kingdom: k.name }),
      choices: [
        { id: 'fund', label: t('fcard.scholars.fund'), description: t('fcard.scholars.fund.d'), delta: { gold: -30 }, prestigeDelta: 8, opinionDelta: 8 },
        { id: 'ignore', label: t('fcard.scholars.ignore'), description: t('fcard.scholars.ignore.d') },
      ],
    }),
  },
  {
    id: 'festival',
    weight: 2,
    minOpinion: 40,
    build: (k) => ({
      title: t('fcard.festival.title'),
      description: t('fcard.festival.desc', { kingdom: k.name }),
      choices: [
        { id: 'attend', label: t('fcard.festival.attend'), description: t('fcard.festival.attend.d'), delta: { gold: -20 }, opinionDelta: 12, trustDelta: 5 },
        { id: 'skip', label: t('fcard.festival.skip'), description: t('fcard.festival.skip.d'), opinionDelta: -4 },
      ],
    }),
  },
  {
    id: 'grainsale',
    weight: 2,
    build: (k) => ({
      title: t('fcard.grainsale.title'),
      description: t('fcard.grainsale.desc', { kingdom: k.name }),
      choices: [
        { id: 'sell', label: t('fcard.grainsale.sell'), description: t('fcard.grainsale.sell.d'), delta: { food: -40, gold: 65 }, opinionDelta: 8 },
        { id: 'refuse', label: t('fcard.grainsale.refuse'), description: t('fcard.grainsale.refuse.d'), opinionDelta: -3 },
      ],
    }),
  },
];
