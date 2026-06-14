import { COLORS } from '../game/constants';
import type { Kingdom } from '../state/types';

export const kingdomTemplates: Kingdom[] = [
  {
    id: 'dai-viet',
    name: 'Mandate of Đại Việt',
    color: COLORS.player,
    personality: 'player',
    isDefeated: false,
  },
  {
    id: 'north-lords',
    name: 'Northern Mountain Lords',
    color: COLORS.enemyNorth,
    personality: 'defensive',
    isDefeated: false,
  },
  {
    id: 'south-league',
    name: 'Southern Port League',
    color: COLORS.enemySouth,
    personality: 'economic',
    isDefeated: false,
  },
];
