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
  {
    id: 'southern-rival',
    name: 'Vương Quốc Phương Nam',
    color: COLORS.enemySouth,
    personality: 'aggressive',
    isDefeated: false,
  },
  {
    id: 'eastern-rival',
    name: 'Liên Minh Phương Đông',
    color: 0x4a8fa8,
    personality: 'economic',
    isDefeated: false,
  },
  {
    id: 'western-rival',
    name: 'Bộ Lạc Phương Tây',
    color: 0x8b6b3d,
    personality: 'defensive',
    isDefeated: false,
  },
];
