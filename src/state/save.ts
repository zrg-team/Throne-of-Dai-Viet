import type { GameState } from './types';
import { t } from '../i18n';

export const SAVE_SNAPSHOT_VERSION = 1;
export const SAVE_SNAPSHOT_KEY = 'mandate:snapshot:v1';

export interface SaveSnapshot {
  version: typeof SAVE_SNAPSHOT_VERSION;
  savedAt: string;
  state: GameState;
}

export function saveSnapshot(state: GameState): SaveSnapshot | undefined {
  if (!canUseLocalStorage()) {
    return undefined;
  }

  const snapshot: SaveSnapshot = {
    version: SAVE_SNAPSHOT_VERSION,
    savedAt: new Date().toISOString(),
    state: normalizeSnapshotState(state),
  };

  localStorage.setItem(SAVE_SNAPSHOT_KEY, JSON.stringify(snapshot));
  return snapshot;
}

export function loadSnapshot(): SaveSnapshot | undefined {
  if (!canUseLocalStorage()) {
    return undefined;
  }

  const raw = localStorage.getItem(SAVE_SNAPSHOT_KEY);
  if (!raw) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(raw) as SaveSnapshot;
    if (!isValidSnapshot(parsed)) {
      return undefined;
    }
    parsed.state = normalizeSnapshotState(parsed.state);
    return parsed;
  } catch {
    return undefined;
  }
}

export function hasSnapshot(): boolean {
  return Boolean(loadSnapshot());
}

export function snapshotLabel(snapshot = loadSnapshot()): string {
  if (!snapshot) {
    return t('save.noSavedCampaign');
  }

  const date = new Date(snapshot.savedAt);
  if (Number.isNaN(date.getTime())) {
    return t('save.savedCampaign');
  }

  return t('save.savedDate', { date: date.toLocaleString() });
}

function normalizeSnapshotState(state: GameState): GameState {
  const clone = structuredClone(state);
  for (const land of clone.lands) {
    for (const building of land.buildings) {
      if ((building.type as string) === 'shrine') {
        building.type = 'communalHall';
      }
    }
  }
  for (const order of clone.buildOrders) {
    if ((order.building as string) === 'shrine') {
      order.building = 'communalHall';
    }
  }
  for (const army of clone.armies) {
    army.unpaidTicks ??= 0;
  }
  for (const card of [
    ...clone.politicsDeck,
    clone.activePoliticsCard,
    clone.pendingCourtRequest,
  ]) {
    if (!card) {
      continue;
    }
    for (const choice of card.choices) {
      if ((choice.effects.freeBuilding as string | undefined) === 'shrine') {
        choice.effects.freeBuilding = 'communalHall';
      }
      if ((choice.effects.freeUpgrade as string | undefined) === 'shrine') {
        choice.effects.freeUpgrade = 'communalHall';
      }
    }
  }
  clone.isPaused = false;
  clone.latestBattleResult = undefined;
  // A prompt was mid-decision when the run was saved; its options were priced against a
  // state that no longer exists, so drop it rather than restore a stale choice.
  clone.pendingAscentPrompt = undefined;
  if (clone.ascent) {
    clone.ascent.promptQueue = [];
  }
  return clone;
}

function canUseLocalStorage(): boolean {
  return typeof localStorage !== 'undefined';
}

function isValidSnapshot(value: SaveSnapshot): value is SaveSnapshot {
  return (
    value?.version === SAVE_SNAPSHOT_VERSION &&
    typeof value.savedAt === 'string' &&
    Boolean(value.state) &&
    Array.isArray(value.state.lands) &&
    Array.isArray(value.state.armies) &&
    Array.isArray(value.state.hexTiles)
  );
}
