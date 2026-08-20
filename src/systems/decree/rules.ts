import type { GameState, Land } from '../../state/types';

/**
 * The rule layer of Chiếu Chỉ.
 *
 * A decree that changes a *number* goes through `CourtModifier` and is summed by
 * `getCourtBonuses`. A decree that changes a *rule* comes through here instead, and is read at the
 * site it changes — the same shape `ascent/DoctrineSystem.ts` already uses for power-card rules.
 *
 * This is not a style preference. A new `CourtModifier` key has to be added in four places at
 * once — the interface in `types.ts`, the hardcoded `modifierKeys` allow-list in
 * `PoliticsSystem.ts`, the `CourtBonuses` interface, and the accumulator in `getCourtBonuses` —
 * and missing any one of them stores the field and then silently never reads it. There is no way
 * to express "the capital moves" or "the gacha's pity counter drops" as a summed float anyway.
 *
 * Every reader takes `GameState` and answers one question. Callers stay honest: the rule is read
 * where it applies, so the decree cannot drift away from the thing it claims to do.
 */

/** True when this decree is standing. The single primitive everything below is built on. */
export function hasDecree(state: GameState, id: string): boolean {
  return Boolean(state.mandate?.edicts.includes(id));
}

// ── Economy ─────────────────────────────────────────────────────────────────

/**
 * Ngụ binh ư nông — soldiers to the fields.
 *
 * A host standing idle stops drawing supplies and starts adding food. The trade is on the other
 * side: `recalledHostPenalty` below. Lý, Trần and Lê all ran this, rotating the army home for the
 * fifth and tenth month harvests, and it is the reason Đại Việt could field armies it could not
 * otherwise have fed.
 */
export function farmsWhenIdle(state: GameState): boolean {
  return hasDecree(state, 'ngu-binh-u-nong');
}

/** Food a single idle host brings in per tick under ngụ binh ư nông. */
export const IDLE_HOST_FOOD = 2;

/**
 * Seasons a host must stand still before it counts as being out in the fields.
 *
 * The Lý and Trần rotated the army home for the fifth- and tenth-month harvests — a season's work,
 * not an afternoon's. Mechanically it is what stops an ordinary march from being priced as a
 * recall: without it the autopilot's constant repositioning meant every host in the realm sat
 * permanently at three-quarters strength, which broke the wave-tracking, attack-order and boss
 * -telegraph checks in `verify-ascent` all at once.
 */
export const FARMING_AFTER = 3;

/** True when this host has been still long enough to be working the land. */
export function isFarming(state: GameState, idleTicks: number | undefined): boolean {
  return farmsWhenIdle(state) && (idleTicks ?? 0) >= FARMING_AFTER;
}

/** What a host called back off the fields fights at for its first wave. */
export function recalledHostPenalty(state: GameState): number {
  return farmsWhenIdle(state) ? 0.75 : 1;
}

/**
 * Hạn điền, 1397 — the land limit.
 *
 * Caps the richest provinces and hands the difference to the poorest. Flattens the snowball and
 * rescues a bad map, at the cost of the merchants and gentry whose estates are being broken up.
 */
export function landLimit(state: GameState): boolean {
  return hasDecree(state, 'han-dien');
}

/** Provinces at the top that are capped, and at the bottom that receive. */
export const LAND_LIMIT_COUNT = 3;

/**
 * Thông bảo hội sao, 1396 — paper money.
 *
 * Lifts the gold soft cap entirely, and makes the treasury rot whenever the realm is unsteady.
 * Hồ Quý Ly's currency was backed by decree and nothing else, and the country would not hold it.
 */
export function paperMoney(state: GameState): boolean {
  return hasDecree(state, 'thong-bao-hoi-sao');
}

export const PAPER_MONEY_DECAY = 0.05;
export const PAPER_MONEY_STABLE_ABOVE = 55;

/**
 * Hà đê sứ, 1248 — the dike office. Water and rice ground stops fearing the season.
 *
 * `le-thuy-loi` ratified realm-wide does the same thing by a different route: the irrigation
 * compacts written down are the villages' own version of the office. Both answer here so the
 * season code has one question to ask rather than two.
 */
export function dikeOffice(state: GameState): boolean {
  return hasDecree(state, 'ha-de-su') || hasDecree(state, 'le-thuy-loi');
}

/** Lệ giáp binh ratified: every commune keeps its own watch. */
export function villageWatch(state: GameState): boolean {
  return hasDecree(state, 'le-giap-binh');
}

export const VILLAGE_WATCH_MILITIA = 1.4;

/**
 * Hịch tướng sĩ, 1284 — read out to the assembled host.
 *
 * For one wave the army is half again as strong and cannot break. Trần Hưng Đạo's proclamation is
 * the loudest single thing the throne can do, and it lapses like every other hịch: `OfferSystem`
 * stamps an expiry, `tickTemporaryDecrees` takes it off.
 */
export function proclamationInForce(state: GameState): boolean {
  return hasDecree(state, 'hich-tuong-si');
}

export const HICH_POWER_BONUS = 0.5;

/** Dụ tị nạn — the court has withdrawn; the capital cannot fall while it stands. */
export function courtInRefuge(state: GameState): boolean {
  return hasDecree(state, 'du-ti-nan');
}

/**
 * Sắc phong công thần — a champion raised to the nobility cannot be let go.
 *
 * The ennoblement is the point: rank you cannot revoke is rank that means something. It also
 * closes the obvious exploit, which is ennobling a champion for the stat lift and then dismissing
 * them to clear the payroll.
 */
export function ennobled(hero: { traits?: string[] }): boolean {
  return Boolean(hero.traits?.includes('ennobled'));
}

/** Hình thư — the written code. Court crises land at half force. */
export function writtenCodeSeverity(state: GameState): number {
  return hasDecree(state, 'hinh-thu') ? 0.5 : 1;
}

/** Sùng Phật — the sangha is kept, and keeps the realm steady in return. */
export function sanghaPatronage(state: GameState): boolean {
  return hasDecree(state, 'sung-phat');
}

// ── Heroes and the court ────────────────────────────────────────────────────

/**
 * Chiếu cầu hiền — seeking the worthy.
 *
 * The first decree in the game that touches the gacha. Pity comes sooner and the good tiers
 * weigh heavier; in exchange every champion on the payroll costs half again as much, because a
 * court that advertises for talent gets talent that knows its price.
 */
export function seekingTheWorthy(state: GameState): boolean {
  return hasDecree(state, 'chieu-cau-hien');
}

export const SEEKING_PITY_BONUS = 2;
export const SEEKING_TIER_WEIGHT = 1.5;
export const SEEKING_UPKEEP_MULT = 1.4;

/**
 * Khoa cử — the examinations.
 *
 * A second talent pipeline that is not the gacha at all: every `EXAM_INTERVAL` ticks the hall
 * mints a champion outright, and how good they are is Sĩ standing rather than luck. The whole
 * point is that it is *deterministic* — a player who has been governing well can plan on it.
 */
export function examinations(state: GameState): boolean {
  return hasDecree(state, 'khoa-cu');
}

export const EXAM_INTERVAL = 15;

/** Thái ấp — a seated hero governs directly: twice the effect, half the province's yield. */
export function princelyFiefs(state: GameState): boolean {
  return hasDecree(state, 'thai-ap');
}

// ── Land, war and the wave ──────────────────────────────────────────────────

/** Đồn điền — a taken province settles at once, garrisoned rather than productive. */
export function militaryColonies(state: GameState): boolean {
  return hasDecree(state, 'don-dien');
}

/** Nam tiến — the march south. Frontier ground is cheap, and taking it charges less Ambition. */
export function marchSouth(state: GameState): boolean {
  return hasDecree(state, 'nam-tien');
}

export const NAM_TIEN_AMBITION_MULT = 0.5;

/**
 * Sát Thát — the arm tattoos of 1285.
 *
 * Hosts stop breaking, and stop being replaceable. Trần soldiers cut "kill the Mongols" into
 * their own forearms before the second invasion; men who will not run are also men you cannot
 * simply raise more of.
 */
export function tattooedArms(state: GameState): boolean {
  return hasDecree(state, 'sat-that');
}

export const SAT_THAT_ROUT_FLOOR = 20;
export const SAT_THAT_RECRUIT_MULT = 0.85;

/** Hình thư, 1042 — the first code. Crises land at half force and stability has a floor. */
export function writtenCode(state: GameState): boolean {
  return hasDecree(state, 'hinh-thu');
}

export const HINH_THU_STABILITY_FLOOR = 30;

/** Sổ đinh — the registry. Every province legible, whether or not you have seen it. */
export function registryTallies(state: GameState): boolean {
  return hasDecree(state, 'so-dinh');
}

/**
 * Lệ làng — the village custom recognised.
 *
 * The country obeys, and stops being governable. Every future law costs one more weight, so this
 * is the decree that trades away your own ability to legislate for the obedience you already
 * needed. Read by `standingWeight`, which is why it is a rule and not a modifier.
 */
export function villageCustom(state: GameState): boolean {
  return hasDecree(state, 'le-lang');
}

// ── Province-level ──────────────────────────────────────────────────────────

/** Provinces a `sắc` has bound a tutelary spirit to, with the hero it names. */
export function tutelaryOf(state: GameState, land: Land): string | undefined {
  return state.mandate?.tutelary?.[land.id];
}

/**
 * What a province gains from the spirit it keeps.
 *
 * A tutelary investiture is meant to be permanent — "it never forgets them" — so it cannot be a
 * one-off bump to compliance that the ordinary drift erases within twenty seasons. This is the
 * standing half: the ground a deified champion watches over simply produces more, for as long as
 * the realm holds it.
 */
export const TUTELARY_OUTPUT_MULT = 1.25;

export function tutelaryOutputMult(state: GameState, land: Land): number {
  return tutelaryOf(state, land) ? TUTELARY_OUTPUT_MULT : 1;
}
