import type { AscentRarity } from '../state/types';

/**
 * Every tuning number for Dragon Ascent lives here, so the run's feel can be retuned
 * without touching logic. The design target: a Power Draft roughly every 30-60s, a wave
 * every ~40s, a Great Invasion every 4th wave, and a threat curve that outruns linear
 * growth so the player must compound their picks to survive.
 */

/** Economy tick length. Shorter than the classic 5500ms — this mode wants a brisker pulse. */
export const ASCENT_TICK_MS = 3500;

// ── Waves ───────────────────────────────────────────────────────────────────
export const WAVE_INTERVAL_TICKS = 12;
/**
 * Ticks of quiet before the first wave. The opening minute is for walking into empty
 * districts and raising a first host — a run that is under attack from tick one never gets
 * the compounding started, and the power curve has nothing to compound from.
 *
 * Trimmed from 16: with the old grace plus an 18-tick interval, a player two minutes into a
 * run had faced one or two waves while their economy had compounded ten-fold. The opening
 * needs to be a breather, not a holiday.
 */
export const WAVE_GRACE_TICKS = 10;
/** Every Nth wave is a named Great Invasion (the "boss"). */
export const BOSS_EVERY_N_WAVES = 4;
/** Ticks before a boss wave lands that the telegraph banner appears. */
export const BOSS_TELEGRAPH_TICKS = 2;
export const BASE_THREAT = 320;
/** Threat multiplies by this per wave — deliberately steeper than linear growth. */
export const THREAT_GROWTH = 1.14;
/** A Great Invasion hits this much harder than a regular wave of the same number. */
export const BOSS_THREAT_MULT = 1.65;
/**
 * Hosts spawned per wave. `launchOffMapInvasion` clamps a wave's *total* size to a multiple
 * of the player's own military — a deliberate anti-snowball guard in empire mode, but it
 * would make an endless run unloseable. More hosts raises that clamp's floor, so scaling the
 * coalition with the wave number is what actually escalates the pressure.
 */
export function waveHostCount(wave: number, boss: boolean): number {
  return Math.min(4, 1 + Math.floor(wave / 6) + (boss ? 1 : 0));
}

// ── Wave pressure: sizing a wave against what actually defends ───────────────
/**
 * Battle power one invader soldier is worth, derived from the spawn profile in
 * `launchOffMapInvasion` and the formula in `armyPower`:
 *
 *   unit mix 60/28/12  → 0.60×1 + 0.28×1.25 + 0.12×1.8 = 1.166
 *   morale 85, supply 90                                → ×0.85 ×0.90
 *   level 2, no elite tier, no general                  → ×1.08
 *   ────────────────────────────────────────────────────────────────
 *                                                         ≈ 0.963
 *
 * Used to convert a target *power* into a soldier budget. If either the spawn profile or
 * `armyPower` changes, this must change with them — `verify-ascent.mjs` asserts the spawned
 * power lands within a band of the target, which is what catches the drift.
 */
export const INVADER_POWER_PER_SOLDIER = 0.963;

/**
 * How many waves back the pressure curve reads the realm's defensive power.
 *
 * This lag *is* the difficulty design. Waves are sized from what the realm could field two
 * waves ago, so a strong run of Power Draft picks genuinely buys two easy waves before
 * pressure catches up — and coasting lets it close. Sizing against the live figure instead
 * would be a pure treadmill where no pick ever changes the outcome.
 */
export const WAVE_LAG = 2;
/** Share of current defence used before enough history exists to lag against. */
export const WAVE_OPENING_SHARE = 0.55;

/**
 * How much of the realm *beyond* the point of contact counts toward the defence a wave is
 * measured against. See `contestedDefencePower`.
 *
 * At 0 the curve reads only field hosts, which the autopilot caps at three — the wave budget
 * then flatlines while the realm grows, and a thirty-province empire is safer than a
 * five-province one. At 1 it reads every garrison the realm owns against a host that can only
 * attack one province, which quoted 98% odds for the entire back half of a run.
 *
 * 0.20 measured across a four-value sweep: threat keeps pace with expansion without a wide
 * realm being punished for simply existing. Second difficulty dial after `WAVE_PRESSURE_BASE`.
 */
export const REALM_DEFENCE_SHARE = 0.2;

/**
 * Wave 1 pressure, as a fraction of the lagged defensive power. **The mode's main difficulty
 * dial.**
 *
 * Re-measured after the denominator moved to `contestedDefencePower`, which made every old
 * reading obsolete. Against a competent player over five seeds: 0.40 → runs of 110-200 seasons,
 * all five ending in defeat; 0.33 → 150-320, one seed running out the clock. 0.36 sits between
 * them, which lands a run in the 10-18 minute band the mode is paced for while still finishing.
 *
 * A naive auto-player that always takes the first option survives roughly 350 seasons at this
 * setting, so the gap between playing badly and playing well is real but not a cliff.
 */
export const WAVE_PRESSURE_BASE = 0.36;
/** Added per wave, so late waves demand real compounding rather than a fixed tax. */
export const WAVE_PRESSURE_STEP = 0.035;
/**
 * Ceiling on pressure, in units of the realm's lagged defence.
 *
 * Re-derived once the response card began quoting the *real* battle model. That model resolves
 * on `attacker ≥ defender × siegeMult × Uniform(0.9, 1.1)`, so with an ordinary siege multiplier
 * of 0.85 a wave is a guaranteed loss the moment pressure exceeds `1.1 × 0.85 ≈ 0.94`, and a
 * guaranteed hold below `0.9 × 0.85 ≈ 0.77`.
 *
 * The old 1.3 sat far above that: it meant "auto-lose" for the whole late game. It survived
 * because the odds shown were an invented `power / (power + threat)` ratio that could not reach
 * zero and cheerfully reported ~30% for a fight the player could not win under any choice. Once
 * the card started telling the truth, whole response screens read 0% on every row.
 *
 * 0.95 puts the top of the curve just past the band — late waves are genuinely marginal and the
 * gold options decide them — rather than past the point of no return.
 */
export const WAVE_PRESSURE_MAX = 0.95;
/** A Great Invasion demands this much more than a regular wave of the same number. */
export const BOSS_PRESSURE_MULT = 1.35;
/** Floor so an early or freshly-crushed realm still faces something. */
export const MIN_WAVE_SOLDIERS = 260;
/**
 * Enemy hosts that may stand on the map at once, across every wave and raid.
 *
 * Waves are meant to arrive, be met, and leave — the gap between them is where the realm
 * rebuilds, expands and enjoys the map. Without a ceiling the midgame settled at four or five
 * concurrent invaders and simply never cleared, which is a siege, not a rhythm.
 */
export const MAX_LIVE_INVADER_HOSTS = 3;
/**
 * Best affordable odds at or above which an ordinary wave does not raise the response modal
 * at all — the realm simply meets it and the header strip reports the result.
 *
 * The mode's fantasy is watching a realm you built fight for you and stepping in at the
 * moments that decide things. A modal on every wave is the opposite of that, and measurement
 * showed those modals were empty anyway: the options differed by ~5 percentage points.
 */
export const RESPONSE_ASK_BELOW_WIN = 78;
/**
 * Share of the realm's contested defence that one Fortify purchase buys, permanently.
 * Large enough that the option is worth its price on any size of realm — see
 * `fortifyDefenceGain`, which converts this into points of provincial defence.
 */
export const FORTIFY_DEFENCE_SHARE = 0.18;
/** Floor for a tiny opening realm, where a share of very little is still nothing. */
export const FORTIFY_DEFENSE_MIN = 10;

// ── Raids ───────────────────────────────────────────────────────────────────
/**
 * Ticks between border raids. Raids are the run's background pressure: a single host that
 * pillages an outer district and withdraws, destroying a building as it goes. That permanent
 * income loss is what makes leaving the frontier undefended cost something between waves.
 */
export const RAID_INTERVAL_TICKS = 10;
/** Raids only begin once the realm is big enough to have a frontier worth raiding. */
export const RAID_MIN_LANDS = 3;
/** A raid host, as a share of the realm's field power. Background pressure, not a second wave. */
export const RAID_POWER_SHARE = 0.18;
/** Raids need their own floor; the wave floor is several times too large for a raiding party. */
export const MIN_RAID_SOLDIERS = 110;
/** Ticks before a wave in which no raid may be sent, so the two never stack on one province. */
export const RAID_WAVE_CLEARANCE = 4;

// ── Rival demands: the half of foreign affairs the player does not start ────
/** Seasons of gold income a tribute demand asks for. The recurring drain on a fat treasury. */
export const TRIBUTE_INCOME_MULT = 11;
/**
 * Ceiling on a tribute demand as a share of the treasury, so paying is always a choice the
 * player *can* make. Hurts — most of the coffers — without ever being impossible.
 */
export const TRIBUTE_TREASURY_CAP = 0.7;
/**
 * Seasons between tribute demands. 14 rather than 22: this is described as the recurring drain
 * on a fat treasury, and at the longer cooldown combined with a bar nobody could clear it fired
 * once in a five-hundred-season run — which is not a drain, it is an anecdote.
 */
export const TRIBUTE_COOLDOWN_TICKS = 14;
/** Seasons the next wave is pulled forward by refusing a demand — the refusal's teeth. */
export const TRIBUTE_REFUSE_TICKS = 4;
/** Dominance above which the world bands together against the leader. */
export const COALITION_DOMINANCE = 0.95;
export const COALITION_COOLDOWN_TICKS = 40;
/** Seasons of warning before a coalition lands, so preparing for it is possible. */
export const COALITION_LEAD_TICKS = 6;
/**
 * How strong a rival must be, relative to `contestedDefencePower`, before demanding submission.
 *
 * Calibrated from measurement, not intuition — twice now. An off-map empire's strength is its
 * `power` index (capped at 122) scaled by ×10, so it never dwarfs a realm outright and the
 * obvious-looking "must be 1.8× stronger" made this an unreachable branch.
 *
 * The denominator matters as much as the number. Measured against `getPlayerMilitary`, which
 * counts `defense × 10` for *every* province, the strongest rival fell from 0.75× the player at
 * four provinces to 0.24× at nineteen — so both branches went dark again the moment routine
 * expansion started working. Against `contestedDefencePower` the same run holds a steady
 * 0.25–0.49×, because that figure does not inflate with province count.
 *
 * Set to 0.38 rather than 0.45 after a third dark spell: 0.45 sat at the very top of that band,
 * so once Fortify began buying defence worth its price the strongest rival stopped clearing it
 * and submission demands vanished again. It must stay comfortably inside the band, and above
 * `TRIBUTE_POWER_RATIO` so the two demands keep addressing different rivals.
 */
export const VASSAL_POWER_RATIO = 0.22;
/**
 * How far a rival must tower over the *other* empires to count as a hegemon and demand
 * submission. Measured against its peers, not against the player, so the branch cannot go dark
 * every time the realm gets stronger — see `demandsSubmission`.
 *
 * 1.2 rather than 1.4: the world's empires stay broadly comparable for most of a run, and at
 * 1.4 the top power was rarely far enough ahead of the pack for the branch to fire at all. It
 * still means "clearly the strongest in the world", which is what a hegemon is.
 */
export const VASSAL_HEGEMON_MULT = 1.2;
/**
 * How strong a rival must be, against `contestedDefencePower`, to think extortion is worth
 * trying. Deliberately far below the submission bar.
 *
 * Tribute asks a *second-tier* power for money — anyone strong enough to demand your crown is
 * excluded and asks for that instead. Measured, the strongest rival runs 0.25-0.49× the realm
 * and the next one down sits well beneath that, so a 0.30 bar meant nobody was ever eligible:
 * tribute fired zero times across a full run, which cost the mode its single largest gold sink
 * and left a naive realm banking sixty seasons of income with nothing to buy.
 *
 * A neighbour does not need to match you to extort you. It needs to be able to hurt you.
 */
export const TRIBUTE_POWER_RATIO = 0.18;
export const VASSAL_COOLDOWN_TICKS = 60;
/** How much heavier an endured coalition's wave is than an ordinary one. */
export const COALITION_WAVE_MULT = 1.5;
/** Gold per season a vassal tithe drains, for as long as it stands. */
export const VASSAL_TITHE_GOLD = 8;

// ── Mercenaries: the treasury's way out ─────────────────────────────────────
/** Floor price, before the income peg takes over in a wealthy realm. */
export const MERCENARY_GOLD_BASE = 320;
/** Seasons of gold income a company costs. The realm's main gold sink. */
export const MERCENARY_INCOME_MULT = 9;
/** Company size as a share of the realm's field power — a real answer, not a token. */
export const MERCENARY_POWER_SHARE = 0.45;

/**
 * Loyalty a newly-taken province regains per season. At 1.2 a bribed province (68) reaches full
 * output in roughly 27 seasons and an intimidated one (50) in 42, against an envoy's 85 arriving
 * nearly settled — long enough that the method matters, short enough that it is a delay rather
 * than a punishment.
 */
export const LOYALTY_SETTLE_PER_TICK = 1.2;

// ── Administrative drag on a sprawling treasury ─────────────────────────────
/**
 * Gold income per season above which returns diminish, and how sharply. See the note in
 * `calculatePlayerResourceRates`.
 *
 * At 0.82 an unchecked income of ~9,500 a season becomes ~2,100 — still an order of magnitude
 * above the opening realm's, so growth is emphatically still rewarded, but no longer at a
 * rate that outruns every price in the mode within ten minutes.
 *
 * Trimmed from 0.85 once watchable battles began bleeding both sides properly: smaller
 * surviving armies draw less upkeep, so the same drag left more coin banked than before.
 */
export const GOLD_SOFTCAP_FROM = 500;
export const GOLD_SOFTCAP_EXPONENT = 0.82;

// ── Standing armies cost what they are worth ────────────────────────────────
/**
 * Gold and food each soldier draws per season, on top of the shared upkeep. See
 * `ascentArmyUpkeep`: the bill is multiplied by `1 + troops / ARMY_UPKEEP_SCALE`, so it grows
 * faster than the army does and a huge host is a genuine strategic burden rather than a free
 * win condition.
 *
 * Food is charged far more gently than gold. Granaries are small next to treasuries in this
 * economy — a food rate that reads +85 sits beside a gold rate in the thousands — so pricing
 * the two alike would starve a realm the moment it fielded anything.
 */
export const ARMY_GOLD_PER_SOLDIER = 0.02;
export const ARMY_FOOD_PER_SOLDIER = 0.005;
/** Troop count at which the upkeep multiplier reaches 2x. */
export const ARMY_UPKEEP_SCALE = 5000;

// ── Field battles you can watch ─────────────────────────────────────────────
/** Exchanges a small engagement runs; a large one runs up to the maximum. */
export const BATTLE_BASE_ROUNDS = 3;
export const BATTLE_MAX_ROUNDS = 5;
/**
 * Share of a host's strength at stake in one exchange, before the power ratio and posture
 * scale it. Tuned so a matched fight leaves both sides bloodied but standing after three
 * rounds, which is what makes retreating between them a real decision rather than a formality.
 */
export const BATTLE_ROUND_BITE = 0.11;
/** Fraction of its starting strength at which a host breaks and the engagement ends early. */
export const BATTLE_BREAK_SHARE = 0.35;
/**
 * What each posture trades. Pressing deals more and takes more; holding the line does the
 * reverse. Neither is strictly better, which is the point of offering the choice at all.
 */
export const BATTLE_PRESS_TRADE = { dealt: 1.35, taken: 1.3 };
export const BATTLE_HOLD_TRADE = { dealt: 0.8, taken: 0.72 };

// ── Momentum (XP) ───────────────────────────────────────────────────────────
/**
 * Momentum needed to reach `level + 1`. Superlinear, so early drafts come fast.
 *
 * Softened from `60 + 34 * level^1.35`. A full run was handing out only about ten Power Drafts,
 * which is a thin build for a roguelite — not enough picks to both see a variety of cards and
 * stack any of them into something that changes how the realm plays. The deck is the mode's
 * progression fantasy; ten picks is a sketch of one.
 */
export function xpToNextLevel(level: number): number {
  return Math.round(55 + 27 * Math.pow(Math.max(1, level), 1.3));
}
export const XP_PER_TICK_BASE = 13;
export const XP_PER_OWNED_LAND = 2;
export const XP_PER_LAND_TAKEN = 30;
export const XP_PER_BATTLE_WON = 15;
export const XP_PER_WAVE_SURVIVED = 45;
/** Skipping a draft converts it into momentum toward the next one. */
export const XP_SKIP_REFUND_SHARE = 0.3;

// ── Power Draft ─────────────────────────────────────────────────────────────
/**
 * Cards offered per draft. Four rather than three: a run lands roughly ten drafts, and at three
 * cards the deck it built came out to only four or five distinct powers — enough to stack, not
 * enough to feel like a build. Widening the table costs no extra interruptions.
 */
export const DRAFT_CARD_COUNT = 4;
export const BASE_DRAFT_WEIGHTS: Record<AscentRarity, number> = {
  bronze: 62,
  silver: 26,
  gold: 10,
  jade: 2,
};
export const REROLL_BASE_COST = 40;
/** Each reroll within the same draft doubles the price. */
export const REROLL_COST_MULT = 2;

// ── Hero summon ─────────────────────────────────────────────────────────────
export const SUMMON_CARD_COUNT = 3;
/** Every summon without a gold-or-better shifts weight toward the top rarities (soft pity). */
export const PITY_GOLD_STEP = 6;
export const PITY_JADE_STEP = 1.5;
/** A gold-or-better is guaranteed once pity reaches this. */
export const PITY_HARD_CAP = 8;
/** Mandate era thresholds are the natural summon beats; also grant one every N waves. */
export const SUMMON_EVERY_N_WAVES = 2;

// ── Autopilot ───────────────────────────────────────────────────────────────
/**
 * Target standing armies. Few and large beats many and small: hosts arrive and fight one at
 * a time, so splitting scarce manpower across two levies just loses two battles instead of
 * winning one. A small realm concentrates everything into a single host.
 */
export function targetArmyCount(ownedLands: number): number {
  // Never many: splitting manpower yields several hosts that each lose their own battle.
  // A small realm supports exactly one — two hosts on one province bankrupt its food and
  // supply income within a couple of seasons and neither can then be replaced.
  return Math.min(3, 1 + Math.floor(ownedLands / 3));
}
/**
 * Host size scales with the manpower actually available.
 *
 * A district's garrison is `defense * 16 + militia * 2.5` and grows as its population does,
 * so a fixed levy size falls behind the map within a few minutes — the realm then banks
 * thousands of idle peasants while its little armies bounce off the same walls forever.
 */
export function recruitSoldiers(availableHumans: number): number {
  return Math.max(MIN_ARMY_SOLDIERS, Math.min(MAX_ARMY_SOLDIERS, Math.floor(availableHumans * 0.8)));
}
export const MIN_ARMY_SOLDIERS = 320;
/** Below this share of a full host an army is a remnant: disbanded and recycled into manpower. */
export const REMNANT_SHARE = 0.45;
export const MAX_ARMY_SOLDIERS = 2200;
// ── Famine ──────────────────────────────────────────────────────────────────
/**
 * The one gap rule famine *does* respect. It is exempt from `MIN_GAP_TICKS` because the crisis
 * is transient and expensive, but it must never land on the tick straight after another card —
 * that is the modal chaining the gap rule exists to prevent.
 */
export const FAMINE_MIN_GAP_TICKS = 2;
/** Seasons before the famine card may be raised again, so a long shortage is not prompt spam. */
export const FAMINE_COOLDOWN_TICKS = 14;
/** Seasons of the current deficit one relief action covers. Enough to actually turn it around. */
export const FAMINE_GRAIN_SEASONS = 18;
/**
 * Gold per unit of imported grain. Priced so that relieving a serious famine costs a serious
 * amount of coin — this is the mode's one sink that scales with how badly things are going
 * rather than with income, and a treasury that has outgrown every other price still feels it.
 */
export const FAMINE_GOLD_PER_FOOD = 14;
/**
 * Most of the treasury one grain shipment may cost. Keeps relief a serious expense without ever
 * letting it empty the coffers the player also needs for walls, companies and tribute.
 */
export const FAMINE_TREASURY_CAP = 0.35;
/** Supplies burned per unit of food when the herds are driven to slaughter. */
export const FAMINE_HERD_SUPPLY_RATE = 0.8;
/** Morale each host loses when the realm eats its baggage train. */
export const FAMINE_REQUISITION_MORALE = 12;

// ── Scarcity pricing: what the autopilot should build next ──────────────────
/**
 * Seasons of runway below which a resource is a crisis, and how much its build value is
 * multiplied when it is. At crisis level food outscores gold by more than two to one, which is
 * the whole point — see `outputWeights`.
 */
export const SCARCITY_CRISIS_SEASONS = 3;
export const SCARCITY_CRISIS_MULT = 8;
/** The softer band: running down, but not yet an emergency. */
export const SCARCITY_WARNING_SEASONS = 10;
export const SCARCITY_WARNING_MULT = 3;
/**
 * Seasons of income banked past which more gold is worth building less of. A treasury this
 * deep has already outrun every sink the mode offers.
 */
export const GOLD_GLUT_SEASONS = 25;

/** Humans kept in reserve so recruiting never starves the workforce. */
export const RECRUIT_HUMAN_RESERVE = 80;
/**
 * Share of a host's intended baggage train the realm must actually be able to hand over
 * before the autopilot will muster it at all. Below this the levy starves faster than it can
 * fight — see the sawtooth described in `raiseHostNow`.
 */
export const MIN_MUSTER_SUPPLY_SHARE = 0.35;
// ── Routine expansion: the claims that are not decisions ────────────────────
/**
 * Odds at or above which the autopilot will spend spare coin on an adjacent village.
 *
 * A 0-1 fraction matching `getBribeSuccessChance`. Set from measurement rather than intuition:
 * the constant's own ceiling is 0.9, but observed chances across a full run run 0.43-0.66,
 * because `getNoblePower` is high on nearly every settled province. A threshold above that band
 * rejected 215 of 240 ticks and the feature never fired at all.
 *
 * So this is explicitly *not* "only automate the sure things" — no sure thing exists here. It
 * is "only automate the cheap things": paired with `AUTO_CLAIM_TREASURY_SHARE`, a failed bribe
 * costs coin the realm demonstrably did not need, and repeated attempts convert an idle
 * treasury into ground. Provinces worth a real decision are still the player's, on their card.
 */
export const AUTO_CLAIM_MIN_CHANCE = 0.55;
/**
 * Most of the treasury a single routine purchase may spend. Keeps automatic expansion to money
 * the realm plainly does not need, and never to coin the player may want for a wave.
 */
export const AUTO_CLAIM_TREASURY_SHARE = 0.22;
/** Claims in flight at once, so the realm digests what it takes. */
export const AUTO_CLAIM_MAX_ORDERS = 2;
/**
 * Seasons between routine purchases.
 *
 * The single most sensitive number in the mode, because every province the realm swallows also
 * enlarges the wave sized against it (see `REALM_DEFENCE_SHARE`). Without any spacing the
 * autopilot bought a village every tick it could afford one, reached fourteen provinces by
 * season 24 and was flattened by season 62. Measured at 5 a naive run died at season 75; at 9
 * it reached 399 but a competent run peaked at fourteen provinces and fell by 140; at 14 both
 * survived comfortably but few runs ever concluded. 12 keeps expansion digestible while still
 * letting most runs reach an ending.
 */
export const AUTO_CLAIM_INTERVAL_TICKS = 12;

/** Gold kept back so a reroll is usually affordable. */
export const AUTOBUILD_GOLD_RESERVE = 30;
/** Seasons of rations and provisions the autopilot keeps in each host's baggage train. */
export const SUPPLY_TICKS_HELD = 18;
/** Realm stores kept back so feeding the army never starves the provinces. */
export const SUPPLY_FOOD_RESERVE = 40;
export const SUPPLY_STORE_RESERVE = 30;
/** When threat/power exceeds this, the autopilot prioritises walls and barracks over economy. */
export const DEFENSIVE_POSTURE_RATIO = 0.8;
/**
 * A host will not storm a province below these odds; it holds at the border instead while
 * the realm keeps compounding. Without this the autopilot feeds army after army into the
 * same walls and the run never expands — and it turns the power curve into the thing that
 * unlocks the map, which is the whole point of the mode.
 */
export const MARCH_MIN_WIN_CHANCE = 40;
/**
 * Seasons the capital may stay in enemy hands before the dynasty falls.
 *
 * A grace window rather than instant death: losing your seat should be the run's great
 * crisis with a chance to march back and retake it, not a coin-flip ending at wave four.
 */
export const CAPITAL_GRACE_TICKS = 6;
/** Quiet period after committing to a front, so the prompt does not re-open mid-march. */
export const MARCH_REPROMPT_TICKS = 4;
/** Longer quiet period after choosing to hold, so declining is respected. */
export const MARCH_HOLD_TICKS = 8;
