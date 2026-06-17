import { COLORS } from '../game/constants';
import type { Kingdom } from '../state/types';

export const kingdomTemplates: Kingdom[] = [
  {
    id: 'dai-viet',
    name: 'Đại Việt',
    color: COLORS.player,
    personality: 'player',
    isDefeated: false,
  },
  {
    id: 'northern-rival',
    name: 'Lãnh Chúa Phương Bắc',
    color: COLORS.enemyNorth,
    personality: 'expansionist',
    isDefeated: false,
  },
];
