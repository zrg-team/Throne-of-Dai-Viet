import type { UnitType } from '../state/types';

export interface UnitDefinition {
  id: UnitType;
  name: string;
  power: number;
  goldCost: number;
  manpowerCost: number;
}

export const units: UnitDefinition[] = [
  {
    id: 'spearmen',
    name: 'Spearmen',
    power: 1,
    goldCost: 1,
    manpowerCost: 1,
  },
  {
    id: 'archers',
    name: 'Archers',
    power: 1.25,
    goldCost: 2,
    manpowerCost: 1,
  },
  {
    id: 'heavyInfantry',
    name: 'Heavy Infantry',
    power: 1.8,
    goldCost: 3,
    manpowerCost: 2,
  },
];
