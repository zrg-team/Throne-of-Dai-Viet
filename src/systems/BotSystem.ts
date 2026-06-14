import { NEUTRAL_OWNER_ID, PLAYER_KINGDOM_ID } from '../game/constants';
import type { GameState, Kingdom } from '../state/types';

export function runBotTurns(state: GameState): void {
  for (const kingdom of state.kingdoms) {
    if (kingdom.id === PLAYER_KINGDOM_ID || kingdom.isDefeated) {
      continue;
    }

    runSingleBot(state, kingdom);
  }
}

function runSingleBot(state: GameState, kingdom: Kingdom): void {
  const ownedLands = state.lands.filter((land) => land.ownerId === kingdom.id);
  const frontier = ownedLands
    .flatMap((land) => land.neighbors)
    .map((neighborId) => state.lands.find((land) => land.id === neighborId))
    .filter(Boolean);

  const neutralTarget = frontier.find((land) => land?.ownerId === NEUTRAL_OWNER_ID);

  if (neutralTarget && state.turn % 2 === 0) {
    neutralTarget.ownerId = kingdom.id;
    neutralTarget.loyalty = 60;
    state.message = `${kingdom.name} expands into ${neutralTarget.name}.`;
    return;
  }

  const playerTarget = frontier.find((land) => land?.ownerId === PLAYER_KINGDOM_ID);

  if (playerTarget && state.turn % 4 === 0) {
    playerTarget.loyalty = Math.max(20, playerTarget.loyalty - 8);
    state.message = `${kingdom.name} pressures ${playerTarget.name}.`;
  }
}
