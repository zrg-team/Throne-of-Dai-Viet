import type { AscentRarity } from '../state/types';
import type { FieldStance } from '../state/types';

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
// `BASE_THREAT`, `THREAT_GROWTH` and `BOSS_THREAT_MULT` were removed here.
//
// Nothing imported them: the live wave size comes from `waveTargetPower` in `WaveDirector`, built
// from WAVE_BASELINE_POWER / WAVE_BASELINE_GROWTH / BOSS_PRESSURE_MULT below. They survived the
// cleanup that deleted the other retired dials, and a plausible-looking threat curve that is wired
// to nothing is worse than no curve at all — it is the first thing anyone would reach for to make
// the game harder, and turning it would have done exactly nothing.

/**
 * Hosts spawned per wave. `launchOffMapInvasion` clamps a wave's *total* size to a multiple
 * of the player's own military — a deliberate anti-snowball guard in empire mode, but it
 * would make an endless run unloseable. More hosts raises that clamp's floor, so scaling the
 * coalition with the wave number is what actually escalates the pressure.
 */
export function waveHostCount(wave: number, boss: boolean): number {
  return Math.min(4, 1 + Math.floor(wave / 6) + (boss ? 1 : 0));
}

// ── The four phases of a wave cycle ─────────────────────────────────────────
/**
 * A run used to be a metronome: a card every 3.9 seasons, coefficient of variation 0.106,
 * from the first minute to the last. A wave landing arrived through the same full-screen
 * modal, at the same cadence, as a court appointment — so nothing in the run could feel like
 * a peak because nothing was ever a trough.
 *
 * The cycle gives the same twelve seasons a shape: **Aftermath** (what you won), **Court**
 * (the only window in which the realm's scheduled decisions may speak), **Muster** (the wave
 * is named and nothing interrupts), then the field. Decisions cluster where the player is
 * meant to be thinking and stop entirely where they are meant to be watching.
 *
 * Counted down from `WAVE_INTERVAL_TICKS`, so these are shares of one cycle, not absolutes.
 */
export const AFTERMATH_TICKS = 2;
export const MUSTER_TICKS = 2;
/**
 * Gap between decisions *inside* Court. Deliberately shorter than `MIN_GAP_TICKS`: the point
 * is not fewer decisions but decisions that arrive together and then leave the player alone,
 * which is what a quiet stretch and a busy one actually are.
 */
export const COURT_GAP_TICKS = 2;

// ── Ambition: the dial the player turns ─────────────────────────────────────
/**
 * **The mode's central mechanic.** A wave is sized from the baseline curve below, multiplied
 * by how much the realm has recently *taken* — not by how much it currently *has*.
 *
 * The distinction is the whole design. Sizing a wave against `contestedDefencePower` (what
 * this replaces) meant every point of defence the player bought summoned an equal point of
 * threat, so growth was self-cancelling and the player was never told why. Measured over a
 * full run, a realm that declined every offer plateaued at 3,000 defence against a threat
 * that plateaued with it at 0.94× — a stalemate that ran out the clock — while a realm that
 * engaged climbed to 8,088 defence with the threat right behind it at 0.95×, and died. Growth
 * bought nothing but a bigger enemy.
 *
 * Against a counter the player spends, the trade inverts: taking a province costs a fixed,
 * *decaying* burst of danger and pays a permanent gain. Ambition is therefore a price, not a
 * treadmill, and the player can see the price before they pay it.
 */
export const AMBITION_PER_PROVINCE = 3;
export const AMBITION_PER_POWER_CARD = 2;
export const AMBITION_PER_HOST = 1;
/**
 * Share of standing ambition shed at each wave. At 0.45 a burst is mostly gone in three waves,
 * so consolidating genuinely cools the realm down and a quiet stretch is a real strategy
 * rather than a pause.
 *
 * Deliberately not zero-decay: without it, ambition is just a second, slower treadmill and the
 * back half of a run is unplayable however carefully the front half was spent.
 */
export const AMBITION_DECAY_PER_WAVE = 0.45;
/**
 * How much one point of standing ambition adds to the next wave.
 *
 * **Cut from 0.05 to 0.03.** When this was probed in isolation it looked innocent: heat separated
 * an engaged run from a declining one by only 1.16×, worth about 1.7 waves, and zeroing it moved
 * the survival ratio from 1.18 to only 1.27. That measurement was taken on a realm that could not
 * grow — 1.2 hosts, 3 provinces, 542 soldiers — so there was very little growth for the counter to
 * charge for. Once provincial militia and a frontier that absorbs conquest hosts let an engaged
 * realm reach 3.2× the power of a passive one, the same coefficient started billing for all of it,
 * and the ratio fell rather than rose. Ambition is a price on growth; it has to be re-priced when
 * the amount of growth available changes.
 */
export const AMBITION_PRESSURE_PER_POINT = 0.03;
/**
 * Ceiling on the multiplier, so a player who spends everything at once faces a monster rather
 * than an instant loss — the run has to stay recoverable enough to be worth finishing.
 */
export const AMBITION_HEAT_MAX = 3.2;
/**
 * Seasons of the realm's own income paid as spoils on each wave survived, per point of heat
 * above the floor. **The other arc of the dial** — the one that makes the price worth paying.
 *
 * Deliberately paid in manpower, grain and stores rather than gold. Those are what bound the
 * size of a host, so an ambitious season converts directly into the thing that survives the
 * next wave; gold is the one resource the mode already oversupplies by three orders of
 * magnitude, and spoils paid in it would be a reward the player can feel nothing from.
 *
 * Measured: without this arc, engaging outlived declining by 1.26× — real, but short of the
 * 1.5× that says a game rewards being played. Ambition was a price with a receipt attached
 * rather than a purchase.
 */
export const AMBITION_SPOILS_SEASONS = 10;
/**
 * The wave curve's floor: what wave 1 brings against a realm that has done nothing at all.
 *
 * Anchored to the measured opening — the old formula quoted ~395 power at wave 1 — so the
 * first minutes feel unchanged and only the *reason* the number moves is different.
 */
export const WAVE_BASELINE_POWER = 420;
/**
 * Per-wave growth of that floor. This is what makes passivity fatal: a realm that never takes
 * anything holds a defence that plateaus near 3,000, and at 1.11 the floor passes it in the
 * low twenties. Doing nothing is now a losing strategy that takes a while to lose.
 */
export const WAVE_BASELINE_GROWTH = 1.11;

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
 * realm being punished for simply existing.
 *
 * Note this no longer sizes waves — those read ambition now — but it still decides what the
 * response card quotes odds against, and what raids and mercenary companies are scaled to.
 *
 * **Raised to 0.35.** At 0.20 the odds this figure quotes were systematically pessimistic about a
 * wide realm: measured, POWER separated an engaged run from a declining one by 1.77× while this
 * figure moved only 1.42×, so the card told a player their twelve provinces were worth almost
 * nothing to a defence that, with provincial militia and a frontier that now absorbs conquest
 * hosts, they demonstrably are. The number has to track what the map actually does or the response
 * card lies — and it was lying in the direction that made expanding look pointless.
 */
export const REALM_DEFENCE_SHARE = 0.35;

/**
 * `WAVE_PRESSURE_BASE/STEP/MAX` used to live here: a wave was `laggedDefencePower × pressure`,
 * with pressure ramping 0.36 → 0.95 across a run. They are gone rather than merely unused,
 * because a retired difficulty dial left lying beside the live one is the sort of thing that
 * gets retuned for an afternoon before anyone notices it is not wired to anything.
 *
 * The curve they described is now `WAVE_BASELINE_POWER × WAVE_BASELINE_GROWTH^wave × ambition`
 * — see `waveTargetPower`.
 */
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
 *
 * Four rather than three, to match `waveHostCount`'s own maximum. A boss coalition spawns four
 * hosts, which immediately put the map at or over a ceiling of three — so `waveBudgetSpent`
 * skipped the *following* wave outright every time, spawning nothing while the counter and the
 * difficulty curve both advanced. A ceiling below what the spawner can emit in one go silences
 * the next wave by construction.
 */
export const MAX_LIVE_INVADER_HOSTS = 4;
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
 * Share of the **incoming wave** that one Fortify purchase buys, permanently. Large enough
 * that the option is worth its price at any point on the curve — see `fortifyDefenceGain`,
 * which converts this into points of provincial defence, and which explains at length why this
 * is a share of the threat rather than of the realm's own defence.
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
/**
 * A raid host, as a share of the realm's field power. Background pressure, not a second wave.
 *
 * Trimmed from 0.18 when `REALM_DEFENCE_SHARE` rose to 0.35: raids are sized off
 * `laggedDefencePower`, which reads that share, so leaving this alone would have quietly made
 * every raid half again as large as a side effect of a change about something else.
 */
export const RAID_POWER_SHARE = 0.13;
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
 * The absolute power a rival needs before extortion is worth trying — a *means* floor, not a
 * measuring tape against the player.
 *
 * This was `contestedDefencePower × ratio` through two recalibrations (0.30, then 0.18), and
 * both went dark the same way every player-relative bar in this file has: the realm's defence
 * compounds (walls, garrisons, drafted hosts) while a rival's on-map power is a handful of
 * holdings, so the bar ran from ~600 to ~80,000 across a measured long run while the rivals sat
 * between 250 and 2,600. Tribute — the mode's single largest gold sink — fired zero times.
 *
 * A neighbour does not need to match you to extort you. It needs enough of a host to burn your
 * border, and it needs you to not already dominate the world (that case belongs to the
 * coalition — see `offerTribute`, which reads the same `playerDominance` the other demands do).
 */
export const TRIBUTE_MEANS_FLOOR = 320;
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
 * How much dearer each war purchase — walls or sellswords — is than the last, within one run.
 * **The cap on what coin can buy.**
 *
 * Without it, gold is a win button rather than a resource. Measured with the strategy driver
 * across twenty seeds: enduring every wave and buying nothing died 19 times out of 20 at wave
 * 19.9; taking the emergency levy died 14 times at wave 30.1; simply buying walls every wave
 * reached the tick limit at wave 49 and **died not once**. The treasury peaks near 150,000
 * while a wall is priced at six seasons of income, so the realm could answer every wave
 * forever by writing a cheque.
 *
 * Rebasing what a wall *grants* was tried first and was not enough: a purchase worth 18% of
 * the incoming wave still wins, because the incoming waves are a geometric series and their
 * running total is roughly nine times the latest one. Eighteen percent of that is 1.6× the
 * wave the realm actually has to stop. The gain had to stop compounding *and* the count had to
 * be bounded.
 *
 * Escalating rather than capping outright keeps the option honest at every point on the curve:
 * the first purchase is a bargain, the fourth a serious commitment, the seventh something only
 * a realm that hoarded for it can consider. Coin still buys survival — it stops buying an
 * unbounded amount of it.
 */
export const WAR_PURCHASE_ESCALATION = 1.4;

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

/**
 * Graft: what an idle hoard loses to its own officials each season, and the size it starts at.
 *
 * The soft cap above throttles the *rate* and left the *stock* untouched, so a measured run still
 * ended holding 42,971 gold against an income of 422 — **102 seasons banked**, with every price in
 * the mode a rounding error long before that. A treasury nobody can spend is not a reward, it is a
 * scoreboard that has stopped counting.
 *
 * The drain is on the excess only, so an ordinary working balance is untouched and the player can
 * still save for the things worth saving for — a buy-off runs to about six thousand, which is why
 * the floor sits above it. Past that, hoarding costs, and the equilibrium lands near twenty-five
 * seasons of income instead of a hundred: still rich, no longer meaningless.
 */
export const TREASURY_GRAFT_FROM = 4000;
export const TREASURY_GRAFT_RATE = 0.06;

// ── Standing armies cost what they are worth ────────────────────────────────
/**
 * Gold and food each soldier draws per season, on top of the shared upkeep. See
 * `ascentArmyUpkeep`: the bill is multiplied by `1 + troops / ARMY_UPKEEP_SCALE`, so it grows
 * faster than the army does and a huge host is a genuine strategic burden rather than a free
 * win condition.
 *
 * Food used to be charged at a quarter of this, on the theory that granaries are small next
 * to treasuries. Then a measured Year-7 run fielded 2,171 soldiers in a realm of 860 people:
 * under provincial demand a civilian at home eats ~1/70 ≈ 0.014 food a season, and a soldier
 * on campaign was eating 0.005 — **a third of a peasant's ration**. That is not a tuning gap,
 * it is backwards, and it is why an army was the one thing in the realm that cost nothing to
 * keep. A soldier now eats at least what he ate before he enlisted.
 */
export const ARMY_GOLD_PER_SOLDIER = 0.02;
export const ARMY_FOOD_PER_SOLDIER = 0.02;
/** A host that is marching, or standing on ground the realm does not own, eats harder. */
export const ARMY_CAMPAIGN_FOOD_MULT = 1.5;
/**
 * Troop count at which the upkeep multiplier reaches 2x.
 *
 * Down from 5,000 — a figure no real run's army ever approached, which made the superlinear
 * term a straight line with extra arithmetic. At 1,200 the curve bends inside the range the
 * game actually produces, so "few strong hosts or many weak" is priced again.
 */
export const ARMY_UPKEEP_SCALE = 2000;

// ── Provinces eat ───────────────────────────────────────────────────────────
/**
 * The demand side of the economy: a province consumes, not only produces.
 *
 * Before this existed a province was pure profit forever — no bread, no wants, no wages — so
 * taking land was never a decision, merely arithmetic with one sign, and a measured Year-10
 * run banked 11k gold at +262 a season with nothing to spend it on. Growth now writes its own
 * bill, in the same resources the player is hoarding.
 *
 * Coin scales on *development* rather than population, deliberately: if all three demands
 * keyed on population they would be one demand wearing three hats. This way a tall province
 * and a wide realm cost differently, and "build up Trường Yên" versus "take one more
 * province" become different economic decisions rather than two spellings of growth.
 */
export const DEMAND_FOOD_PER_POP = 70;
export const DEMAND_SUPPLIES_BASE = 2;
export const DEMAND_SUPPLIES_PER_POP = 260;
export const DEMAND_GOLD_BASE = 3;
export const DEMAND_GOLD_PER_BUILDING = 2;
export const DEMAND_GOLD_GARRISON = 4;
/**
 * Administration's cut of each province's own gold output — the counting-house pays its
 * clerks out of what crosses its tables.
 *
 * This is the term that keeps wealth honest at scale, and it must be proportional. The flat
 * per-building wages above grow linearly while the trade network compounds multiplicatively,
 * so by the mid-game they were a rounding error: a measured 400-tick run grossed ~3,000 a
 * season against ~130 of provincial wages and banked eighteen thousand gold with nothing to
 * care about — the exact complaint this system exists to fix. A share of output scales with
 * the same engine that makes the money, so a richer realm is always a more expensive one.
 */
export const DEMAND_GOLD_OUTPUT_SHARE = 0.15;
/**
 * Demand's difficulty weight — deliberately the same numbers as `difficultyArmyScale`
 * (InvasionSystem), which cannot be imported here without a cycle. Easy is easy because the
 * world asks less on *both* fronts: an easy long run died at turn 365 when waves were sized
 * down but the wage bill was not — a naive fortify-everything player (exactly who picks easy)
 * bled out on administration alone.
 */
export function demandDifficultyScale(difficulty: string | undefined): number {
  if (difficulty === 'easy') return 0.7;
  if (difficulty === 'hard') return 1.35;
  if (difficulty === 'ironman') return 1.7;
  return 1.0;
}
/**
 * Seasons over which demand ramps from zero to full weight. A roguelite whose first two
 * minutes are a knife-edge teaches nothing; the realm learns to feed itself while small.
 */
export const DEMAND_RAMP_TICKS = 24;
/** Seasons between repeats of any one shortfall announcement, so the header does not nag. */
export const DEMAND_TOAST_COOLDOWN = 8;

// ── An empty treasury: pressure, not a trapdoor ─────────────────────────────
/**
 * Share of its gold output an unpaid province still sends on. It used to withhold *all* of it,
 * and since a province's wage (~9) is smaller than its output (~13), every province the ratchet
 * stopped paying made the deficit *worse* — the mechanism meant to relieve an empty treasury
 * deepened it, and the recovery gate could then never be reached: a run measured 200 seasons
 * with every province unpaid, gross −8, net −89. Half kept, half withheld makes stopping a
 * wage a real relief again while still costing the realm something it can see.
 */
export const UNPAID_WITHHOLD_SHARE = 0.5;
/** Seasons of sustained arrears before the next province is stopped. */
export const UNPAID_RATCHET_TICKS = 10;
/** Loyalty an unpaid province sheds each season, and the floor it stops at. */
export const UNPAID_LOYALTY_PER_TICK = 1;
export const UNPAID_LOYALTY_FLOOR = 15;
/** Treasury above which the clerks come back on the books, one province a season. */
export const UNPAID_RECOVER_TREASURY = 60;
/**
 * Seasons after which an unpaid province's arrears are written off and it returns regardless.
 * The one-way ratchet is what turned a bad season into a permanent state; a write-off makes it
 * a pulse — the pressure recurs if the books stay bad, but it can no longer become the run.
 */
export const UNPAID_WRITEOFF_TICKS = 24;
/**
 * A hero with no posting draws half pay; a bench of champions is a cost, not a payroll. And the
 * throne funds itself: the king's own upkeep is halved, because a run that opened at −13 gold a
 * season before its first decision was paying most of that to its own founder.
 */
export const HERO_RESERVE_UPKEEP_SHARE = 0.5;
export const ASCENT_KING_UPKEEP_MULT = 0.5;
/**
 * When the autopilot lets a champion go (`autoTrimPayroll`): the treasury pinned at nothing for
 * this many seasons, the roster drawing at least this share of gross, and no more than one
 * dismissal per gap.
 */
export const AUTOTRIM_BROKE_TICKS = 10;
export const AUTOTRIM_PAYROLL_SHARE = 0.5;
export const AUTOTRIM_GAP_TICKS = 12;

// ── Improving a host you already have ───────────────────────────────────────
/**
 * What it costs to make a standing host better, along the three axes it has.
 *
 * Until this existed an Ascent host could only ever shrink: `computeEliteTier` was read once at
 * muster and never again, levels came only from battles the autopilot mostly avoided, and nothing
 * anywhere added a soldier to an existing army. The only way to field something stronger was to
 * raise another host — which is why every run converged on many weak armies, and why upkeep
 * scaling superlinearly punished the one strategy the game actually permitted.
 *
 * Prices escalate per tier so that the second step up is a real decision rather than a formality,
 * and all three are quoted against the host's size so improving a large army is not free.
 */
export const ARMY_EQUIP_GOLD_BASE = 180;
export const ARMY_EQUIP_SUPPLIES_BASE = 90;
/** Multiplied per elite tier already held, so tier 2 costs this much more than tier 1. */
export const ARMY_EQUIP_TIER_ESCALATION = 1.85;
/** Gold and supplies per soldier in the host, so equipping a large host costs more. */
export const ARMY_EQUIP_PER_SOLDIER = 0.06;

/** Soldiers added by one reinforcement, before the humans available cap it. */
export const ARMY_REINFORCE_SOLDIERS = 220;
export const ARMY_REINFORCE_GOLD_PER_SOLDIER = 0.55;
/** Supply and rations a reinforcement restores, in points toward the 100 ceiling. */
export const ARMY_REINFORCE_SUPPLY_GAIN = 22;

export const ARMY_DRILL_GOLD_BASE = 140;
export const ARMY_DRILL_FOOD_BASE = 70;
/** Multiplied per level already held. */
export const ARMY_DRILL_LEVEL_ESCALATION = 1.6;
/** Experience one drill grants, as a share of what the next level needs. */
export const ARMY_DRILL_XP_SHARE = 0.55;

// ── Rival empires that actually march ───────────────────────────────────────
/**
 * Divisor turning a rival's raw hostility score into a 0..1 pressure.
 *
 * The raw score sums `100 - relations`, war appetite, ambition and power at the weights the wave
 * director already uses, so a maximally furious empire lands near 250. Dividing by rather more
 * than that keeps even the angriest neighbour from attacking every other tick, while leaving a
 * clear gradient between a friendly rival and a hostile one.
 */
export const ENEMY_PRESSURE_DIVISOR = 320;

/**
 * Per-rival, per-tick chance of an unscheduled march, scaled by that rival's pressure.
 *
 * Very small deliberately. The wave director already supplies the *volume* of hosts on its own
 * schedule; what was missing was intelligence, visible approach, and a guarantee. So this director
 * mostly reshapes hosts that already exist — giving them plans, letting them withdraw, making them
 * march where they can be seen — and adds one of its own only occasionally.
 *
 * Measured: at 0.06 a run lost 31 provinces against a baseline of 13, with seven hosts in the
 * field at once and no let-up. That is a different failure from "no battles ever", not a fix for
 * it. The floor below is what actually guarantees contact; this only adds unpredictability.
 */
export const ENEMY_LAUNCH_DRAW = 0.004;


/**
 * Ticks without a hostile host reaching the player's ground before one is sent regardless.
 *
 * This is the floor under the randomised cadence, and it exists because the defect being fixed is
 * literally "ten minutes of play produced no battle at all".
 *
 * Down from 72, which was tuned in tick-time and failed in felt-time: 72 ticks is eighteen
 * played years, and a real session — where every prompt pauses the clock — reached Year 10
 * without the floor ever firing. The player's "ten minutes" is maybe forty ticks of world
 * time. Thirty guarantees first contact inside a single sitting, which is the only place a
 * guarantee is worth anything.
 */
export const ENEMY_CONTACT_FLOOR_TICKS = 30;

/**
 * How far below a province's defence a host must fall before it starts thinking about leaving.
 *
 * Deliberately low. A host that turns back whenever it is merely outgunned never fights at all,
 * and the whole point of this work is that battles happen — so this is the threshold for a march
 * that is *hopeless*, not one that is merely unfavourable. A host already adjacent to its target
 * ignores it entirely and presses the attack (see `reconsider`).
 */
export const ENEMY_RETREAT_POWER_RATIO = 0.45;

/**
 * Consecutive ticks a host must want to withdraw before it does.
 *
 * Pure hysteresis. Without it a host hovering near the threshold flips between advancing and
 * retreating every tick, which looks like a broken AI rather than a cautious one.
 */
export const ENEMY_RETREAT_HYSTERESIS_TICKS = 3;

/**
 * Hops from owned ground within which a marching hostile host is spotted.
 *
 * A scouting radius, not a fog lift: the rest of the map stays dark. Two hops gives the player a
 * tick or two of warning — enough to march a host to meet it, which is the entire point of being
 * able to see an invasion coming.
 */
export const ENEMY_SPOT_RADIUS = 2;

// ── Field battles you can watch ─────────────────────────────────────────────
/**
 * Beats a small engagement runs; a large one runs up to the maximum. These are now real-time
 * beats a few per second, not turns — see `fightRound` and the view's clock.
 */
export const BATTLE_BASE_ROUNDS = 14;
export const BATTLE_MAX_ROUNDS = 22;
/**
 * Extra heart lost by **both** sides, per round, for every round past `totalRounds`.
 *
 * The round count is not a deadline any more — a fight ends when a side breaks, and only when a
 * side breaks. What this replaces it with is pressure: past the reference length the exchange
 * starts costing heart on its own, a point and a fifth more each round, until somebody's line
 * goes. Two evenly matched hosts do not grind for ever; they get angrier.
 *
 * It is also the guarantee that a fight terminates without a cap. The extra drain accumulates as
 * `1.2 x k(k+1)/2`, which passes a full 100 morale by the thirteenth round of overtime — so the
 * worst case is bounded by the arithmetic rather than by a timer, and the bound is reached by men
 * breaking rather than by the screen giving up on them.
 *
 * Applied to both sides equally on purpose. A pressure that favoured either would decide fights
 * the shapes and the tempo are supposed to decide.
 */
export const BATTLE_OVERTIME_MORALE = 1.2;
/**
 * Milliseconds a single beat is held on screen.
 *
 * This is the *replay* clock, and until the beat buffer existed it was not a clock at all — it
 * was a poll rate. `advanceBattle` resolves `BATTLE_BEATS_PER_TICK` beats in one burst on the
 * economy tick, so the screen used to refresh six times against state that changed once, then
 * sit on an unchanged picture for the rest of the 3.5s tick. A whole engagement arrived in four
 * or five frozen steps.
 *
 * `fightRound` now records each beat (see `AscentBattle.beats`) and the view drains one per
 * interval. Sized so a tick's worth plays out just inside the tick that produced it —
 * 6 x 560 = 3.36s against ASCENT_TICK_MS of 3500 — leaving headroom rather than falling behind.
 */
export const BATTLE_TICK_MS = 560;

/**
 * How long the Skirmish holds the emptying field before it hands back to the setup screen.
 *
 * The rout animation already existed and was never once seen to finish. A host that breaks is
 * carried off the field over `BATTLE_TICK_MS * 2`, but when the *last* host on a side breaks the
 * fight resolves in that same tick, `finishBattle` clears `activeBattle`, the battle lane closes
 * on the next frame and the arena replaces the whole scene with its report — so the men were
 * killed off mid-stride, about 1.1 seconds of animation shown for perhaps 30 ms of it.
 *
 * Three and a bit beats: the two the runners need, plus one to see the ground they left. Long
 * enough to read as "they broke and ran", short enough that a player dialling in matchups is not
 * kept waiting between them.
 */
export const ARENA_ROUT_HOLD_MS = Math.round(BATTLE_TICK_MS * 3.4);
/**
 * Beats resolved per economy tick.
 *
 * The fight advances with the world rather than with the viewer, so this sets how many seasons
 * a siege lasts: at 6 beats a tick and ~22 beats of melee, an engagement runs four or five turns
 * — long enough to raise a host and march it in, short enough not to stall the run. Measured at
 * 4 with fights that finally outlived their opening tick, a battle was live on more than half of
 * all ticks and the wave cycle was mostly siege.
 */
export const BATTLE_BEATS_PER_TICK = 6;

/**
 * How large the hosts are drawn on the battle screen, against the map's `GROUND_SCALE` of 0.72.
 *
 * The battle screen borrowed the map's one ground scale, and it is not a map. A soldier is drawn
 * at 1.7 m and lands at 6.8 px on a map where a whole province is forty pixels across — which is
 * right there and absurd here, on a field 262 units wide with nothing else in it. Measured off a
 * real fight, a 367-man host filled a block 19 px wide and 12 px deep in the middle of a
 * 262 x 301 field: the complaint that the battlefield looks empty is mostly this one number.
 *
 * 1.45 put a soldier at 13.7 px and roughly doubled the block. Deliberately not larger: the blocks
 * have to fit two or three deep a side with the standards beside them, and a host that fills its
 * half of the field leaves the ground with nothing to say.
 *
 * Raised to 2.3 when the block grid tightened to the document's — men shoulder to shoulder rather
 * than three body-widths apart. That change shrank every block by about 2.7x in each axis and left
 * the hosts as specks on the field. Restoring the block's *width* would have meant 3.9, which puts
 * a soldier a quarter of the way up the field; 2.3 instead matches the document's own proportion,
 * where a man stands about a seventh of the ground band. The blocks are smaller than they were and
 * the men are larger, which is the trade a dense formation makes.
 */
/**
 * 2.3 x 1.8/2.15. Trimmed in exact step with `LIVING` going from 1.8 to 2.15, so the battle screen is
 * drawn at precisely the size it was: the figures grew a third and this shrank a third, and the
 * product — which is what actually reaches `figure()` — did not move a pixel.
 *
 * The exaggeration was raised for the *map*, where a soldier was 6.8 px tall and read as a speck.
 * The battle screen already had its own room and did not need any.
 */
/**
 * 2.2, up from 1.9256.
 *
 * The men were the smallest thing on the screen this screen is about. `verify-battle-scale` holds
 * the ceiling — nothing may be drawn larger than the near edge of the ground allows, which it
 * measures at 2.57 — and the tallest figure was coming out at 2.16 against it, so there was room
 * and nobody had taken it. Raised until the harness says the field is full rather than by eye.
 */
export const BATTLE_HOST_SCALE = 2.2;

/**
 * How far winning the exchanges can walk the contact line, as a fraction of the field.
 *
 * The advances stop changing the moment the two lines meet, so after contact the drawn fight was
 * two blocks standing still with a 4 px jitter for twenty beats. This is the view reading the
 * losses back out and pushing the seam toward whoever is losing. Modest on purpose — the seam is
 * clamped to a band around the middle either way, and a line that slides the whole field reads as
 * a rout rather than as pressure.
 */
export const BATTLE_PRESS_TRAVEL = 0.09;

/**
 * How much smaller a thing standing on the horizon is drawn than one on the line of battle.
 *
 * The battle screen is a picture with a middle distance in it, so a treeline along the foot of the
 * hills cannot be drawn at the size of the tree in the near corner. This is the *only* thing
 * allowed to change the scale of anything on that field — see `ConquestUIScene.battleScaleAt`.
 * A woodcut flattens depth rather than obeying it, so the falloff is gentler than perspective.
 */
export const BATTLE_DEPTH_FAR = 0.45;
/** And how much larger at the near edge, so the foreground frames the picture. */
export const BATTLE_DEPTH_NEAR = 1.12;
/**
 * The smallest company a province turns out when contact is made and no field host is present.
 *
 * `raiseGarrisonLevy` sizes the turnout from militia and walls, and used to give up under 40 —
 * which handed every thinly-held province's defence to a hidden roll. Whose ground it is is the
 * honest test of what is worth watching, so a thin garrison now musters a token company instead;
 * `Army.levyDrawn` keeps the conjured share from ever becoming standing militia.
 */
export const GARRISON_LEVY_FLOOR = 40;
/**
 * Battle power of one levy man: the levy's unit mix (0.6 spear / 0.25 bow / 0.15 heavy → 1.18)
 * at its morale and supply of 80 each. A garrison levy is sized by dividing the province's
 * `defenderPower` garrison term by this, so a fought battle and the odds roll agree on what the
 * walls are worth.
 */
export const LEVY_POWER_PER_MAN = 0.755;
/**
 * Beats an assault may spend closing before contact is forced. An attacker always advances, so
 * this is a safety net rather than a pace: a defender that never leaves its walls cannot stall
 * the fight at the approach.
 */
export const BATTLE_APPROACH_MAX_BEATS = 12;
/** How much of the field a line crosses per beat, so the two meet in the middle in good time. */
export const BATTLE_ADVANCE_PER_TICK = 0.115;
/**
 * Share of a host's strength at stake in one exchange, before the power ratio and *both*
 * postures scale it. Raised from 0.022 when the exchange became symmetric: each side's
 * losses are now its own exposure times the other's aggression, and two sub-1 multipliers
 * multiplied together bled far less than the single one they replaced — routs fell to zero. Tuned so a matched fight leaves both sides bloodied but standing after three
 * rounds, which is what makes retreating between them a real decision rather than a formality.
 */
/**
 * Raised from 0.0272. Measured across 8 seeds, 68% of engagements ended at the round limit with
 * neither side broken — the morale spiral that gives a fight its shape is built to produce
 * collapses, and it was running out of rounds before it could. A heavier exchange lets the fight
 * conclude on the field, which is what `finishBattle` now scores it on.
 */
export const BATTLE_ROUND_BITE = 0.0345;
/** Fraction of its starting strength at which a host breaks and the engagement ends early. */
export const BATTLE_BREAK_SHARE = 0.35;
/**
 * What each stance trades, and nothing else.
 *
 * The old table folded the matchup into the tempo and the two jobs fought each other: `press` and
 * `hold` came out with the same exchange ratio to three decimals, so pressing was simply the same
 * trade delivered faster. `docs/14-five-shapes-two-dials.html` splits them — **the shape decides
 * which way the men are spent, the stance decides how fast** — and these four numbers are the
 * whole of the tempo half.
 *
 * Aggression is a genuinely favourable trade at even shape (1.55 dealt against 1.40 taken), so it
 * is not a trap, it is a *bet*. What makes it a bet is that the multiplier lands on whichever side
 * the formation tilt has already tipped: press with the counter and you win at nearly two to one;
 * press into the counter and you lose at better than three to two, in half the time.
 *
 * `withdraw` is the cold end rather than a button. Disengaging is something you survive — the line
 * still trades while it walks backwards, badly, for `BATTLE_WITHDRAW_BEATS`.
 *
 * `defend` deals 0.50 against 0.55 taken — a losing exchange, **on purpose**. At the old 0.62 its
 * ratio was favourable, and a bot that only ever mirrored the enemy's shape and sat in Cố thủ beat
 * an army 10% larger without making a single real decision. Three fixes killed the cheap win:
 * this number, the proportional exchange-winner morale gain (`wonExchange`), and every doctrine
 * pressing a passive line at even shape. Measured after all three: the same turtle drags itself
 * over a +25% fight only in ruin — two thirds of its men gone, rally spent — where active play
 * wins the identical fight keeping 59%. Defending pays in wind recovery and halved counter-drip,
 * never in the exchange; `verify-battle-wind.mjs` holds that margin forever.
 */
export const BATTLE_STANCE_TRADE: Record<FieldStance, { dealt: number; taken: number }> = {
  withdraw: { dealt: 0.35, taken: 0.75 },
  defend: { dealt: 0.50, taken: 0.55 },
  balanced: { dealt: 1.00, taken: 1.00 },
  press: { dealt: 1.55, taken: 1.40 },
};

/** Beats spent disengaging once the stance is `withdraw`, before the host is clear away. */
export const BATTLE_WITHDRAW_BEATS = 3;

/**
 * Which way the exchange leans when one shape answers another.
 *
 * Deliberately modest. At 0.28 the counter is worth roughly two and a half beats of exchange, so a
 * one-beat walk plus a three-beat wind makes changing shape *marginally* correct — which is the
 * knife-edge the whole fight is balanced on. Move this and `BATTLE_FORMATION_WIND` together or
 * not at all.
 */
export const BATTLE_FORMATION_TILT = 0.28;

/** What a Moment's `sharpen` raises the tilt to, whichever way it is already pointing. */
export const BATTLE_FORMATION_TILT_SHARP = 0.42;

/**
 * The soft counter's share of the full tilt.
 *
 * This constant used to be the `blunt` availability state's penalty. It survived the retirement of
 * that whole mechanic (docs/18) because the number was right and the job got better: one step
 * round the ring is now a *strong* counter at full tilt, two steps a *soft* counter at half — see
 * `formationTier`. A gradient, not a lock: nothing is refused, one answer is simply better.
 */
export const BATTLE_FORMATION_TILT_BLUNT = 0.5;

/**
 * Beats a shape needs to get its breath back after the host walks out of it.
 *
 * The one restriction on the whole battle screen. It exists to stop the single best answer being
 * pressed on cooldown forever, so the *second*-best shape becomes something a player learns. The
 * clock is stamped on the shape being LEFT, at landing, and ticks down at the stance's recovery
 * rate below. The shape the enemy stands in never needs wind (the "match" floor), so a dead dock
 * is impossible.
 *
 * Six, up from three — and the reason is the screen's clock, not the maths. A beat is 560 ms of
 * watching, so three beats was a chip greyed for 1.7 s against an enemy that rotated only when
 * losing: ten real fights, and the player never once met a winded chip ("a mechanic that never
 * happens — what is it for?"). Six is 3.4 s, longer than every temper's rotation period, so the
 * shape you left is still resting when the invader swings back toward it. `verify-battle-wind`
 * counts the blocked decisions per fight and fails under two.
 */
export const BATTLE_FORMATION_WIND = 6;

/**
 * Wind recovered per beat, by stance — the rule that makes the two dials one loop.
 *
 * Pressing freezes the dock (men who are charging do not catch their breath), so aggression is
 * paid in the answers you will want three beats from now, not in blood. Defending refills at
 * double rate, which is what turns Cố thủ from "lose slower" into "buy your options back".
 * Simulated at wind 3: a press-holder keeps their strong answer 48% of the time, defend 99%.
 */
export const BATTLE_STANCE_RECOVERY: Record<FieldStance, number> = {
  withdraw: 2,
  defend: 2,
  balanced: 1,
  press: 0,
};

/**
 * Wind for a doctrine's signature shape — see `SIGNATURE_SHAPE`. One printed exception per army,
 * in place of the four hidden ones the availability rule used to be.
 */
export const BATTLE_SIGNATURE_WIND = 4;

/** The commander tempers, keyed from `KingdomPersonality` (+ the `isGreat` flag → cunning). */
export type CommanderTemper = 'hasty' | 'measured' | 'stubborn' | 'cunning';

/**
 * What a temper changes: how long he waits before answering your shape, whether he rotates out of
 * an even matchup on his own clock, and whether he presses a winning tilt.
 *
 * Two numbers and a habit, all built from dials the fight already had — which is what keeps every
 * temper inside the telegraph's honesty contract. `hesitation` is added to the difficulty's
 * reactDelay (floor 0). `restlessBeats` is how long he stands content at even shape before
 * rotating anyway (0 = never; the hasty cannot sit still, which spends his own wind — outlast
 * him and he runs dry first). `presses` gates the press stance on a winning tilt: the stubborn
 * never gambles, which hands you long windows and dares you to overspend into them.
 */
export const BATTLE_TEMPER: Record<CommanderTemper, {
  /** Beats he stands countered before ordering, on top of the difficulty's. */
  hesitation: number;
  /** Beats he stands content at even shape before rotating anyway (0 = never). */
  restlessBeats: number;
  /** Whether a winning tilt is pressed. */
  presses: boolean;
  /**
   * Every Nth rotation he reads your dock and steers toward the shape whose answer you have
   * winded (0 = never, 1 = always). This is the dial that decides how often a player actually
   * MEETS the cooldown: measured with every invader reading every rotation, 16 of 19 decisions
   * were blocked — a wall, not a mechanic. At every third, a measured invader blocks roughly a
   * third of them, which is "sometimes you cannot get the best shape" and no more.
   */
  readsDock: number;
}> = {
  // Every temper rotates on its own clock now, not only when losing. An invader who stands
  // content at even shape was the second half of why the wind never bit: he never asked the
  // player a question the dock could refuse. The periods are all shorter than the wind (6), so
  // the answer he pulls you toward is reliably the one you just left.
  hasty: { hesitation: 0, restlessBeats: 3, presses: true, readsDock: 2 },
  measured: { hesitation: 1, restlessBeats: 5, presses: true, readsDock: 3 },
  stubborn: { hesitation: 2, restlessBeats: 7, presses: false, readsDock: 0 },
  // The graduation exam, reserved for great waves: no patience at all, and he answers an even
  // matchup inside two beats.
  cunning: { hesitation: 0, restlessBeats: 2, presses: true, readsDock: 1 },
};

/**
 * What a host deals and takes while it is walking between shapes.
 *
 * This is the entire cost of the fast dial and it has to hurt, or the player simply mirror-counters
 * every beat and the fight is a reflex test. Men crossing between blocks are in **no formation**:
 * the tilt reads zero for them, half the army is facing the wrong way, and they are being shot at
 * the whole time.
 */
export const BATTLE_REFORM_DEALT = 0.55;
export const BATTLE_REFORM_TAKEN = 1.45;

/**
 * How many beats a change of shape takes, by what the host is and who leads it.
 *
 * Army quality and the general stop being a percentage bonus here and become **reaction time**,
 * which is the correct way for a strategy layer to be felt inside a tactical screen: a guard host
 * under a good commander answers inside one beat, a levy is committed for two and will often eat
 * the counter it was trying to escape.
 *
 * One or two beats, never three as a baseline — a dial the player is meant to work constantly
 * cannot cost a fifth of the battle every time it is touched. Three is a *punishment* state,
 * reserved for a host whose morale has already gone.
 */
export const BATTLE_REFORM_BEATS = {
  /** tier 0 levy, tier 1 trained, tier 2 royal guard — before the general is counted. */
  byTier: [2, 2, 1],
  /** A commander this good shaves a beat off, to a floor of one. */
  martialShavesAt: 45,
  /** A host below the rout line cannot re-form cleanly whatever it is. */
  broken: 3,
  /** ...unless it is very well led. */
  brokenWellLed: 2,
  brokenWellLedMartial: 80,
  min: 1,
  max: 3,
};

/**
 * Heart a host loses each beat while its shape is being answered, on top of the trade.
 *
 * Without this the ring could not decide a fight: a battle is won by *breaking* the enemy inside
 * the round budget, so a counter that only trades more efficiently just runs out the clock. It is
 * also the truer reading — a wedge stopped dead by levelled spears does not lose a careful
 * exchange, it recoils.
 *
 * 0.4 down from 0.7, and this is the full-tier rate: the drip scales with how badly a side is
 * countered — `(|tier| / 2) × this`, so a soft counter drips half — and Cố thủ halves whatever
 * lands. Flat 0.7 was closing close fights before the ring had time to be interesting; the cut
 * plus the scaling is what lets a losing side dig in and actually ride a bad window out.
 */
export const BATTLE_COUNTER_MORALE = 0.4;
/**
 * How many economy ticks a Moment holds the fight open for.
 *
 * Measured in ticks, and the fight *waits* — that is the whole mechanic. Counted in beats it was
 * unanswerable: `advanceBattle` resolves `BATTLE_BEATS_PER_TICK` beats in one burst, so a
 * three-beat window opened and was answered by the general inside a single 3.5s tick, before the
 * screen had drawn it. A question nobody can answer is not a decision, it is a caption.
 *
 * One tick is about three and a half seconds to read two options and press one.
 */
export const BATTLE_MOMENT_TICKS = 1;
/** At most this many in one engagement. Above it the fight becomes whack-a-mole. */
export const BATTLE_MOMENTS_PER_FIGHT = 2;
/**
 * A great battle gets the third question, and an ordinary engagement does not.
 *
 * A fight is about twenty beats at `BATTLE_TICK_MS` 560 — call it twelve seconds of watching — and
 * three stops of one world tick each freezes the screen for more of the engagement than it runs.
 * The old budget of three was tuned when the player had nothing to do *between* Moments; they now
 * have a dial they touch three or four times. Keeping the third for `isGreat` also gives a great
 * battle a shape an ordinary one does not have.
 */
export const BATTLE_MOMENTS_PER_GREAT_FIGHT = 3;
/** Beats before the first one may be raised, so a fight never opens on a decision. */
export const BATTLE_MOMENT_EARLIEST = 4;
/**
 * Beats that must pass between one question and the next.
 *
 * Without it the three a fight is allowed were raised on three consecutive beats, as soon as the
 * earliest gate opened — so every question whose trigger belongs to the *end* of a fight was
 * unreachable in practice. Measured across sixty engagements: `last-rounds`, `night-falls`,
 * `they-offer-terms` and `their-line-thins` fired exactly zero times between them, because the
 * budget was always spent by beat six.
 *
 * Eight rather than five, measured again: an engagement runs about twenty-five beats, of which the
 * first nine are the approach, and at a gap of five the three questions landed on beats 4, 9 and
 * 14 — which is exchange five of sixteen. Every question about the *end* of a fight (the clock
 * running out, the light going, terms offered) was still unreachable, one layer further in. At
 * eight they land near beats 4, 12 and 20, which is the opening, the middle and the last third.
 */
export const BATTLE_MOMENT_GAP = 8;
/** Beats a Moment's bonus lasts once taken. */
export const BATTLE_MOMENT_BONUS_BEATS = 4;
/** How much a loosing host multiplies its volley by, against a host that is closing. */
export const BATTLE_LOOSE_VOLLEY = 1.6;
/** Share of incoming arrows a charging host avoids by closing the distance quickly. */
export const BATTLE_CHARGE_COVER = 0.6;
/**
 * How long the beat clock holds on contact and on a host breaking.
 *
 * Long enough to feel as weight, short enough that it never reads as a dropped frame — and it only
 * fires three or four times in a whole fight, so it cannot become the rhythm itself.
 */
export const BATTLE_HIT_STOP_MS = 110;
/** Morale a charge, or fresh troops arriving, puts into the line. */
export const BATTLE_CHARGE_MORALE = 9;

// ── Morale: the battle's real currency ──────────────────────────────────────
/**
 * Morale lost per beat, as a multiple of the share of the host that fell in it. `armyPower`
 * multiplies by `morale / 100`, so this is what turns a bad exchange into a collapse rather
 * than a slow, even grind.
 */
export const BATTLE_MORALE_PER_LOSS = 52;
// Retuned from 74 when the drop stopped being diluted. It used to be divided by `ourStart`, which
// counts the reserve standing at camp and grows again when relief arrives; it is now divided by
// the line that is actually being shot at, so the same number bites far harder and compounds as a
// host shrinks. Measured across the lab at 200 engagements a policy: at 62 good play breaks the
// enemy in 85% of fights and wins 85% of them — a solved game — and at 80 the rout rate is 99.5%.
// At 52 the adaptive player wins 52.5% and routs 52%, which is the fight this screen exists for.
/**
 * Morale recovered by the side that won an exchange.
 *
 * Halved from 0.7. Applied every beat to whichever side traded better, it was worth up to eleven
 * points across a fight — a standing floor under the winner's heart that, together with the
 * morale drop being diluted by the reserve, is why a defence measured across six seeded runs never
 * fell below 68 on average. It exists so a side that is winning does not also crumble; it does not
 * need to be large enough to cancel the cost of winning.
 */
export const BATTLE_MORALE_WIN_GAIN = 0.35;
/** Below this a host breaks and the engagement ends in a rout. */
export const BATTLE_ROUT_MORALE = 32;
/** Men each archer accounts for per beat of the approach. */
export const BATTLE_VOLLEY_BITE = 0.03;
/** Morale a rally restores, before the general's martial is added on top. */
export const BATTLE_RALLY_BASE = 10;
/**
 * How much a rally is amplified by the morale already lost. At 1.5 a rally on a line that has
 * shed two thirds of its heart is worth twice one spent fresh — which is what makes *when* to
 * spend it a decision rather than a reminder.
 */
export const BATTLE_RALLY_DESPERATION = 1.5;

/**
 * Share of a battle's losses that rejoin a host which withdrew in good order — stragglers and
 * the lightly wounded catching up over the following days. A routed host recovers none of it.
 * This is the whole difference between choosing to pull out and being broken.
 */
export const BATTLE_WITHDRAW_RECOVERY = 0.45;

/**
 * Extra share of a host cut down while routing. Being broken has to cost more than choosing to
 * withdraw, or the retreat order has no purpose and the rout no weight.
 */
export const BATTLE_ROUT_LOSS_SHARE = 0.3;

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
/**
 * The summon's own table — deliberately meaner than the Power Draft's.
 *
 * It used to reuse BASE_DRAFT_WEIGHTS (62/26/10/2), which across three cards put a gold-or-better
 * in roughly every third summon before pity even started helping — every draw felt blessed and so
 * none did. At 70/23/6/1 a jade is a ~3%-per-summon event and a gold roughly one summon in six,
 * with the pity ramp below still guaranteeing the cold streak corrects itself.
 */
export const SUMMON_WEIGHTS: Record<AscentRarity, number> = {
  bronze: 70,
  silver: 23,
  gold: 6,
  jade: 1,
};
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
  // A small realm still supports exactly one — two hosts on one province bankrupt its food and
  // supply income within a couple of seasons and neither can then be replaced.
  //
  // The ceiling was 3 for as long as waves were sized against the realm's own defence: under
  // that curve a fourth host summoned a proportionally larger wave, so the realm's strength was
  // structurally capped and raising the cap changed nothing but the upkeep. Measured after the
  // wave curve moved to ambition, that cap became the thing *blocking* the mode's central
  // trade: a seventeen-province realm and a ten-province one both fielded three hosts and
  // therefore had near-identical defence, so expanding bought a score and nothing else. At 6 a
  // realm that takes ground can actually garrison it, which is what makes the ground worth its
  // price in ambition.
  return Math.min(6, 1 + Math.floor(ownedLands / 3));
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

// ── Vassalage and arrivals ──────────────────────────────────────────────────
/**
 * A rival crown sworn to the player.
 *
 * Capped at two, and never the last sovereign. `tickWaveDirector` increments the wave counter
 * and *then* bails when `pickAggressor` finds nobody, so vassalising the whole world would leave
 * a run that cannot be lost and keeps scoring — the cap is what keeps a world that wants you dead.
 */
export const VASSAL_MAX = 2;
/** Tribute as a share of the vassal's own strength, so a broken vassal pays less. */
export const VASSAL_TRIBUTE_SHARE = 0.02;
export const VASSAL_TRIBUTE_MIN = 10;
export const VASSAL_TRIBUTE_MAX = 46;
/** They must genuinely fear you before an oath is even offered. */
export const VASSAL_FEAR_FLOOR = 62;
export const VASSAL_RELATIONS_FLOOR = 40;
/** Loyalty drifts toward fear at this rate; below the break point they revolt. */
export const VASSAL_LOYALTY_DRIFT = 0.35;
export const VASSAL_BREAK_LOYALTY = 30;
/**
 * What a vassal adds to POWER, scaled by loyalty.
 *
 * POWER is the HUD figure and the run score. It is deliberately *not* added to
 * `contestedDefencePower`: a vassal is off the map and brings no host to your capital, so
 * counting it there would inflate raid budgets and make `projectedWinChance` quote odds
 * `resolveInvaderBattle` will not honour.
 */
export const VASSAL_POWER_SHARE = 0.35;
/** Provinces-worth of ambition charged when a crown bends the knee. Durable growth costs heat. */
export const VASSAL_AMBITION_PROVINCES = 2;

/** A champion's arrival host, as a share of what is currently coming at the realm. */
export const ARRIVAL_HOST_SHARE = 0.55;
export const ARRIVAL_HOST_MIN = 220;
/** Seasons of income an arriving treasury is worth. */
export const ARRIVAL_TREASURY_SEASONS = 14;
export const ARRIVAL_WALL_DEFENCE = 26;
export const ARRIVAL_TRUCE_SEASONS = 6;
