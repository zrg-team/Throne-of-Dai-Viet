import { PLAYER_KINGDOM_ID } from '../../game/constants';
import { addCourtModifier } from '../../systems/CourtSystem';
import { livingRivals, pick, playerLands } from '../../systems/story/StorySystem';
import { pushToast } from '../../systems/empire/notifications';
import { storyText } from '../../i18n/story';
import type { StoryTemplate } from '../../systems/story/types';
import type { GameState } from '../../state/types';

/**
 * Hội Nghị Diên Hồng — The Elders Answer.
 *
 * Facing the second Mongol invasion, the retired emperor summoned the elders of every province
 * to the palace and asked them whether to fight or make terms. They shouted to fight.
 *
 * This is the only card in the game the player does not answer. They present the options; the
 * elders decide — weighted by the loyalty of every province and the stability of the court. It
 * is the single best argument for the whole feature, because it converts ten quiet minutes of
 * governance into one dramatic sentence, and the player only watches.
 *
 * The option the player *does* have is whether to convene at all. That is the decision.
 */

/** How the realm actually feels, 0..1. This is the number the elders are. */
function realmResolve(state: GameState): number {
  const lands = playerLands(state);
  if (lands.length === 0) return 0;
  const loyalty = lands.reduce((sum, land) => sum + land.loyalty, 0) / lands.length;
  const stability = state.court.stability;
  const fed = state.resourceRates.food >= 0 ? 8 : -12;
  return Math.max(0, Math.min(1, (loyalty * 0.6 + stability * 0.4 + fed) / 100));
}

export const dienHong: StoryTemplate = {
  id: 'dien-hong',
  record: 'chinh-su',
  seedWeight: 2,
  minTurn: 22,
  seed: (state) => {
    const ascent = state.ascent;
    if (!ascent || ascent.wavesSurvived < 2) return undefined;
    const rival = pick(livingRivals(state).sort((a, b) => (b.power ?? 50) - (a.power ?? 50)).slice(0, 2));
    if (!rival) return undefined;
    return { kingdomId: rival.id };
  },

  fragments: [
    {
      id: 'khong-ai-hoi-y-ai',
      volume: 'whisper',
      weight: 4,
      quiet: 4,
      when: (ctx) => ctx.recall('chose_decide-alone') === 1,
      salience: (ctx) => (ctx.age >= 5 ? 5 : -20),
    },
    {
      id: 'cac-cu-ay-ve-lang',
      volume: 'whisper',
      weight: 4,
      quiet: 4,
      when: (ctx) => ctx.recall('chose_convene') === 1,
      salience: (ctx) => (ctx.age >= 5 ? 5 : -20),
    },
    // The scene before the question: patched coats, bare feet, three days on the road. The
    // shipped version opened cold on the card, which wasted the best image the story has.
    {
      id: 'the-elders-arrive',
      volume: 'whisper',
      weight: 6,
      quiet: 1,
      when: (ctx) => (ctx.state.ascent?.threat ?? 0) > (ctx.state.ascent?.defensePower ?? 0) * 0.6,
      salience: () => 7,
    },

    {
      id: 'the-elders-are-summoned',
      volume: 'card',
      band: 'crowd',
      weight: 7,
      quiet: 2,
      // Only worth asking when something is actually coming.
      when: (ctx) => (ctx.state.ascent?.threat ?? 0) > (ctx.state.ascent?.defensePower ?? 0) * 0.8,
      // Far more urgent with a wave nearly on top of us — which is exactly when a king in
      // this position historically called the elders in.
      salience: (ctx) => ((ctx.state.ascent?.ticksToWave ?? 20) < 8 ? 11 : 5),
      options: [
        {
          id: 'convene',
          apply: (ctx) => {
            ctx.remember('convened', 1);
            ctx.remember('resolve', Math.round(realmResolve(ctx.state) * 100));
            // R1, and it was backwards before: the *historical* answer did nothing while
            // deciding alone moved stability, so putting the question to the elders read as the
            // inert option. The realm was asked, and a realm notices being asked.
            for (const land of playerLands(ctx.state)) {
              land.loyalty = Math.min(100, land.loyalty + 8);
            }
            ctx.state.court.stability = Math.min(100, ctx.state.court.stability + 6);
            ctx.note('stability', 6);
          },
        },
        {
          id: 'decide-alone',
          apply: (ctx) => {
            // Faster, and the realm notices it was not asked.
            ctx.state.court.stability = Math.min(100, ctx.state.court.stability + 6);
            for (const land of playerLands(ctx.state)) {
              land.loyalty = Math.max(0, land.loyalty - 6);
            }
            ctx.remember('decidedAlone', 1);
          },
        },
      ],
    },
    {
      id: 'the-realm-was-not-asked',
      volume: 'whisper',
      weight: 4,
      terminal: true,
      tone: 'info',
      when: (ctx) => ctx.recall('decidedAlone') === 1,
      salience: () => 8,
    },

    /**
     * The answer. There are no options — this is a blow, because the decision has been made and
     * it was not made by the player. Which of the two outcomes lands is decided entirely by how
     * the realm has been governed for the last ten minutes.
     */
    {
      id: 'they-answer',
      volume: 'blow',
      band: 'crowd',
      weight: 9,
      terminal: true,
      quiet: 1,
      when: (ctx) => ctx.recall('convened') === 1,
      salience: () => 14,
      tone: 'reward',
      effect: (ctx) => {
        const resolve = ctx.recall('resolve') / 100;
        if (resolve >= 0.55) {
          // Đánh. Every host in the realm, and every province behind them.
          for (const army of ctx.state.armies) {
            if (army.kingdomId !== PLAYER_KINGDOM_ID) continue;
            army.morale = Math.min(100, army.morale + 30);
          }
          for (const land of playerLands(ctx.state)) {
            land.loyalty = Math.min(100, land.loyalty + 12);
            land.defense += 4;
          }
          addCourtModifier(ctx.state, {
            id: `dien-hong-${ctx.state.turn}`,
            label: 'Diên Hồng',
            remainingTicks: 12,
            armyPowerModifier: 0.25,
          });
          pushToast(ctx.state, storyText('dien-hong.they-answer.fight', {}), 'reward');
        } else {
          // Hoà. The realm is tired, and it says so in front of everyone.
          const rival = ctx.rival();
          if (rival) rival.relations = Math.min(100, (rival.relations ?? 50) + 30);
          ctx.state.court.stability = Math.max(0, ctx.state.court.stability - 12);
          for (const land of playerLands(ctx.state)) {
            land.loyalty = Math.min(100, land.loyalty + 4);
          }
          pushToast(ctx.state, storyText('dien-hong.they-answer.terms', {}), 'threat');
        }
      },
    },
  ],
};
