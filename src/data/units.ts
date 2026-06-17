import type { UnitType } from '../state/types';
import { t } from '../i18n';

export interface UnitDefinition {
  id: UnitType;
  name: string;
  power: number;
  goldCost: number;
  manpowerCost: number;
}

export const units: UnitDefinition[] = [
  {
    id: 'militia',
    name: t('units.militia.name'),
    power: 0.75,
    goldCost: 0,
    manpowerCost: 1,
  },
  {
    id: 'spearmen',
    name: t('units.spearmen.name'),
    power: 1,
    goldCost: 1,
    manpowerCost: 1,
  },
  {
    id: 'archers',
    name: t('units.archers.name'),
    power: 1.25,
    goldCost: 2,
    manpowerCost: 1,
  },
  {
    id: 'crossbowmen',
    name: t('units.crossbowmen.name'),
    power: 1.55,
    goldCost: 3,
    manpowerCost: 1,
  },
  {
    id: 'heavyInfantry',
    name: t('units.heavyInfantry.name'),
    power: 1.8,
    goldCost: 3,
    manpowerCost: 2,
  },
  {
    id: 'lightCavalry',
    name: t('units.lightCavalry.name'),
    power: 1.6,
    goldCost: 3,
    manpowerCost: 2,
  },
  {
    id: 'royalGuard',
    name: t('units.royalGuard.name'),
    power: 2.2,
    goldCost: 5,
    manpowerCost: 2,
  },
  {
    id: 'warElephants',
    name: t('units.warElephants.name'),
    power: 2.45,
    goldCost: 5,
    manpowerCost: 3,
  },
  {
    id: 'siegeEngine',
    name: t('units.siegeEngine.name'),
    power: 2.8,
    goldCost: 6,
    manpowerCost: 1,
  },
  {
    id: 'riverMarines',
    name: t('units.riverMarines.name'),
    power: 1.45,
    goldCost: 2,
    manpowerCost: 2,
  },
];
