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
    id: 'northern-rival',
    name: 'Northern Mountain Lords',
    color: COLORS.enemyNorth,
    personality: 'expansionist',
    isDefeated: false,
  },
];
