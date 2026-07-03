import { PLAYER_KINGDOM_ID } from '../../game/constants';
import type { GameState, Land } from '../../state/types';
import { refreshAllLandOutputs } from '../ResourceSystem';
import { refreshPlayerVisibility } from '../LandSystem';
import { pushToast } from './notifications';
import { t } from '../../i18n';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const moveToward = (v: number, target: number, step: number) =>
  v < target ? Math.min(target, v + step) : Math.max(target, v - step);

function playerLands(state: GameState): Land[] {
  return state.lands.filter((l) => l.ownerId === PLAYER_KINGDOM_ID);
}

function capital(state: GameState): Land | undefined {
  return state.lands.find((l) => l.ownerId === PLAYER_KINGDOM_ID && l.type === 'castle');
}

function dynastyStability(state: GameState): number {
  const ds = state.dynastyStatus;
  if (!ds) return 70;
  return state.court.stability * 0.4 + (100 - ds.farmerUnrest) * 0.35 + ds.nobleRelations * 0.25;
}

/**
 * Provinces are not held for free: loyalty drifts with the realm's stability, distance
 * from the throne, and imperial overreach, and a bitterly disloyal province can REBEL
 * and secede — a real setback short of defeat that rewards keeping loyalty high
 * (governors, low unrest) and warns against expanding faster than you can hold.
 */
export function tickCrises(state: GameState): void {
  if (state.gameMode !== 'empire') return;
  const cap = capital(state);
  if (!cap) return;

  const owned = playerLands(state);
  const stability = dynastyStability(state);
  // Every province past a comfortable core strains the realm's cohesion.
  const overreach = Math.max(0, owned.length - 9) * 1.4;

  for (const land of owned) {
    if (land.id === cap.id) continue;
    const dist = Math.sqrt((land.x - cap.x) ** 2 + (land.y - cap.y) ** 2);
    const distPenalty = Math.min(22, dist / 40);
    const target = clamp(55 + (stability - 55) * 0.6 - distPenalty - overreach, 5, 100);
    land.loyalty = moveToward(land.loyalty, target, 1.6);

    // Secession: a province in open discontent tears itself away.
    if (land.loyalty < 26) {
      const risk = (26 - land.loyalty) * 0.012 * (stability < 40 ? 2.2 : 1);
      if (Math.random() < risk) {
        secede(state, land);
      }
    }
  }
}

function secede(state: GameState, land: Land): void {
  land.ownerId = 'neutral';
  land.loyalty = 45 + Math.floor(Math.random() * 15);
  land.localSoldiers = Math.max(land.localSoldiers, Math.floor(land.defense * 0.7));
  // Withdraw any player army stationed there to the nearest still-loyal neighbour.
  for (const army of state.armies.filter((a) => a.kingdomId === PLAYER_KINGDOM_ID && a.landId === land.id)) {
    const refuge = land.neighbors
      .map((id) => state.lands.find((l) => l.id === id))
      .find((l) => l?.ownerId === PLAYER_KINGDOM_ID);
    if (refuge) army.landId = refuge.id;
  }
  if (state.dynastyStatus) {
    state.dynastyStatus.nobleRelations = Math.max(0, state.dynastyStatus.nobleRelations - 8);
    state.dynastyStatus.farmerUnrest = Math.min(100, state.dynastyStatus.farmerUnrest + 6);
  }
  refreshAllLandOutputs(state);
  refreshPlayerVisibility(state);
  pushToast(state, t('empire.crisis.secede', { land: land.name }), 'threat');
  state.message = t('empire.crisis.secede', { land: land.name });
}
