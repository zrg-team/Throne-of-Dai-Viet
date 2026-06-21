import { isCampaignMode, PLAYER_KINGDOM_ID } from '../game/constants';
import { foreignCardTemplates } from '../data/foreignCards';
import { addOpinionModifier, adjustPrestige } from './DiplomacySystem';
import { applyResourceDelta } from './ResourceSystem';
import type { ForeignChoice, GameState, ResourceBag } from '../state/types';
import { t } from '../i18n';

function randomInt(maxExclusive: number): number {
  return Math.floor(Math.random() * maxExclusive);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function canAfford(state: GameState, delta: Partial<ResourceBag>): boolean {
  return Object.entries(delta).every(([key, value]) => (value ?? 0) >= 0 || state.resources[key as keyof ResourceBag] + (value ?? 0) >= 0);
}

/** Occasionally surfaces an empire-tied dilemma card; pauses the game until the player answers. */
export function maybeDrawForeignCard(state: GameState): void {
  if (!isCampaignMode(state.gameMode)) return;
  // Don't stack on top of a court card or another foreign card.
  if (state.pendingForeignCard || state.activePoliticsCard || state.pendingCourtRequest) return;
  if ((state.invasions?.length ?? 0) > 0) return;

  state.foreignCardCooldown = (state.foreignCardCooldown ?? 4) - 1;
  if ((state.foreignCardCooldown ?? 0) > 0) return;

  const empires = state.kingdoms.filter((k) => k.id !== PLAYER_KINGDOM_ID && !k.isDefeated);
  if (empires.length === 0) {
    state.foreignCardCooldown = 3;
    return;
  }
  const kingdom = empires[randomInt(empires.length)];
  const rivalPool = empires.filter((k) => k.id !== kingdom.id);
  const rival = rivalPool.length > 0 ? rivalPool[randomInt(rivalPool.length)] : undefined;
  const opinion = kingdom.relations ?? 50;

  const eligible = foreignCardTemplates.filter((tmpl) =>
    (!tmpl.needsRival || rival) &&
    (tmpl.maxOpinion === undefined || opinion <= tmpl.maxOpinion) &&
    (tmpl.minOpinion === undefined || opinion >= tmpl.minOpinion));
  if (eligible.length === 0) {
    state.foreignCardCooldown = 3;
    return;
  }

  const total = eligible.reduce((sum, tmpl) => sum + tmpl.weight, 0);
  let roll = Math.random() * total;
  let chosen = eligible[0];
  for (const tmpl of eligible) {
    roll -= tmpl.weight;
    if (roll <= 0) {
      chosen = tmpl;
      break;
    }
  }

  const built = chosen.build(kingdom, rival);
  state.pendingForeignCard = {
    id: `fcard-${state.turn}-${chosen.id}`,
    kingdomId: kingdom.id,
    kingdomName: kingdom.name,
    rivalId: rival?.id,
    rivalName: rival?.name,
    ...built,
  };
  state.isPaused = true;
  state.foreignCardCooldown = 5 + randomInt(4);
  state.message = t('fcard.arrive', { kingdom: kingdom.name });
}

/** Returns false if a choice cannot be taken right now (unaffordable / lacks the required leverage). */
export function canTakeForeignChoice(state: GameState, choice: ForeignChoice): boolean {
  if (choice.delta && !canAfford(state, choice.delta)) return false;
  if (choice.requiresArmy && !state.armies.some((a) => a.kingdomId === PLAYER_KINGDOM_ID)) return false;
  return true;
}

export function resolveForeignChoice(state: GameState, choiceId: string): void {
  const card = state.pendingForeignCard;
  if (!card) return;
  const choice = card.choices.find((c) => c.id === choiceId);
  if (!choice) return;

  if (!canTakeForeignChoice(state, choice)) {
    state.message = choice.requiresArmy ? t('fcard.needArmy') : t('fcard.cannotAfford');
    return;
  }

  const kingdom = state.kingdoms.find((k) => k.id === card.kingdomId);
  state.pendingForeignCard = undefined;
  state.isPaused = false;
  if (!kingdom) return;

  if (choice.delta) {
    applyResourceDelta(state, choice.delta);
  }
  if (choice.opinionDelta) {
    addOpinionModifier(kingdom, {
      id: `fc-${state.turn}-${kingdom.id}-${Math.floor(Math.random() * 100000)}`,
      label: t('diplo.mod.dealings'),
      value: choice.opinionDelta,
      decay: 0.5,
      source: 'request',
    });
  }
  if (choice.opinionStanding) {
    addOpinionModifier(kingdom, {
      id: `bond-${kingdom.id}`,
      label: t('diplo.mod.bond'),
      value: choice.opinionStanding,
      source: 'treaty',
    });
  }
  if (choice.rivalOpinionDelta && card.rivalId) {
    const rival = state.kingdoms.find((k) => k.id === card.rivalId);
    if (rival) {
      addOpinionModifier(rival, {
        id: `fc-rival-${state.turn}-${rival.id}-${Math.floor(Math.random() * 100000)}`,
        label: t('diplo.mod.dealings'),
        value: choice.rivalOpinionDelta,
        decay: 0.3,
        source: 'request',
      });
    }
  }
  if (choice.prestigeDelta) {
    adjustPrestige(state, choice.prestigeDelta);
  }
  if (choice.trustDelta) {
    kingdom.trust = clamp((kingdom.trust ?? 50) + choice.trustDelta, 0, 100);
  }
  if (choice.provoke) {
    kingdom.warAppetite = (kingdom.warAppetite ?? 0) + choice.provoke;
  }
  if (choice.appease) {
    kingdom.warAppetite = 0;
    kingdom.hostilityTimer = 0;
    state.scheduledCampaignEvents = state.scheduledCampaignEvents.filter(
      (e) => !(e.type === 'dynasty-attack' && e.sourceKingdomId === kingdom.id && !e.resolved),
    );
  }

  state.message = t('fcard.resolved', { kingdom: kingdom.name });
}
