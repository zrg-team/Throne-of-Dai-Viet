import type { CourtModifier, EraId, EstateId, ResourceBag, SchoolId } from '../state/types';

export type EdictBranch = 'war' | 'economy' | 'governance';

/**
 * Which chancery instrument a row is.
 *
 * The imperial chancery did not issue one kind of document and neither does the throne here. The
 * five forms differ in *reach and lifetime*, not in strength, which is what lets one catalogue
 * produce five different kinds of moment:
 *
 * - `edict` — chiếu 詔. A standing law addressed to the whole realm. Permanent, carries weight.
 * - `wonder` — a funded megaproject. Permanent, but built rather than proclaimed, so it is barely
 *   resented: weight 1 across the board.
 * - `sac` — sắc 敕. Investiture. Targets one hero or one province, never the realm.
 * - `du` — dụ 諭. An admonition for a live crisis. Expires, and returns its weight when it does.
 * - `hich` — hịch 檄. The proclamation before battle. One wave, then gone.
 * - `le` — lệ 例. A village custom, proposed *to* the throne rather than issued by it.
 */
export type ProjectKind = 'edict' | 'wonder' | 'sac' | 'du' | 'hich' | 'le';

/**
 * What play must have produced before the throne can even consider a project (Dragon Ascent).
 *
 * This is what turns the edict list from a fixed menu into something the run *grows*: capture
 * land and the registry edicts appear, seat a legendary and the imperial ones do, see a story
 * to its end and the court starts quoting it. Era remains a second gate on top.
 */
export type ProjectUnlock =
  | { kind: 'level'; level: number }
  | { kind: 'lands'; count: number }
  | { kind: 'seat'; rarity: 'Epic' | 'Legendary' }
  | { kind: 'chronicle'; count: number }
  | { kind: 'waves'; count: number }
  /**
   * A specific champion, serving somewhere — the decree only they could have written.
   *
   * The pairings are the historical record rather than a design convenience: Trần Hưng Đạo wrote
   * the Hịch tướng sĩ in 1284, Nguyễn Trãi the Bình Ngô đại cáo in 1428, Chu Văn An spent his life
   * on the examinations. Drawing that champion is what puts their document in reach, which is the
   * strongest wire the decree system has into the roster — and it survives their death, because a
   * law once written does not un-write itself.
   */
  | { kind: 'hero'; heroId: string };

/**
 * A permanent realm upgrade. Edicts are bought with Mandate edict-points; Wonders
 * are bought with resources. Both apply a permanent CourtModifier (aggregated by
 * computeCourtBonuses) and are gated behind an era.
 */
export interface RealmProject {
  id: string;
  kind: ProjectKind;
  branch: EdictBranch;
  era: EraId;
  /** Edict-point cost (edicts only). */
  edictCost?: number;
  /** Resource cost (wonders only). */
  resourceCost?: Partial<ResourceBag>;
  /**
   * Mutually-exclusive choice group: enacting any project in a group permanently locks the
   * others, so an era's edict is a real branching decision that differentiates runs.
   */
  exclusiveGroup?: string;
  /** Achievement gate on top of the era gate. Projects carrying one exist only in Dragon Ascent. */
  unlock?: ProjectUnlock;
  /**
   * What carrying this law costs the throne's authority, 1–3.
   *
   * The realm can only hold so much standing law at once — see `authorityCap` in `DecreeSystem`.
   * Past that the country simply stops listening, which is Hồ Quý Ly's reign expressed as a
   * number: between 1396 and 1397 he issued the most intelligent legislation in Vietnamese
   * history and none of it was obeyed, so when the Ming crossed the border in 1406 there was no
   * realm left underneath the laws.
   *
   * Wonders sit at 1 on purpose. A canal is built, not proclaimed; nobody resents a canal.
   */
  weight: number;
  /** Who this pleases and who it angers, as standing deltas applied once on enactment. */
  estates: Partial<Record<EstateId, number>>;
  /** School of statecraft, for the capstone tallies. Wonders belong to one too. */
  school?: SchoolId;
  /** The permanent bonus applied when enacted (CourtModifier payload sans id/label). */
  modifier: Omit<CourtModifier, 'id' | 'label' | 'remainingTicks'>;
}

export const REALM_PROJECTS: RealmProject[] = [
  // ── Edicts · War ──
  { id: 'levy-reform', kind: 'edict', branch: 'war', era: 'founding', edictCost: 1, weight: 1, school: 'binh', estates: { vo: 8, nong: -5 }, modifier: { recruitSpeedModifier: 0.3 } },
  // Rivalry war: a branching choice — drill veterans OR mobilise faster/cheaper.
  { id: 'iron-discipline', kind: 'edict', branch: 'war', era: 'rivalry', edictCost: 1, exclusiveGroup: 'war-rivalry', weight: 1, school: 'binh', estates: { vo: 8, nong: -4 }, modifier: { armyXpModifier: 0.5 } },
  { id: 'martial-drills', kind: 'edict', branch: 'war', era: 'rivalry', edictCost: 1, exclusiveGroup: 'war-rivalry', weight: 1, school: 'binh', estates: { vo: 8, thuong: -5 }, modifier: { recruitSpeedModifier: 0.5, recruitmentSupplyCostModifier: -0.2 } },
  { id: 'standing-army', kind: 'edict', branch: 'war', era: 'empires', edictCost: 2, weight: 2, school: 'binh', estates: { vo: 10, thuong: -6 }, modifier: { armyGoldUpkeepModifier: -0.3, armyLevelCapBonus: 1 } },
  { id: 'imperial-guard', kind: 'edict', branch: 'war', era: 'mandate', edictCost: 3, weight: 3, school: 'binh', estates: { vo: 12, nong: -8 }, modifier: { armyLevelCapBonus: 1, armyXpModifier: 0.5, recruitSpeedModifier: 0.3 } },

  // ── Edicts · Economy ──
  { id: 'land-survey', kind: 'edict', branch: 'economy', era: 'founding', edictCost: 1, weight: 1, school: 'nho', estates: { si: 6, nong: 2, thuong: -6 }, modifier: { resourceRateModifier: { food: 2, supplies: 1 } } },
  // Rivalry economy: trade coin OR agrarian growth.
  { id: 'coin-reform', kind: 'edict', branch: 'economy', era: 'rivalry', edictCost: 1, exclusiveGroup: 'econ-rivalry', weight: 1, school: 'phap', estates: { thuong: 10, nong: -5 }, modifier: { marketGoldOutputModifier: 0.3 } },
  { id: 'agrarian-focus', kind: 'edict', branch: 'economy', era: 'rivalry', edictCost: 1, exclusiveGroup: 'econ-rivalry', weight: 1, school: 'phat', estates: { nong: 10, thuong: -4 }, modifier: { resourceRateModifier: { food: 3, humans: 1 } } },
  { id: 'tribute-system', kind: 'edict', branch: 'economy', era: 'empires', edictCost: 2, weight: 2, school: 'phap', estates: { thuong: 8, si: 3, nong: -6 }, modifier: { resourceRateModifier: { gold: 3 } } },
  { id: 'golden-age', kind: 'edict', branch: 'economy', era: 'mandate', edictCost: 3, weight: 3, school: 'phap', estates: { thuong: 12, nong: -6 }, modifier: { marketGoldOutputModifier: 0.4, resourceRateModifier: { gold: 4 } } },

  // ── Edicts · Governance ──
  { id: 'meritocracy', kind: 'edict', branch: 'governance', era: 'founding', edictCost: 1, weight: 1, school: 'nho', estates: { si: 10, vo: -4 }, modifier: { buildingCostModifier: -0.15, buildSpeedBonus: 1 } },
  // Rivalry governance: count the people OR launch public works.
  { id: 'census', kind: 'edict', branch: 'governance', era: 'rivalry', edictCost: 1, exclusiveGroup: 'gov-rivalry', weight: 1, school: 'phap', estates: { si: 8, nong: -6 }, modifier: { resourceRateModifier: { humans: 3 } } },
  { id: 'public-works', kind: 'edict', branch: 'governance', era: 'rivalry', edictCost: 1, exclusiveGroup: 'gov-rivalry', weight: 1, school: 'phat', estates: { nong: 8, si: 4, thuong: -4 }, modifier: { buildingCostModifier: -0.2, buildSpeedBonus: 1, upgradeSpeedBonus: 1 } },
  { id: 'grand-secretariat', kind: 'edict', branch: 'governance', era: 'empires', edictCost: 2, weight: 2, school: 'nho', estates: { si: 12, vo: -5 }, modifier: { courtCardSpeedModifier: 0.4, acquisitionCostModifier: -0.2 } },
  // The other way to widen the claim cap, for a player who did not draw the Surveyors' Corps.
  // `claimSlotBonus` is inert outside Dragon Ascent, where claiming has never been capped.
  { id: 'surveyors-charter', kind: 'edict', branch: 'governance', era: 'empires', edictCost: 2, weight: 2, school: 'nho', estates: { si: 8, nong: -4 }, modifier: { claimSlotBonus: 1 } },
  { id: 'great-code', kind: 'edict', branch: 'governance', era: 'mandate', edictCost: 3, weight: 3, school: 'nho', estates: { si: 14, nong: 4, vo: -6 }, modifier: { courtCardSpeedModifier: 0.5, resourceRateModifier: { humans: 4 }, buildingCostModifier: -0.1 } },

  // ── Edicts earned by play (Dragon Ascent) ──
  //
  // None of these are reachable from the era track alone: each appears the moment the run
  // produces the thing it is written about. Conquest feeds the registry line, waves feed the
  // veteran line, champions at court feed the imperial line, and finished chronicle stories
  // feed the scholarly line.

  // War — survival and champions.
  { id: 'veterans-of-the-waves', kind: 'edict', branch: 'war', era: 'founding', edictCost: 2, unlock: { kind: 'waves', count: 4 }, weight: 2, school: 'binh', estates: { vo: 10, nong: -4 }, modifier: { armyPowerModifier: 0.08 } },
  { id: 'iron-quenching', kind: 'edict', branch: 'war', era: 'rivalry', edictCost: 3, unlock: { kind: 'waves', count: 8 }, weight: 3, school: 'binh', estates: { vo: 12, nong: -6 }, modifier: { armyLevelCapBonus: 1, armyPowerModifier: 0.05 } },
  { id: 'hero-banner', kind: 'edict', branch: 'war', era: 'rivalry', edictCost: 3, unlock: { kind: 'seat', rarity: 'Legendary' }, weight: 3, school: 'binh', estates: { vo: 12, si: -4 }, modifier: { armyPowerModifier: 0.1 } },
  { id: 'proving-grounds', kind: 'edict', branch: 'war', era: 'founding', edictCost: 1, unlock: { kind: 'level', level: 4 }, weight: 1, school: 'binh', estates: { vo: 8 }, modifier: { armyXpModifier: 0.3 } },

  // Economy — conquest and growth.
  { id: 'spoils-doctrine', kind: 'edict', branch: 'economy', era: 'founding', edictCost: 1, unlock: { kind: 'lands', count: 4 }, weight: 1, school: 'binh', estates: { vo: 6, thuong: 4, nong: -6 }, modifier: { resourceRateModifier: { gold: 2, supplies: 2 } } },
  { id: 'frontier-markets', kind: 'edict', branch: 'economy', era: 'rivalry', edictCost: 2, unlock: { kind: 'lands', count: 8 }, weight: 2, school: 'phap', estates: { thuong: 10, nong: -4 }, modifier: { marketGoldOutputModifier: 0.25, acquisitionCostModifier: -0.15 } },
  { id: 'granary-network', kind: 'edict', branch: 'economy', era: 'founding', edictCost: 2, unlock: { kind: 'level', level: 6 }, weight: 2, school: 'phat', estates: { nong: 10 }, modifier: { resourceRateModifier: { food: 4 } } },
  { id: 'scholars-of-the-chronicle', kind: 'edict', branch: 'economy', era: 'rivalry', edictCost: 2, unlock: { kind: 'chronicle', count: 2 }, weight: 2, school: 'nho', estates: { si: 10 }, modifier: { courtCardSpeedModifier: 0.25, resourceRateModifier: { gold: 2 } } },

  // Governance — stories, ministers, and the widening registry.
  { id: 'oral-histories', kind: 'edict', branch: 'governance', era: 'founding', edictCost: 1, unlock: { kind: 'chronicle', count: 1 }, weight: 1, school: 'phat', estates: { si: 6, nong: 6 }, modifier: { courtCardSpeedModifier: 0.2, resourceRateModifier: { humans: 2 } } },
  { id: 'ministers-council', kind: 'edict', branch: 'governance', era: 'rivalry', edictCost: 2, unlock: { kind: 'seat', rarity: 'Epic' }, weight: 2, school: 'nho', estates: { si: 10, vo: -4 }, modifier: { courtCardSpeedModifier: 0.3 } },
  { id: 'wide-registry', kind: 'edict', branch: 'governance', era: 'empires', edictCost: 3, unlock: { kind: 'lands', count: 10 }, weight: 3, school: 'phap', estates: { si: 8, nong: -6 }, modifier: { claimSlotBonus: 1, acquisitionCostModifier: -0.1 } },
  { id: 'mandarin-exams', kind: 'edict', branch: 'governance', era: 'rivalry', edictCost: 2, unlock: { kind: 'level', level: 8 }, weight: 2, school: 'nho', estates: { si: 12, vo: -5 }, modifier: { buildingCostModifier: -0.15, resourceRateModifier: { humans: 3 } } },

  // ══ Chiếu 詔 — standing law that changes a RULE, not a percentage ═════════
  //
  // Everything above this line is a multiplier on the realm's own economy or army. Everything
  // below changes how the game is *played*: where the capital sits, how the gacha draws, what an
  // invader takes when it wins, what an idle host costs. Each carries a `modifier` only where a
  // number is genuinely part of the law; the rule half is read at its call site through
  // `systems/decree/rules.ts`, never through a new `CourtModifier` key.
  //
  // Each is grounded in a real reign. The history is not decoration — it is where the trade came
  // from, and a decree whose upside and downside were invented together tends to have neither.

  // Lý Thái Tổ, 1010. The Edict on the Transfer of the Capital.
  { id: 'chieu-doi-do', kind: 'edict', branch: 'governance', era: 'rivalry', edictCost: 2, weight: 2, school: 'nho', estates: { si: 8, thuong: 8, nong: -10 }, modifier: {} },
  // Lý–Trần–Lê standing policy: soldiers farmed in peacetime and rotated back for the harvest.
  { id: 'ngu-binh-u-nong', kind: 'edict', branch: 'economy', era: 'founding', edictCost: 2, weight: 2, school: 'phat', estates: { nong: 12, thuong: 6, vo: -10 }, modifier: {} },
  // Hồ Quý Ly, 1397. Noble estates capped at ten mẫu, the surplus confiscated and redistributed.
  { id: 'han-dien', kind: 'edict', branch: 'economy', era: 'rivalry', edictCost: 2, exclusiveGroup: 'land-tenure', weight: 3, school: 'phap', estates: { nong: 14, thuong: -12, si: -6 }, modifier: {} },
  // Hồ Quý Ly, 1397. Bondsmen capped; the freed hands became taxable people.
  { id: 'han-no', kind: 'edict', branch: 'economy', era: 'rivalry', edictCost: 2, exclusiveGroup: 'land-tenure', weight: 2, school: 'phap', estates: { nong: 10, thuong: -10 }, modifier: { resourceRateModifier: { humans: 4 } } },
  // Hồ Quý Ly, 1396. Thông bảo hội sao — the first paper currency, and metal coin banned to force it.
  { id: 'thong-bao-hoi-sao', kind: 'edict', branch: 'economy', era: 'empires', edictCost: 3, weight: 3, school: 'phap', estates: { thuong: 14, nong: -8, si: -8 }, modifier: {} },
  // Lý Nhân Tông 1075, systematised by Lê Thánh Tông. The examinations.
  { id: 'khoa-cu', kind: 'edict', branch: 'governance', era: 'rivalry', edictCost: 2, weight: 2, unlock: { kind: 'hero', heroId: 'real-chu-van-an' }, school: 'nho', estates: { si: 14, vo: -8 }, modifier: {} },
  // Quang Trung, after Hán Cao Tổ's edict seeking the virtuous.
  { id: 'chieu-cau-hien', kind: 'edict', branch: 'governance', era: 'founding', edictCost: 2, weight: 2, school: 'nho', estates: { si: 12, thuong: -6 }, modifier: {} },
  // Quang Trung, 1789. Schools founded in every prefecture, teaching in chữ Nôm.
  { id: 'chieu-lap-hoc', kind: 'edict', branch: 'governance', era: 'rivalry', edictCost: 2, weight: 2, school: 'nho', estates: { si: 12, nong: 6 }, modifier: { armyXpModifier: 1, courtCardSpeedModifier: 0.5 } },
  // Quang Trung, 1789. Chiếu khuyến nông — the fields returned to, and the fallow reopened.
  { id: 'chieu-khuyen-nong', kind: 'edict', branch: 'economy', era: 'founding', edictCost: 1, weight: 1, school: 'phat', estates: { nong: 12 }, modifier: { resourceRateModifier: { food: 4 } } },
  // Lý Thái Tông, 1042. The Hình Thư, Đại Việt's first written code.
  { id: 'hinh-thu', kind: 'edict', branch: 'governance', era: 'founding', edictCost: 2, weight: 1, school: 'nho', estates: { si: 10, nong: 8, vo: -6 }, modifier: {} },
  // Lê Thánh Tông, 1489. Thirteen đạo, 52 phủ, 178 huyện.
  { id: 'muoi-ba-dao', kind: 'edict', branch: 'governance', era: 'empires', edictCost: 2, weight: 2, school: 'nho', estates: { si: 12, vo: -6 }, modifier: { claimSlotBonus: 2 } },
  // Nguyễn dynasty. Sổ đinh and the tín bài tallies — everyone counted, everyone carrying a tag.
  { id: 'so-dinh', kind: 'edict', branch: 'governance', era: 'rivalry', edictCost: 2, weight: 2, unlock: { kind: 'hero', heroId: 'real-le-quy-don' }, school: 'phap', estates: { si: 10, vo: 6, nong: -10 }, modifier: { claimSlotBonus: 1, recruitmentSupplyCostModifier: -0.2 } },
  // Trần Thái Tông, 1248. The Hà đê sứ — a standing office for the dikes.
  { id: 'ha-de-su', kind: 'edict', branch: 'economy', era: 'founding', edictCost: 2, weight: 1, unlock: { kind: 'hero', heroId: 'quan-ha-de' }, school: 'phat', estates: { nong: 12 }, modifier: {} },
  // Lê Thánh Tông and the Nguyễn. Đồn điền — soldiers settled on the ground they took.
  { id: 'don-dien', kind: 'edict', branch: 'war', era: 'rivalry', edictCost: 2, weight: 2, school: 'binh', estates: { vo: 12, nong: -8 }, modifier: {} },
  // Trần dynasty. Thái ấp — princely fiefs held directly by the men who mattered.
  { id: 'thai-ap', kind: 'edict', branch: 'governance', era: 'rivalry', edictCost: 2, weight: 2, school: 'binh', estates: { vo: 10, si: 8, nong: -12 }, modifier: {} },
  // Phép vua thua lệ làng — the king's rule loses to the village's custom.
  { id: 'le-lang', kind: 'edict', branch: 'governance', era: 'founding', edictCost: 1, weight: 1, school: 'phat', estates: { nong: 14, si: -10 }, modifier: {} },
  // Lý–Trần Buddhism, and the monastics who staffed the early court.
  { id: 'sung-phat', kind: 'edict', branch: 'governance', era: 'founding', edictCost: 1, weight: 1, school: 'phat', estates: { nong: 10, thuong: -8 }, modifier: {} },
  // The Nam tiến — four centuries of southward expansion under the Lê and the Nguyễn.
  { id: 'nam-tien', kind: 'edict', branch: 'war', era: 'empires', edictCost: 3, weight: 3, school: 'binh', estates: { nong: 8, vo: 10, si: -12 }, modifier: { acquisitionCostModifier: -0.3 } },

  // ══ Sắc 敕 — investiture. Targets one person or one province, never the realm ══
  { id: 'sac-thanh-hoang', kind: 'sac', branch: 'governance', era: 'founding', edictCost: 1, weight: 1, school: 'phat', estates: { nong: 10, si: 6 }, modifier: {} },
  { id: 'sac-cong-than', kind: 'sac', branch: 'war', era: 'founding', edictCost: 1, weight: 1, school: 'binh', estates: { vo: 12, si: -6 }, modifier: {} },
  { id: 'cai-tho-quy-luu', kind: 'sac', branch: 'governance', era: 'rivalry', edictCost: 1, weight: 1, school: 'phap', estates: { si: 8, nong: -10 }, modifier: {} },
  { id: 'sac-phong-vuong', kind: 'sac', branch: 'governance', era: 'empires', edictCost: 2, weight: 2, school: 'nho', estates: { si: 8, thuong: 8, vo: -12 }, modifier: {} },

  // ══ Dụ 諭 — an admonition for a live crisis. Expires, and returns its weight ══
  { id: 'du-chan-te', kind: 'du', branch: 'economy', era: 'founding', weight: 0, school: 'phat', estates: { nong: 14, thuong: -8 }, modifier: {} },
  { id: 'du-thanh-da', kind: 'du', branch: 'war', era: 'founding', weight: 0, school: 'binh', estates: { vo: 10, nong: -12 }, modifier: {} },
  { id: 'du-dai-xa', kind: 'du', branch: 'governance', era: 'founding', edictCost: 1, weight: 0, school: 'phat', estates: {}, modifier: {} },
  { id: 'du-ti-nan', kind: 'du', branch: 'governance', era: 'founding', weight: 0, school: 'binh', estates: { si: -10, vo: -6 }, modifier: {} },

  // ══ Hịch 檄 — the proclamation before battle. One wave, then gone ══════════
  { id: 'hich-tuong-si', kind: 'hich', branch: 'war', era: 'founding', weight: 0, unlock: { kind: 'hero', heroId: 'real-tran-hung-dao' }, school: 'binh', estates: { vo: 14, nong: -20 }, modifier: {} },
  { id: 'hoi-nghi-dien-hong', kind: 'hich', branch: 'governance', era: 'founding', weight: 0, school: 'nho', estates: {}, modifier: {} },
  { id: 'sat-that', kind: 'hich', branch: 'war', era: 'rivalry', edictCost: 1, weight: 1, school: 'binh', estates: { vo: 14, nong: -10 }, modifier: {} },
  { id: 'binh-ngo-dai-cao', kind: 'hich', branch: 'governance', era: 'rivalry', weight: 0, unlock: { kind: 'hero', heroId: 'real-nguyen-trai' }, school: 'nho', estates: { si: 12, vo: 10 }, modifier: {} },

  // ══ Lệ 例 — a village custom, proposed TO the throne rather than issued by it ══
  { id: 'le-huong-am', kind: 'le', branch: 'governance', era: 'founding', weight: 1, school: 'phat', estates: { nong: 8 }, modifier: {} },
  { id: 'le-giap-binh', kind: 'le', branch: 'war', era: 'founding', weight: 1, school: 'phat', estates: { nong: 6, vo: 6 }, modifier: {} },
  { id: 'le-cho-phien', kind: 'le', branch: 'economy', era: 'founding', weight: 1, school: 'phat', estates: { thuong: 10, nong: -6 }, modifier: { marketGoldOutputModifier: 0.25 } },
  { id: 'le-thuy-loi', kind: 'le', branch: 'economy', era: 'founding', weight: 2, school: 'phat', estates: { nong: 10 }, modifier: {} },

  // ── Wonders (resource-funded megaprojects) ──
  { id: 'grand-canal', kind: 'wonder', branch: 'economy', era: 'rivalry', resourceCost: { gold: 240, supplies: 120 }, weight: 1, school: 'phat', estates: { nong: 10, thuong: 6 }, modifier: { resourceRateModifier: { food: 5, gold: 3 } } },
  { id: 'imperial-academy', kind: 'wonder', branch: 'governance', era: 'empires', resourceCost: { gold: 340, humans: 150 }, weight: 1, school: 'nho', estates: { si: 12, vo: 4 }, modifier: { armyXpModifier: 0.5, recruitSpeedModifier: 0.3 } },
  { id: 'heavenly-altar', kind: 'wonder', branch: 'war', era: 'mandate', resourceCost: { gold: 480, supplies: 220 }, weight: 1, school: 'phat', estates: { nong: 8, si: 8 }, modifier: { resourceRateModifier: { gold: 6, food: 6 }, marketGoldOutputModifier: 0.3 } },
];

export function getProject(id: string): RealmProject | undefined {
  return REALM_PROJECTS.find((p) => p.id === id);
}
