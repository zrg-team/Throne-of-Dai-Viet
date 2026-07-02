import { isCampaignMode, PLAYER_KINGDOM_ID } from '../game/constants';
import { campaignEventTemplates } from '../data/campaignEvents';
import { addCourtModifier } from './CourtSystem';
import { applyResourceDelta } from './ResourceSystem';
import type { Army, CampaignEvent, Difficulty, GameState } from '../state/types';
import { t } from '../i18n';

function difficultyEventCount(difficulty: Difficulty): number {
  if (difficulty === 'easy') return 8;
  if (difficulty === 'hard') return 13;
  if (difficulty === 'ironman') return 18;
  return 10;
}

function difficultyMinTurnMult(difficulty: Difficulty): number {
  if (difficulty === 'easy') return 1.5;
  if (difficulty === 'hard') return 0.7;
  if (difficulty === 'ironman') return 0.5;
  return 1.0;
}

function pickWeightedTemplate(
  difficulty: Difficulty,
  currentTurn: number,
): (typeof campaignEventTemplates)[number] | undefined {
  const minTurnMult = difficultyMinTurnMult(difficulty);
  const eligible = campaignEventTemplates.filter((tmpl) => currentTurn >= tmpl.minTurn * minTurnMult);
  if (eligible.length === 0) return undefined;
  const totalWeight = eligible.reduce((sum, tmpl) => sum + tmpl.baseWeight, 0);
  let roll = Math.random() * totalWeight;
  for (const tmpl of eligible) {
    roll -= tmpl.baseWeight;
    if (roll <= 0) return tmpl;
  }
  return eligible[eligible.length - 1];
}

export function scheduleCampaignEvents(state: GameState): void {
  if (!isCampaignMode(state.gameMode) || !state.campaignConfig) return;
  const { difficulty } = state.campaignConfig;
  const count = difficultyEventCount(difficulty);
  const maxScheduleTurn = difficulty === 'easy' ? 60 : difficulty === 'hard' ? 40 : difficulty === 'ironman' ? 30 : 50;

  const events: CampaignEvent[] = [];
  const usedTicks = new Set<number>();

  for (let i = 0; i < count; i += 1) {
    const minTick = 2 + i * 2;
    const tickRange = maxScheduleTurn - minTick;
    if (tickRange <= 0) break;

    let scheduledTick = minTick + Math.floor(Math.random() * tickRange);
    while (usedTicks.has(scheduledTick) && scheduledTick < maxScheduleTurn) {
      scheduledTick += 1;
    }
    usedTicks.add(scheduledTick);

    const tmpl = pickWeightedTemplate(difficulty, scheduledTick);
    if (!tmpl) continue;

    const nonRivalKingdomIds = state.kingdoms
      .filter((k) => k.id !== PLAYER_KINGDOM_ID && !k.isDefeated)
      .map((k) => k.id);

    const sourceKingdomId =
      tmpl.type === 'dynasty-attack' && nonRivalKingdomIds.length > 0
        ? nonRivalKingdomIds[Math.floor(Math.random() * nonRivalKingdomIds.length)]
        : undefined;

    events.push({
      id: `event-${i}-${tmpl.id}-${scheduledTick}`,
      type: tmpl.type,
      scheduledTick,
      sourceKingdomId,
      resolved: false,
    });
  }

  state.scheduledCampaignEvents = events.sort((a, b) => a.scheduledTick - b.scheduledTick);
}

export function tickCampaignEvents(state: GameState): void {
  if (!isCampaignMode(state.gameMode)) return;

  for (const event of state.scheduledCampaignEvents) {
    if (!event.resolved && event.scheduledTick <= state.turn) {
      resolveCampaignEvent(state, event);
      event.resolved = true;
    }
  }
}

function resolveCampaignEvent(state: GameState, event: CampaignEvent): void {
  switch (event.type) {
    case 'bandit-raid': {
      const ownedLands = state.lands.filter((l) => l.ownerId === PLAYER_KINGDOM_ID);
      const targets = ownedLands.slice().sort(() => Math.random() - 0.5).slice(0, 2);
      for (const land of targets) {
        land.loyalty = Math.max(20, land.loyalty - 10);
      }
      state.message = t('msg.campaignEvent.banditRaid', { land: targets[0]?.name ?? 'your lands' });
      break;
    }

    case 'flood': {
      addCourtModifier(state, {
        id: `flood-${state.turn}`,
        label: 'Flood',
        remainingTicks: 3,
        resourceRateModifier: { food: -3 },
      });
      state.message = t('msg.campaignEvent.flood');
      break;
    }

    case 'drought': {
      if (state.dynastyStatus) {
        state.dynastyStatus.farmerUnrest = Math.min(100, state.dynastyStatus.farmerUnrest + 12);
      }
      addCourtModifier(state, {
        id: `drought-${state.turn}`,
        label: 'Drought',
        remainingTicks: 2,
        resourceRateModifier: { food: -2 },
      });
      state.message = t('msg.campaignEvent.drought');
      break;
    }

    case 'noble-uprising': {
      if (state.dynastyStatus) {
        state.dynastyStatus.nobleRelations = Math.max(0, state.dynastyStatus.nobleRelations - 20);
      }
      const ownedLands = state.lands.filter((l) => l.ownerId === PLAYER_KINGDOM_ID && l.hasVillage);
      const target = ownedLands[Math.floor(Math.random() * ownedLands.length)];
      if (target) {
        target.loyalty = Math.max(20, target.loyalty - 8);
      }
      state.message = t('msg.campaignEvent.nobleUprising');
      break;
    }

    case 'merchant-bounty': {
      applyResourceDelta(state, { gold: 40, supplies: 15 });
      state.message = t('msg.campaignEvent.merchantBounty');
      break;
    }

    case 'plague': {
      const ownedLands = state.lands.filter((l) => l.ownerId === PLAYER_KINGDOM_ID && l.population > 0);
      const targets = ownedLands.slice().sort(() => Math.random() - 0.5).slice(0, 2);
      for (const land of targets) {
        land.population = Math.max(0, Math.floor(land.population * 0.85));
      }
      if (state.dynastyStatus) {
        state.dynastyStatus.farmerUnrest = Math.min(100, state.dynastyStatus.farmerUnrest + 8);
      }
      state.message = t('msg.campaignEvent.plague');
      break;
    }

    case 'dynasty-attack': {
      // Empire mode: the ThreatDirector owns invasion pacing (continuous, telegraphed),
      // so these pre-scheduled attacks are inert there. Classic campaign still uses them.
      if (state.gameMode !== 'empire') {
        launchDynastyAttack(state, event.sourceKingdomId);
      }
      break;
    }
  }
}

export function launchDynastyAttack(state: GameState, kingdomId: string | undefined): void {
  if (!kingdomId) return;
  const kingdom = state.kingdoms.find((k) => k.id === kingdomId && !k.isDefeated);
  if (!kingdom) return;

  const capitalLand = state.lands.find(
    (l) => l.ownerId === kingdomId && (l.type === 'enemyCastle' || l.type === 'castle'),
  );
  if (!capitalLand) return;

  const existingStrength = state.armies
    .filter((a) => a.kingdomId === kingdomId)
    .reduce((sum, a) => sum + a.units.spearmen + a.units.archers + a.units.heavyInfantry, 0);
  const attackSize = Math.max(600, Math.floor(existingStrength * 1.8));

  const army: Army = {
    id: `dynasty-attack-${kingdomId}-${state.turn}`,
    kingdomId,
    name: `${kingdom.name} Great Army`,
    landId: capitalLand.id,
    units: {
      spearmen: Math.floor(attackSize * 0.58),
      archers: Math.floor(attackSize * 0.28),
      heavyInfantry: Math.floor(attackSize * 0.14),
    },
    morale: 88,
    supply: 92,
    rations: 400,
    provisions: 300,
    level: 2,
    experience: 0,
    experienceToNextLevel: 160,
  };
  state.armies.push(army);
  state.message = t('msg.campaignEvent.dynastyAttack', { kingdom: kingdom.name });
}
