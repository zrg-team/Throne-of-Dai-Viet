import { isCampaignMode, PLAYER_KINGDOM_ID } from '../game/constants';
import { addOpinionModifier, breakPact, getFear, giftCost, giftOpinionGain, hasPact, tickDiplomacy } from './DiplomacySystem';
import type { CampaignEvent, GameState, Kingdom, KingdomPersonality } from '../state/types';
import { t } from '../i18n';

const ROYAL_NAMES = [
  'Lý Công Uẩn', 'Trần Hưng Đạo', 'Nguyễn Ánh', 'Lê Lợi', 'Đinh Tiên Hoàng',
  'Trịnh Kiểm', 'Nguyễn Hoàng', 'Lê Thánh Tông', 'Phùng Hưng', 'Triệu Quang Phục',
  'Quách Mãnh', 'Đoàn Thượng', 'Hồ Quý Ly', 'Mạc Đăng Dung', 'Lý Thường Kiệt',
  'Bùi Thị Xuân', 'Trần Thủ Độ', 'Nguyễn Trãi', 'Lê Văn Hưu', 'Đào Duy Từ',
];

const PERSONALITY_LABELS: Record<KingdomPersonality, string> = {
  player: 'neutral',
  aggressive: 'warlike',
  defensive: 'cautious',
  economic: 'mercantile',
  diplomatic: 'conciliatory',
  expansionist: 'ambitious',
};

function pickRoyalName(): string {
  return ROYAL_NAMES[Math.floor(Math.random() * ROYAL_NAMES.length)];
}

function pickRandomPersonality(): KingdomPersonality {
  const options: KingdomPersonality[] = ['aggressive', 'defensive', 'economic', 'diplomatic', 'expansionist'];
  return options[Math.floor(Math.random() * options.length)];
}

function isKingdomWeak(kingdom: Kingdom, state: GameState): boolean {
  const ownedCount = state.lands.filter((l) => l.ownerId === kingdom.id).length;
  // Off-map empires hold no districts; judge weakness by relations instead of land count.
  if (ownedCount === 0) {
    return (kingdom.relations ?? 50) < 40;
  }
  const playerCount = state.lands.filter((l) => l.ownerId === PLAYER_KINGDOM_ID).length;
  return ownedCount < playerCount * 0.6;
}

function scheduleDynastyAttack(state: GameState, kingdomId: string): void {
  const id = `dynasty-attack-${kingdomId}-${state.turn}`;
  const event: CampaignEvent = {
    id,
    type: 'dynasty-attack',
    scheduledTick: state.turn + 1,
    sourceKingdomId: kingdomId,
    resolved: false,
  };
  state.scheduledCampaignEvents.push(event);
  const kingdom = state.kingdoms.find((k) => k.id === kingdomId);
  state.message = t('msg.newKingAggressive', { kingdom: kingdom?.name ?? kingdomId });
}

export function tickForeignAffairs(state: GameState): void {
  if (!isCampaignMode(state.gameMode)) return;

  // Decay temporary opinion modifiers + gift fatigue, then drift toward each empire's baseline.
  tickDiplomacy(state);

  for (const kingdom of state.kingdoms) {
    if (kingdom.id === PLAYER_KINGDOM_ID || kingdom.isDefeated) continue;
    if (!kingdom.king) continue;

    kingdom.king.age += 1;
    const deathChance = 0.004 + kingdom.king.age * 0.0006;

    if (Math.random() < deathChance) {
      const newPersonality = pickRandomPersonality();
      kingdom.king = { name: pickRoyalName(), personality: newPersonality, age: 0 };

      if (newPersonality === 'aggressive' || newPersonality === 'expansionist') {
        // A warlike successor inflames war appetite rather than a fixed timer.
        kingdom.warAppetite = Math.min(100, (kingdom.warAppetite ?? 0) + 30);
        state.message = t('msg.newKingAggressive', { kingdom: kingdom.name });
      } else {
        state.message = t('msg.newKingPeaceful', {
          kingdom: kingdom.name,
          personality: PERSONALITY_LABELS[newPersonality],
        });
      }
    }

    escalateWarAppetite(state, kingdom);
  }
}

function personalityAggression(personality: KingdomPersonality): number {
  switch (personality) {
    case 'aggressive': return 1.4;
    case 'expansionist': return 0.9;
    case 'economic': return -0.4;
    case 'diplomatic': return -1.2;
    case 'defensive': return -0.2;
    default: return 0;
  }
}

/**
 * Drives the escalation ladder: war appetite rises with low opinion + low fear +
 * a warlike temperament, and falls with friendship, deterrence, or a pact. When it
 * tops out the empire launches an invasion (the consequence of failed diplomacy).
 */
function escalateWarAppetite(state: GameState, kingdom: Kingdom): void {
  const opinion = kingdom.relations ?? 50;
  const fear = getFear(state, kingdom);
  let delta = personalityAggression(kingdom.personality);

  if (hasPact(kingdom)) {
    delta -= 5; // a standing pact rapidly cools aggression
  } else {
    if (opinion < 30) delta += 3;
    else if (opinion < 45) delta += 1.5;
    else if (opinion > 65) delta -= 2;
    else delta -= 0.5;

    if (fear < 25) delta += 2;
    else if (fear > 60) delta -= 2;
  }

  kingdom.warAppetite = Math.max(0, Math.min(100, (kingdom.warAppetite ?? 0) + delta));

  const pendingAttack = state.scheduledCampaignEvents.some(
    (e) => e.type === 'dynasty-attack' && e.sourceKingdomId === kingdom.id && !e.resolved,
  );
  // Telegraph: a brewing host shows the ⚠ threat marker.
  kingdom.hostilityTimer = !hasPact(kingdom) && kingdom.warAppetite >= 70 ? 1 : 0;

  if (kingdom.warAppetite >= 100 && !hasPact(kingdom) && !pendingAttack) {
    scheduleDynastyAttack(state, kingdom.id);
    kingdom.warAppetite = 30; // cool down after committing to war
  }
}

export function sendGift(state: GameState, kingdomId: string): boolean {
  if (!isCampaignMode(state.gameMode)) return false;
  const kingdom = state.kingdoms.find((k) => k.id === kingdomId);
  if (!kingdom || kingdom.isDefeated) return false;

  const cost = giftCost(kingdom);
  if (state.resources.gold < cost) {
    state.message = t('diplo.giftNoGold', { cost });
    return false;
  }
  state.resources.gold -= cost;
  const gain = giftOpinionGain(kingdom);
  addOpinionModifier(kingdom, {
    id: `gift-${state.turn}-${Math.floor(Math.random() * 100000)}`,
    label: t('diplo.mod.gift'),
    value: gain,
    decay: 1.1,
    source: 'gift',
  });
  kingdom.giftFatigue = (kingdom.giftFatigue ?? 0) + 1;
  state.message = t('diplo.gift', { kingdom: kingdom.name, gain });
  return true;
}

export function proposeTrade(state: GameState, kingdomId: string): boolean {
  if (!isCampaignMode(state.gameMode)) return false;
  const kingdom = state.kingdoms.find((k) => k.id === kingdomId);
  if (!kingdom || kingdom.isDefeated) return false;
  if (state.court.influence < 10) {
    state.message = t('diplo.tradeNoInfluence');
    return false;
  }
  state.court.influence -= 10;
  state.resources.gold += 20;
  addOpinionModifier(kingdom, {
    id: `trade-${state.turn}-${Math.floor(Math.random() * 100000)}`,
    label: t('diplo.mod.trade'),
    value: 8,
    decay: 0.7,
    source: 'trade',
  });
  state.message = t('diplo.trade', { kingdom: kingdom.name });
  return true;
}

export function demandTribute(state: GameState, kingdomId: string): boolean {
  if (!isCampaignMode(state.gameMode)) return false;
  const kingdom = state.kingdoms.find((k) => k.id === kingdomId);
  if (!kingdom || kingdom.isDefeated) return false;

  // Extorting a treaty partner is a hostile act that breaks the pact (our fault).
  if (hasPact(kingdom)) {
    breakPact(state, kingdomId, true);
  }

  if (isKingdomWeak(kingdom, state)) {
    state.resources.gold += 40;
    addOpinionModifier(kingdom, {
      id: `tribute-${state.turn}-${Math.floor(Math.random() * 100000)}`,
      label: t('diplo.mod.tribute'),
      value: -18,
      decay: 0.5,
      source: 'tribute',
    });
    state.message = t('diplo.tributePaid', { kingdom: kingdom.name });
  } else {
    addOpinionModifier(kingdom, {
      id: `tribute-refused-${state.turn}-${Math.floor(Math.random() * 100000)}`,
      label: t('diplo.mod.tributeRefused'),
      value: -28,
      decay: 0.4,
      source: 'tribute',
    });
    kingdom.hostilityTimer = Math.max(0, Math.floor((kingdom.hostilityTimer ?? 0) / 2));
    state.message = t('diplo.tributeRefused', { kingdom: kingdom.name });
  }
  return true;
}
