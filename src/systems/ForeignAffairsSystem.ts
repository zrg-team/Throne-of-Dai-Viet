import { PLAYER_KINGDOM_ID } from '../game/constants';
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isKingdomWeak(kingdom: Kingdom, state: GameState): boolean {
  const ownedCount = state.lands.filter((l) => l.ownerId === kingdom.id).length;
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
  if (state.gameMode !== 'campaign') return;

  for (const kingdom of state.kingdoms) {
    if (kingdom.id === PLAYER_KINGDOM_ID || kingdom.isDefeated) continue;
    if (!kingdom.king) continue;

    kingdom.king.age += 1;
    const deathChance = 0.004 + kingdom.king.age * 0.0006;

    if (Math.random() < deathChance) {
      const newPersonality = pickRandomPersonality();
      kingdom.king = { name: pickRoyalName(), personality: newPersonality, age: 0 };

      if (newPersonality === 'aggressive' || newPersonality === 'expansionist') {
        kingdom.hostilityTimer = 8 + Math.floor(Math.random() * 8);
        state.message = t('msg.newKingAggressive', { kingdom: kingdom.name });
      } else {
        state.message = t('msg.newKingPeaceful', {
          kingdom: kingdom.name,
          personality: PERSONALITY_LABELS[newPersonality],
        });
      }
    }

    if ((kingdom.hostilityTimer ?? 0) > 0) {
      kingdom.hostilityTimer = (kingdom.hostilityTimer ?? 1) - 1;
      if (kingdom.hostilityTimer === 0) {
        scheduleDynastyAttack(state, kingdom.id);
      }
    }

    // Relations drift slowly toward neutral
    if (state.turn % 3 === 0 && kingdom.relations !== undefined) {
      if (kingdom.relations > 50) {
        kingdom.relations = clamp(kingdom.relations - 1, 50, 100);
      } else if (kingdom.relations < 50) {
        kingdom.relations = clamp(kingdom.relations + 1, 0, 50);
      }
    }
  }
}

export function sendGift(state: GameState, kingdomId: string): boolean {
  if (state.gameMode !== 'campaign') return false;
  const kingdom = state.kingdoms.find((k) => k.id === kingdomId);
  if (!kingdom || kingdom.isDefeated) return false;
  if (state.resources.gold < 30) {
    state.message = 'Not enough gold to send a gift (need 30).';
    return false;
  }
  state.resources.gold -= 30;
  kingdom.relations = clamp((kingdom.relations ?? 50) + 15, 0, 100);
  state.message = `Gift sent to ${kingdom.name}. Relations improved.`;
  return true;
}

export function proposeTrade(state: GameState, kingdomId: string): boolean {
  if (state.gameMode !== 'campaign') return false;
  const kingdom = state.kingdoms.find((k) => k.id === kingdomId);
  if (!kingdom || kingdom.isDefeated) return false;
  if (state.court.influence < 10) {
    state.message = 'Not enough influence to propose trade (need 10).';
    return false;
  }
  state.court.influence -= 10;
  state.resources.gold += 20;
  kingdom.relations = clamp((kingdom.relations ?? 50) + 8, 0, 100);
  state.message = `Trade proposed with ${kingdom.name}. Gold gained, relations improved.`;
  return true;
}

export function negotiatePact(state: GameState, kingdomId: string): boolean {
  if (state.gameMode !== 'campaign') return false;
  const kingdom = state.kingdoms.find((k) => k.id === kingdomId);
  if (!kingdom || kingdom.isDefeated) return false;
  if (state.court.influence < 20) {
    state.message = 'Not enough influence to negotiate a pact (need 20).';
    return false;
  }
  state.court.influence -= 20;
  kingdom.hostilityTimer = 0;
  kingdom.relations = clamp((kingdom.relations ?? 50) + 12, 0, 100);
  // Remove any pending dynasty-attack from this kingdom
  state.scheduledCampaignEvents = state.scheduledCampaignEvents.filter(
    (e) => !(e.type === 'dynasty-attack' && e.sourceKingdomId === kingdomId && !e.resolved),
  );
  state.message = `Non-aggression pact signed with ${kingdom.name}.`;
  return true;
}

export function demandTribute(state: GameState, kingdomId: string): boolean {
  if (state.gameMode !== 'campaign') return false;
  const kingdom = state.kingdoms.find((k) => k.id === kingdomId);
  if (!kingdom || kingdom.isDefeated) return false;

  if (isKingdomWeak(kingdom, state)) {
    state.resources.gold += 40;
    kingdom.relations = clamp((kingdom.relations ?? 50) - 20, 0, 100);
    state.message = `${kingdom.name} pays tribute. Gold gained, but relations soured.`;
  } else {
    kingdom.relations = clamp((kingdom.relations ?? 50) - 30, 0, 100);
    kingdom.hostilityTimer = Math.max(0, Math.floor((kingdom.hostilityTimer ?? 0) / 2));
    state.message = `${kingdom.name} refuses tribute and is angered. Relations fell sharply.`;
  }
  return true;
}
