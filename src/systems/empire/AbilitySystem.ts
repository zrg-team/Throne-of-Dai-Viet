import { PLAYER_KINGDOM_ID } from '../../game/constants';
import type { Army, GameState, ResourceBag } from '../../state/types';
import { applyResourceDelta, canSpend, refreshAllLandOutputs } from '../ResourceSystem';
import { pushToast } from './notifications';
import { t } from '../../i18n';

export type AbilityId = 'rally' | 'levy' | 'decree';

interface AbilityDef {
  id: AbilityId;
  cost: Partial<ResourceBag>;
  cooldown: number;
}

export const ABILITIES: AbilityDef[] = [
  { id: 'rally', cost: { supplies: 25 }, cooldown: 6 },
  { id: 'levy', cost: { humans: 350 }, cooldown: 9 },
  { id: 'decree', cost: { gold: 70 }, cooldown: 9 },
];

export function abilityLabel(id: AbilityId): string {
  return t(`empire.ability.${id}` as Parameters<typeof t>[0]);
}
export function abilityDesc(id: AbilityId): string {
  return t(`empire.ability.${id}.d` as Parameters<typeof t>[0]);
}

export function abilityCooldown(state: GameState, id: AbilityId): number {
  return state.abilityCooldowns?.[id] ?? 0;
}

export function abilityBlockedReason(state: GameState, def: AbilityDef): string | undefined {
  if (abilityCooldown(state, def.id) > 0) return t('empire.ability.cooldown', { turns: abilityCooldown(state, def.id) });
  if (!canSpend(state, def.cost)) return t('empire.ability.cost');
  return undefined;
}

export function tickAbilities(state: GameState): void {
  if (!state.abilityCooldowns) return;
  for (const key of Object.keys(state.abilityCooldowns)) {
    if (state.abilityCooldowns[key] > 0) state.abilityCooldowns[key] -= 1;
  }
}

function playerCapital(state: GameState) {
  return state.lands.find((l) => l.ownerId === PLAYER_KINGDOM_ID && l.type === 'castle')
    ?? state.lands.find((l) => l.ownerId === PLAYER_KINGDOM_ID);
}

export function useAbility(state: GameState, id: AbilityId): boolean {
  const def = ABILITIES.find((a) => a.id === id);
  if (!def || state.gameMode !== 'empire') return false;
  if (abilityBlockedReason(state, def)) {
    state.message = abilityBlockedReason(state, def)!;
    return false;
  }
  applyResourceDelta(state, Object.fromEntries(Object.entries(def.cost).map(([k, v]) => [k, -(v ?? 0)])));
  state.abilityCooldowns ??= {};
  state.abilityCooldowns[id] = def.cooldown;

  switch (id) {
    case 'rally': {
      // Restore fighting spirit across every host — turn a battle around.
      for (const army of state.armies.filter((a) => a.kingdomId === PLAYER_KINGDOM_ID)) {
        army.morale = Math.min(100, army.morale + 35);
        army.supply = Math.min(100, army.supply + 20);
      }
      pushToast(state, t('empire.ability.rallyDone'), 'reward');
      break;
    }
    case 'levy': {
      // Conscript the peasantry into an emergency militia at the capital.
      const cap = playerCapital(state);
      if (cap) {
        const existing = state.armies.find((a) => a.kingdomId === PLAYER_KINGDOM_ID && a.landId === cap.id && a.id.startsWith('levy-'));
        const reinforce = 450;
        if (existing) {
          existing.units.spearmen += reinforce;
        } else {
          const militia: Army = {
            id: `levy-${state.turn}`,
            kingdomId: PLAYER_KINGDOM_ID,
            name: t('empire.ability.levyName'),
            landId: cap.id,
            units: { spearmen: Math.round(reinforce * 0.7), archers: Math.round(reinforce * 0.3), heavyInfantry: 0 },
            morale: 65,
            supply: 70,
            rations: 120,
            provisions: 80,
            level: 1,
            experience: 0,
            experienceToNextLevel: 100,
          };
          state.armies.push(militia);
        }
      }
      if (state.dynastyStatus) state.dynastyStatus.farmerUnrest = Math.min(100, state.dynastyStatus.farmerUnrest + 8);
      pushToast(state, t('empire.ability.levyDone'), 'info');
      break;
    }
    case 'decree': {
      // A royal decree quiets unrest and rallies the nobles — the brink stabiliser.
      if (state.dynastyStatus) {
        state.dynastyStatus.farmerUnrest = Math.max(0, state.dynastyStatus.farmerUnrest - 22);
        state.dynastyStatus.nobleRelations = Math.min(100, state.dynastyStatus.nobleRelations + 12);
      }
      state.court.stability = Math.min(100, state.court.stability + 10);
      for (const land of state.lands.filter((l) => l.ownerId === PLAYER_KINGDOM_ID)) {
        land.loyalty = Math.min(100, land.loyalty + 12);
      }
      refreshAllLandOutputs(state);
      pushToast(state, t('empire.ability.decreeDone'), 'reward');
      break;
    }
  }
  return true;
}
