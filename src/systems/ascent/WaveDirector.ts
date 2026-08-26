import { isVassal } from './VassalSystem';
import { PLAYER_KINGDOM_ID } from '../../game/constants';
import {
  BOSS_EVERY_N_WAVES,
  BOSS_PRESSURE_MULT,
  COALITION_WAVE_MULT,
  BOSS_TELEGRAPH_TICKS,
  INVADER_POWER_PER_SOLDIER,
  MAX_LIVE_INVADER_HOSTS,
  MIN_WAVE_SOLDIERS,
  RAID_INTERVAL_TICKS,
  MERCENARY_GOLD_BASE,
  MERCENARY_INCOME_MULT,
  MERCENARY_POWER_SHARE,
  WAR_PURCHASE_ESCALATION,
  MIN_RAID_SOLDIERS,
  RAID_MIN_LANDS,
  RAID_POWER_SHARE,
  FORTIFY_DEFENCE_SHARE,
  FORTIFY_DEFENSE_MIN,
  RESPONSE_ASK_BELOW_WIN,
  RAID_WAVE_CLEARANCE,
  WAVE_BASELINE_GROWTH,
  WAVE_BASELINE_POWER,
  WAVE_INTERVAL_TICKS,
  WAVE_LAG,
  WAVE_OPENING_SHARE,
  WAVE_SHADOW_BASE,
  WAVE_SHADOW_CEIL,
  WAVE_SHADOW_HEAT_SHARE,
  WAVE_SHADOW_MAX,
  WAVE_SHADOW_RAMP,
  XP_PER_WAVE_SURVIVED,
 waveMatchFactor,
} from '../../game/ascentConfig';
import { MIN_ARMY_SOLDIERS, recruitSoldiers, SUPPLY_TICKS_HELD, waveHostCount } from '../../game/ascentConfig';
import { weightedPick } from '../../utils/math';
import { difficultyArmyScale, launchOffMapInvasion } from '../empire/InvasionSystem';
import { applyResourceDelta, canSpend } from '../ResourceSystem';
import { armyPower, queueRecruitment } from '../WarSystem';
import { pushToast } from '../empire/notifications';
import { enqueueAscentPrompt } from './AscentState';
import {
  ambitionHeat,
  chargeAmbition,
  decayAmbition,
  payAmbitionSpoils,
  recordAmbitionPeak,
} from './AmbitionSystem';
import { waveDelayTicks, warPurchaseDiscount } from './DoctrineSystem';
import { addAscentXp, contestedDefencePower, ownedLandCount } from './PowerSystem';
import { heroName, t } from '../../i18n';
import type {
  AscentPrompt,
  AscentWaveCue,
  AscentWaveOutcome,
  CourtPositionId,
  EmpireResponseOption,
  GameState,
  Hero,
  Kingdom,
  Land,
} from '../../state/types';

/**
 * Costs of the prepared responses.
 *
 * Scaled with the wave rather than flat: the realm's gold income compounds hard once it
 * holds a dozen provinces, and fixed prices become rounding errors by mid-run — every
 * option reads "affordable" and the choice stops being a choice.
 */
const FORTIFY_GOLD_BASE = 120;
const BUYOFF_GOLD_BASE = 260;
const SEND_HOST_SUPPLIES = 35;

/**
 * Prices are the greater of a wave-scaled floor and a multiple of the realm's gold income.
 *
 * Income compounds hard enough that a treasury can reach six figures; against that, any
 * fixed or merely wave-scaled price is a rounding error and every option reads "affordable"
 * forever. Pegging to income keeps the decision real however rich the realm gets.
 */
/**
 * Multiplier on every gold price on the response card, from how many the realm has already
 * bought this run. One counter for walls and sellswords alike: they are the same purchase —
 * coin turned into survival — and pricing them independently just moves the win button from
 * one row of the card to the other.
 */
function warPurchaseMultiplier(state: GameState): number {
  const escalation = Math.pow(WAR_PURCHASE_ESCALATION, state.ascent?.warPurchases ?? 0);
  // Salt Roads is a discount on this, not on a market the player never visits — see the note
  // on its rewrite in `ascentCards.ts`.
  return escalation * (1 - warPurchaseDiscount(state));
}

function fortifyCost(state: GameState, wave: number): number {
  const floor = Math.max(FORTIFY_GOLD_BASE * (1 + wave * 0.25), state.resourceRates.gold * 6);
  return Math.round(floor * warPurchaseMultiplier(state));
}

function buyOffCost(state: GameState, wave: number): number {
  return Math.round(Math.max(BUYOFF_GOLD_BASE * (1 + wave * 0.32), state.resourceRates.gold * 14));
}

/**
 * Price of a mercenary company, pegged to income like every other response.
 *
 * This is the mode's answer to a treasury that does nothing. Gold compounds hard — a realm
 * ten minutes in banks tens of thousands with no way to convert any of it into survival —
 * so the run needs one lever that turns coin directly into soldiers, now, with no muster
 * timer, no free commander and no manpower cost.
 */
function mercenaryCost(state: GameState, wave: number): number {
  const floor = Math.max(MERCENARY_GOLD_BASE * (1 + wave * 0.3), state.resourceRates.gold * MERCENARY_INCOME_MULT);
  return Math.round(floor * warPurchaseMultiplier(state));
}

/** Soldiers a mercenary company brings: a real answer to the wave, not a token. */
function mercenarySize(state: GameState): number {
  return Math.max(MIN_ARMY_SOLDIERS, Math.round(laggedDefencePower(state) * MERCENARY_POWER_SHARE / INVADER_POWER_PER_SOLDIER));
}
/** Ceiling on hosts the emergency levy may add on top of whatever the autopilot keeps. */
const MAX_STANDING_HOSTS = 5;

/**
 * Walls bought by the Fortify option, sized as a share of **the wave they must stop**.
 *
 * A flat +10 was the emptiest option on the card: `landGarrisonPower` values a point of defence
 * at 16, so ten points added 160 power to a realm fielding four thousand — four tenths of one
 * percent for six seasons of income. Scaling it fixed that and created something worse. Sized
 * as a share of the realm's *own* defence, each purchase added 18% of the current total and the
 * next purchase was 18% of that — a compounding engine growing at 1.18 per wave against a
 * threat curve growing at 1.11. Measured with the strategy driver: a run that simply bought
 * walls on every response survived all twenty seeds to the tick limit without dying once, both
 * before and after mercenary prices were made to escalate. Walls, not sellswords, were the win
 * button.
 *
 * Pricing them against the incoming wave keeps both properties and neither pathology. The
 * purchase is always worth its price, because it is always a fixed share of exactly the problem
 * in front of the player; and buying one does not make the next one bigger, so a run's total
 * fortification *tracks* the curve instead of outrunning it.
 */
function fortifyDefenceGain(state: GameState): number {
  const ascent = state.ascent;
  const wave = ascent?.wave ?? 1;
  const incoming = Math.max(
    ascent?.threat ?? 0,
    waveTargetPower(state, wave, ascent?.lastWaveBoss ?? false, liveWaveHeat(state)),
  );
  return Math.max(FORTIFY_DEFENSE_MIN, Math.round((incoming * FORTIFY_DEFENCE_SHARE) / 16));
}
/**
 * The bounds of the ±10% swing `resolveInvaderBattle` rolls on every fight. Mirrored here so the
 * odds the player is shown come from the same distribution that decides the outcome; if that
 * fuzz ever changes, these must change with it.
 */
const FUZZ_MIN = 0.9;
const FUZZ_MAX = 1.1;
/** Invader power above which the attacker counts as a large host and brings heavier siege. */
const LARGE_HOST_POWER = 1000 * INVADER_POWER_PER_SOLDIER;

const BUYOFF_DELAY_TICKS = 6;
const ENDURE_MOMENTUM = 60;

export function isBossWave(wave: number): boolean {
  return wave > 0 && wave % BOSS_EVERY_N_WAVES === 0;
}

/**
 * The realm's defensive power as raids, mercenary companies and the wave's shadow see it: what
 * it could field `WAVE_LAG` waves ago, not what it can field now.
 *
 * The pure mirror (`lagged × pressure`, ratio pinned near 1) was removed for making every pick
 * self-cancelling; the shadow in `waveTargetPower` reads this again, but only ever as a
 * SUB-mirror share — the lag is what makes consolidating between waves worth something, and the
 * share below one is where the player's edge lives.
 */
export function laggedDefencePower(state: GameState): number {
  const ascent = state.ascent;
  const live = contestedDefencePower(state);
  if (!ascent) return live * WAVE_OPENING_SHARE;

  const samples = ascent.defenceSamples ?? [];
  const lagged = samples[samples.length - WAVE_LAG];
  // Early on there is no history to lag against, so quote a share of the live figure — the
  // opening waves are meant to be winnable while the realm is still one province and one host.
  if (lagged === undefined) return live * WAVE_OPENING_SHARE;

  // Never *more* than the live figure: a realm that just lost its army should not keep facing
  // waves sized for the army it no longer has, or a single bad battle ends the run outright.
  return Math.min(lagged, live);
}

/**
 * **How dangerous the next wave is, and why.** The one number this whole mode turns on.
 *
 * Two terms, and the split between them is the design:
 *
 *   - a **baseline** that climbs with the wave number alone, which the player cannot influence.
 *     This is the world getting worse on its own schedule, and it is what makes doing nothing a
 *     losing strategy rather than an unbeatable one.
 *   - the **ambition** the player has standing, which multiplies it. This is the half they
 *     chose, they watched themselves choose, and they can let cool.
 *
 * What it replaces — `laggedDefencePower × wavePressure` — read the realm's own defence, so
 * every point of strength bought summoned a matching point of threat and no choice could ever
 * change the outcome. Measured across a full run: a player who declined everything held a
 * defence that plateaued at 3,000 against a threat pinned at 0.94× of it for thirty waves,
 * while a player who engaged climbed to 8,088 with the threat tracking at 0.95× and died for
 * it. That is a treadmill wearing a difficulty curve's clothes.
 *
 * The lag machinery (`laggedDefencePower`, `defenceSamples`) survives because raids and
 * mercenary companies are still sized against what the realm can field — those *should* scale
 * with the player. Only the wave stopped asking.
 */
export function waveTargetPower(
  state: GameState,
  wave: number,
  boss: boolean,
  heat = ambitionHeat(state),
): number {
  const baseline = WAVE_BASELINE_POWER * Math.pow(WAVE_BASELINE_GROWTH, Math.max(0, wave - 1));
  const target = baseline * heat * (boss ? BOSS_PRESSURE_MULT : 1);
  // The run answers strength: a realm marching ahead of the calendar is quoted a wave sized to
  // IT, not to the wave number. Applied at the single source — the soldier budget, the
  // budget-spent skip and the HUD's projection all read this — so the quote on the strength
  // rail can never disagree with the host that lands.
  const curve = target * waveMatchFactor(state.ascent?.power ?? 0, target);

  // The realm's shadow (see the WAVE_SHADOW_* block in ascentConfig): the curve above still
  // owns the floor for a realm that has done nothing, but a compounding economy laps any
  // calendar — measured, defence at 17,800 against waves of a few hundred men — so the wave is
  // also floored at a growing, sub-mirror share of what the realm could field WAVE_LAG waves
  // ago. Under the share the fight is always real; over it, the player's edge is their own.
  const rampShare = Math.min(WAVE_SHADOW_MAX, WAVE_SHADOW_BASE + WAVE_SHADOW_RAMP * Math.max(0, wave - 1));
  const heatedShare = Math.min(WAVE_SHADOW_CEIL, rampShare * (1 + (heat - 1) * WAVE_SHADOW_HEAT_SHARE));
  const shadow = laggedDefencePower(state) * heatedShare * (boss ? BOSS_PRESSURE_MULT : 1);

  return Math.max(curve, shadow);
}

/** The multiplier the wave on the map was sized with, for everything that must match its quote. */
function liveWaveHeat(state: GameState): number {
  return state.ascent?.waveHeat ?? 1;
}

/**
 * Soldier budget for a wave, from the target above.
 *
 * The target is for the *total* threat standing on the map, not for each spawn: a conquest host
 * takes many seasons to march in and reduce a province, so at a 12-tick cadence the next wave
 * lands while the last is still fighting. Budgeting per-spawn let them pile up until four hosts
 * were live at once and no realm could hold — so whatever is already marching is deducted here.
 */
export function waveSoldierBudget(
  state: GameState,
  wave: number,
  boss: boolean,
  heat = liveWaveHeat(state),
): number {
  const target = waveTargetPower(state, wave, boss, heat);
  const alreadyMarching = liveInvaderPower(state);
  const remaining = Math.max(0, target - alreadyMarching);
  return Math.max(MIN_WAVE_SOLDIERS, Math.round(remaining / INVADER_POWER_PER_SOLDIER));
}

/**
 * Whether the map is already carrying its share of pressure. A wave that would add nothing is
 * skipped entirely rather than spawning a token host on top of the fight in progress.
 */
export function waveBudgetSpent(state: GameState, wave: number, boss: boolean): boolean {
  // A hard ceiling on hosts, not only on power. Power alone let the map accumulate five
  // simultaneous invaders whenever the realm's defence was high enough to justify the budget —
  // which reads as a permanent siege rather than a wave, gives the player no gap in which to
  // retake anything, and made a whole run's midgame one continuous unwinnable fight.
  if ((state.invasions?.length ?? 0) >= MAX_LIVE_INVADER_HOSTS) return true;
  return liveInvaderPower(state) >= waveTargetPower(state, wave, boss, liveWaveHeat(state));
}

/**
 * The *projected* threat for the HUD, before a wave exists to measure.
 *
 * Quotes what the next wave will actually bring rather than an abstract geometric curve: the
 * old projection was computed from `BASE_THREAT × GROWTH^wave` and had no relationship to the
 * host that then spawned, so the readout told the player they were "behind" while a trivial
 * wave landed — or the reverse.
 *
 * Defaults to *live* ambition, not the wave-in-flight's snapshot, because its main job now is
 * to price the next wave while the player is still deciding. That is the moment the whole
 * mechanic exists for: the number on the HUD climbs as they commit, so the danger is something
 * they watched themselves buy.
 */
export function projectedWaveThreat(state: GameState, wave: number, heat = ambitionHeat(state)): number {
  const boss = isBossWave(wave);
  // `waveSoldierBudget` is the whole wave's budget, split across its hosts — not a per-host
  // figure, so it must not be multiplied by the host count again.
  return Math.round(waveSoldierBudget(state, wave, boss, heat) * INVADER_POWER_PER_SOLDIER);
}

/** Records what the realm could field, for later waves to be sized against. */
export function sampleDefencePower(state: GameState): void {
  const ascent = state.ascent;
  if (!ascent) return;
  ascent.defenceSamples ??= [];
  ascent.defenceSamples.push(contestedDefencePower(state));
  // Only the recent tail is ever read; keeping the whole run would bloat every save.
  if (ascent.defenceSamples.length > 12) ascent.defenceSamples.shift();
}

/**
 * Battle power of the hosts actually on the map right now.
 *
 * The THREAT readout is *measured*, not invented. `launchOffMapInvasion` clamps a wave's
 * size against the player's own military, so a purely formula-driven number would drift
 * far from what actually attacks and the HUD would lie about whether you are winning.
 */
export function liveInvaderPower(state: GameState): number {
  if (!state.invasions?.length) return 0;
  let total = 0;
  for (const record of state.invasions) {
    const army = state.armies.find((candidate) => candidate.id === record.armyId);
    if (army) total += armyPower(state, army);
  }
  return Math.round(total);
}


/** Picks the aggressor: the angriest and strongest surviving empire, with some spread. */
function pickAggressor(state: GameState): Kingdom | undefined {
  // A crown sworn to you does not march on you. Note `tickWaveDirector` counts the wave up and
  // *then* bails when this returns nothing, so an empty pool is a run that cannot be lost —
  // `canVassalize` refuses the last sovereign for exactly that reason.
  const candidates = state.kingdoms.filter(
    (kingdom) => kingdom.id !== PLAYER_KINGDOM_ID && !kingdom.isDefeated && !isVassal(kingdom),
  );
  return weightedPick(candidates, (kingdom) => {
    const hostility = 100 - (kingdom.relations ?? 50);
    return Math.max(5, hostility + (kingdom.power ?? 40) * 0.5);
  });
}

function playerCapital(state: GameState): Land | undefined {
  const owned = state.lands.filter((land) => land.ownerId === PLAYER_KINGDOM_ID);
  return owned.find((land) => land.type === 'castle') ?? owned[0];
}

/**
 * Odds of holding, computed from the model that actually decides the battle.
 *
 * `resolveInvaderBattle` is not a ratio — it is a threshold with noise:
 *
 *     victory(attacker) ⟺ attackerPower ≥ defenderPower × siegeMult × fuzz,
 *     fuzz ~ Uniform(0.9, 1.1)
 *
 * so with `r = attackerPower / (defenderPower × siegeMult)` the defender holds with probability
 * `P(fuzz > r)`, which is **1 below r = 0.9, 0 above r = 1.1, and linear between**. A sharp
 * band, not a gentle curve.
 *
 * The `power / (power + threat)` shape this replaces was an invented figure that never touched
 * the real maths, and it was wrong in both directions at once: at four thousand defence against
 * two thousand threat it advertised 67% when the true answer was a certainty, and because it can
 * reach neither 0 nor 100 it compressed every option on the card into a five-point huddle. The
 * card differentiated on *axis* while its numbers said nothing.
 *
 * Quoting the real model means an option that pushes the realm across the band swings the number
 * hard — which is exactly when the player most needs to be told that their gold changes the
 * outcome — and a wave that is simply unwinnable, or simply won, now says so.
 */
function projectedWinChance(state: GameState, threat: number, bonus = 0): number {
  const power = contestedDefencePower(state) * (1 + bonus);
  if (power <= 0) return 0;

  // Great hosts bring siege engines and negate more of the walls; `resolveInvaderBattle` picks
  // the same three tiers off host size and `great`, so the projection has to as well or it will
  // be systematically optimistic about exactly the waves that matter most.
  const boss = state.ascent?.lastWaveBoss ?? false;
  const siegeMult = boss ? 0.72 : threat > LARGE_HOST_POWER ? 0.8 : 0.85;

  const ratio = threat / Math.max(1, power * siegeMult);
  if (ratio <= FUZZ_MIN) return 100;
  if (ratio >= FUZZ_MAX) return 0;
  return Math.round(((FUZZ_MAX - ratio) / (FUZZ_MAX - FUZZ_MIN)) * 100);
}

/**
 * Size of the host raised by the emergency levy.
 *
 * Scaled off available manpower like any other muster, and never below a full host. A fixed
 * small levy is actively harmful: the autopilot counts any army above a fraction of a full
 * host toward its target, so a trickle of tiny emergency armies convinces it the realm is
 * already defended and it stops raising the real one.
 */
function emergencyLevySize(state: GameState): number {
  return Math.max(MIN_ARMY_SOLDIERS, recruitSoldiers(Math.max(0, state.resources.humans - 60)));
}

/** Frees a hero from whatever posting they hold so they can take a new command. */
function releaseHero(state: GameState, heroId: string): void {
  const hero = state.heroes.find((candidate) => candidate.id === heroId);
  if (!hero?.assignedTo) return;

  if (hero.assignedTo.startsWith('court:')) {
    const seat = hero.assignedTo.slice('court:'.length) as CourtPositionId;
    if (state.court.seats[seat] === hero.id) state.court.seats[seat] = undefined;
  } else {
    const army = state.armies.find((candidate) => candidate.id === hero.assignedTo);
    if (army?.generalHeroId === hero.id) army.generalHeroId = undefined;
  }
  hero.assignedTo = undefined;
}

/**
 * Builds the counter-play menu: everything the player might want to *buy* about an incoming
 * wave, on one modal. Raising a host is not on it — see the note in the return below.
 */
export function buildResponseOptions(state: GameState, threat: number): EmpireResponseOption[] {
  const wave = state.ascent?.wave ?? 1;
  const fortify = fortifyCost(state, wave);
  const buyOff = buyOffCost(state, wave);

  // Each option's odds are derived from what it actually adds to the defence *this* wave,
  // rather than from a hand-picked percentage.
  //
  // The constants this replaces (+0.25 / +0.12 / +0.30) produced five options whose quoted
  // outcomes sat within an average of five percentage points of each other across a whole run —
  // "you will win with 82%, spend nine thousand gold to win with 84%" — so the screen read as a
  // toll booth rather than a decision. Deriving them separates the options honestly: walls are
  // a modest permanent gain, a bought company is a large immediate one, and an emergency levy
  // is worth *nothing* against the host already on its way, because it is still mustering when
  // that host arrives. It pays off from the next wave on, and the card now says so.
  const defence = Math.max(1, contestedDefencePower(state));
  const wallsGain = (fortifyDefenceGain(state) * 16) / defence;
  const mercGain = (mercenarySize(state) * INVADER_POWER_PER_SOLDIER) / defence;

  /**
   * **No `send-host` row.** It was the emergency levy — *Phái {tướng} và mộ binh* — and it is
   * the same act as Lập quân, which the player already has a whole screen for, reachable from
   * the bar at any time and with every dial the muster form offers: how many men, which arms,
   * which commander, what standing order.
   *
   * Two rows for one act is not two choices. This one asked for a commander the realm might not
   * have spare, spent supplies rather than gold, capped itself against `MAX_STANDING_HOSTS`, and
   * — by its own comment above — was worth nothing at all against the host already marching,
   * because the levy it raises is still mustering when that host lands. So the card carried a
   * row that duplicated a better screen and did nothing about the wave it was answering.
   *
   * `applyResponse` still handles `'send-host'`, because a save written before this change can
   * hold a pending prompt that offers it.
   */
  return [
    {
      id: 'fortify',
      cost: { gold: fortify },
      winChance: projectedWinChance(state, threat, wallsGain),
      defence: fortifyDefenceGain(state),
      affordable: canSpend(state, { gold: fortify }),
    },
    {
      id: 'buy-off',
      cost: { gold: buyOff },
      delayTicks: BUYOFF_DELAY_TICKS,
      affordable: canSpend(state, { gold: buyOff }),
    },
    {
      id: 'hire-mercenaries',
      cost: { gold: mercenaryCost(state, wave) },
      winChance: projectedWinChance(state, threat, mercGain),
      // No commander and no manpower needed — that is the point. Coin is the only thing it
      // asks for, so a rich realm always has one more answer than a poor one.
      affordable:
        canSpend(state, { gold: mercenaryCost(state, wave) }) &&
        state.armies.filter((army) => army.kingdomId === PLAYER_KINGDOM_ID).length < MAX_STANDING_HOSTS,
    },
    {
      id: 'endure',
      momentum: ENDURE_MOMENTUM,
      winChance: projectedWinChance(state, threat),
      // Always takeable: the player must never be cornered with no legal move.
      affordable: true,
    },
  ];
}

/**
 * Puts a bought company straight onto the capital under no commander.
 *
 * Deliberately bypasses `queueRecruitment`: that spends manpower, needs an unposted hero, and
 * takes seasons to muster — none of which a realm facing a wave *this* season can supply. The
 * whole value of the option is that gold buys time the normal levy cannot.
 */
function hireMercenaries(state: GameState, soldiers: number): void {
  const home = playerCapital(state);
  if (!home) return;

  state.armies.push({
    id: `mercenary-${state.turn}`,
    kingdomId: PLAYER_KINGDOM_ID,
    name: t('ascent.response.mercenaryHost'),
    landId: home.id,
    units: {
      spearmen: Math.floor(soldiers * 0.55),
      archers: Math.floor(soldiers * 0.25),
      heavyInfantry: Math.floor(soldiers * 0.2),
    },
    // Paid soldiers, not levies: they fight well but will not hold a losing line for long.
    morale: 80,
    supply: 85,
    rations: Math.ceil(soldiers / 100) * SUPPLY_TICKS_HELD,
    provisions: Math.ceil(soldiers / 150) * SUPPLY_TICKS_HELD,
    level: 2,
    experience: 0,
    experienceToNextLevel: 160,
    autoDefend: true,
  });
  pushToast(state, t('ascent.response.mercenaryHired', { n: soldiers }), 'reward');
}

/**
 * Queues a banner cue for the UI to play.
 *
 * Appended, never overwritten: a wave the realm plainly holds is met without a response card, so
 * `startWave` closes the previous invasion and launches the next one in the same tick. A single
 * slot lost the older of the two every time, and the older of the two is always the *result* —
 * which is to say the win.
 *
 * Capped at three. A queue that outgrew the screen would be a backlog of proclamations about
 * invasions several seasons behind the one the player is fighting, and the newest is always the
 * one that matters most.
 */
function raiseWaveCue(state: GameState, cue: Omit<AscentWaveCue, 'id'>): void {
  const ascent = state.ascent;
  if (!ascent) return;
  ascent.waveCueSeq = (ascent.waveCueSeq ?? 0) + 1;
  ascent.waveCues ??= [];
  ascent.waveCues.push({ ...cue, id: ascent.waveCueSeq });
  if (ascent.waveCues.length > 3) ascent.waveCues.splice(0, ascent.waveCues.length - 3);
}

/**
 * Pays and announces the result of the invasion that is standing on the map (or has just left it).
 *
 * Called from two places and it must run at most once per wave, which is what `pendingWave`
 * guarantees: the clock calls it the tick the map clears, and `startWave` calls it as a fallback
 * for a wave that never did. The figures are all differences against the snapshot taken when the
 * hosts landed, so the banner can say what the invasion *cost* rather than what the realm happens
 * to hold.
 *
 * The payout is unchanged from when it lived in `startWave` — same momentum, same spoils, same
 * heat, because `waveHeat` is only reset by the next wave being raised. What moved is *when* the
 * player is told, and that is the whole point: "wave 6 broken" arriving five seasons after the
 * last host of wave 6 died is not a reward, it is a footnote.
 */
function resolveWaveResult(state: GameState): void {
  const ascent = state.ascent;
  if (!ascent) return;

  // The snapshot **is** the "a result is owed for this wave" flag, and clearing it here is what
  // makes the payout idempotent. Without this guard the two callers both paid: the map clearing
  // paid once, and the next wave's clock paid again for a wave already settled — measured over a
  // 337-tick run, 28 waves were paid 33 times, and every one of those was momentum and spoils the
  // realm had not earned.
  const snapshot = ascent.pendingWave;
  if (!snapshot) return;
  ascent.pendingWave = undefined;

  ascent.wavesSurvived += 1;
  // The other end of the dial: surviving a wave you made dangerous pays more than surviving
  // one you hid from. Without this the counter is a pure tax and the correct play is always
  // to take nothing — the reward has to ride the same number as the risk or the choice is
  // not a choice.
  const heat = liveWaveHeat(state);
  const momentum = (XP_PER_WAVE_SURVIVED + (ascent.lastWaveBoss ? XP_PER_WAVE_SURVIVED : 0)) * heat;
  addAscentXp(state, momentum);
  payAmbitionSpoils(state, heat);

  const capital = state.lands.find((land) => land.id === ascent.capitalLandId);
  const heldCapital = !capital || capital.ownerId === PLAYER_KINGDOM_ID;

  // Reported, not modal.
  //
  // A Great Invasion surviving deserves acknowledgement, but a full-screen pause whose only
  // control was "Continue" accounted for nearly every remaining prompt in a run and had exactly
  // one legal answer, four to six times each time. The header strip marks the moment in the log;
  // the banner below marks it on the screen, and neither stops the game to collect a tap.
  pushToast(
    state,
    ascent.lastWaveBoss
      ? (heldCapital ? t('ascent.wave.bossTitle', { wave: ascent.wave }) : t('ascent.wave.bossTitleLost'))
      : (heldCapital ? t('ascent.wave.title', { wave: ascent.wave }) : t('ascent.wave.titleLost', { wave: ascent.wave })),
    heldCapital ? 'reward' : 'threat',
  );

  // A wave that never put a host on the map has nothing to report beyond the count — no landing
  // was announced, so announcing its end would be a banner for an invasion the player never saw.
  if (snapshot.hosts <= 0) return;

  const landsHeld = ownedLandCount(state);
  const landsLost = Math.max(0, snapshot.lands - landsHeld);
  const hostsBroken = Math.max(0, (state.invasionsRepelled ?? 0) - snapshot.repelledAt);
  const outcome: AscentWaveOutcome = !heldCapital
    ? 'overrun'
    : landsLost > 0 ? 'held' : 'triumph';

  raiseWaveCue(state, {
    phase: 'end',
    wave: snapshot.wave,
    boss: snapshot.boss,
    hosts: snapshot.hosts,
    power: snapshot.power,
    outcome,
    hostsBroken,
    landsLost,
    landsHeld,
    momentum: Math.round(momentum),
    survived: ascent.wavesSurvived,
    seasons: Math.max(1, state.turn - snapshot.turn),
    kingdomName: snapshot.kingdomName,
  });
}

/**
 * Fires a wave: raises the counter, sets the threat, and asks the player how to meet it.
 * The hosts are not spawned here — they launch when the response resolves, so a preparation
 * actually lands before the enemy does.
 */
function startWave(state: GameState): void {
  const ascent = state.ascent;
  if (!ascent) return;

  // Reaching a new wave means the previous one is behind you. Normally the result was already
  // paid and announced the tick its last host left the map; this is the fallback for the waves
  // that never clear — an overlapping wave, or one whose hosts were still marching when the next
  // clock ran out. `resolveWaveResult` is a no-op when the wave has already been settled, so the
  // count stays honest either way and is never paid twice.
  resolveWaveResult(state);

  // Recorded before the wave is sized, so this wave is measured against the realm as it
  // stood when the *previous* wave landed — see `laggedDefencePower`.
  sampleDefencePower(state);

  ascent.wave += 1;
  ascent.lastWaveBoss = isBossWave(ascent.wave);
  // Mountain Pass buys seasons: waves from beyond the passes arrive late, and the extra Court
  // phase it grants is the whole card.
  ascent.ticksToWave = WAVE_INTERVAL_TICKS + waveDelayTicks(state);
  ascent.bossTelegraphed = false;

  // The bill for the season the player just spent. Locked here and read by everything that
  // sizes or quotes this wave, then shed — so the wave arrives at exactly the price shown
  // while they were deciding, and the *next* one starts from a realm that has consolidated.
  recordAmbitionPeak(state);
  ascent.waveHeat = ambitionHeat(state);
  decayAmbition(state);

  // The wave's ledger is opened here, the moment its number exists, and `launchWave` fills in what
  // actually lands. Opening it here rather than at the landing is what lets one field answer "is a
  // result owed for this wave" for every path through the director — including the wave whose
  // spawn is skipped for want of budget, which is counted without ever being announced.
  ascent.pendingWave = {
    wave: ascent.wave,
    boss: ascent.lastWaveBoss,
    lands: ownedLandCount(state),
    hosts: 0,
    power: 0,
    repelledAt: state.invasionsRepelled ?? 0,
    turn: state.turn,
  };

  const aggressor = pickAggressor(state);
  if (!aggressor) return;

  // Before the hosts exist there is nothing to measure, so the modal quotes the projection.
  ascent.threat = projectedWaveThreat(state, ascent.wave, ascent.waveHeat);
  const options = buildResponseOptions(state, ascent.threat);

  // Only interrupt when the answer could change the outcome.
  //
  // Asking about every wave made this a quarter of every decision in a run, and the options on
  // it differed by an average of five percentage points — "you will win with 82%, spend nine
  // thousand gold to win with 84%?" is not a decision, it is a toll booth. Waves the realm is
  // plainly going to hold now resolve themselves and report through the header strip, which
  // both returns the map to the screen and reserves the modal for the waves that are in doubt.
  // Great Invasions and endured coalitions always ask, whatever the odds.
  const best = Math.max(...options.filter((o) => o.affordable && o.winChance).map((o) => o.winChance ?? 0), 0);
  const mustAsk = ascent.lastWaveBoss || ascent.coalitionPending;
  if (!mustAsk && best >= RESPONSE_ASK_BELOW_WIN) {
    addAscentXp(state, ENDURE_MOMENTUM);
    pushToast(state, t('ascent.wave.metAlone', { kingdom: aggressor.name, chance: best }), 'info');
    launchWave(state, aggressor.id, aggressor.king?.name ?? aggressor.name);
    return;
  }

  enqueueAscentPrompt(state, {
    kind: 'empire-response',
    wave: ascent.wave,
    threat: ascent.threat,
    kingdomId: aggressor.id,
    kingdomName: aggressor.name,
    ticksToArrival: 3,
    options,
  });
}

/** Spawns the hosts for a wave through the existing invasion pipeline. */
function launchWave(state: GameState, kingdomId: string, warlordName?: string): void {
  const ascent = state.ascent;
  if (!ascent) return;

  const boss = ascent.lastWaveBoss;
  // Counted before the spawn so hosts added by *this* wave can be told from whatever a raid or
  // an overlapping wave already had walking in.
  const hostsBefore = state.invasions?.length ?? 0;
  // The map is already carrying this wave's worth of pressure — adding to it would stack
  // hosts the realm has no way to answer. The wave counter still advanced, so the curve keeps
  // rising; what is skipped is the spawn, not the escalation.
  if (waveBudgetSpent(state, ascent.wave, boss)) {
    ascent.waveInFlight = (state.invasions?.length ?? 0) > 0;
    ascent.threat = liveInvaderPower(state);
    return;
  }

  // A coalition the player chose to endure lands as the next wave: more hosts, conquest
  // intent, and a heavier budget. Enduring has to be visibly worse than buying it off.
  const coalition = ascent.coalitionPending;
  ascent.coalitionPending = false;
  const hosts = Math.min(4, waveHostCount(ascent.wave, boss) + (coalition ? 2 : 0));
  // The one difficulty dial this mode actually honours.
  //
  // `difficultyArmyScale` exists and is applied inside `launchOffMapInvasion` — but only to the
  // per-host `rawSizes`, which the `clampFactor = totalSoldiers / rawTotal` normalisation then
  // divides straight back out. Passing an explicit `totalSoldiers`, as this call always does,
  // therefore cancelled difficulty exactly: easy and ironman spawned identical waves. Scaling the
  // budget itself is what makes the setting mean something.
  const difficulty = difficultyArmyScale(state.campaignConfig?.difficulty);
  launchOffMapInvasion(state, kingdomId, {
    forceCoalition: hosts,
    // An explicit budget, sized from the realm's lagged defensive power. Without it the
    // spawn is clamped against `getPlayerMilitary` — a headcount blind to every multiplier
    // the Power Draft stacks — and the wave arrives a fraction of the size it should be.
    totalSoldiers: Math.round(
      waveSoldierBudget(state, ascent.wave, boss) * (coalition ? COALITION_WAVE_MULT : 1) * difficulty,
    ),
    forceConquest: boss || coalition,
    // A named warlord is what flags the record as `great`, which drives the harder siege
    // maths in resolveInvaderBattle and the Great Invasion presentation.
    warlordName: boss ? warlordName : undefined,
  });
  ascent.waveInFlight = true;
  // Now that the hosts exist, replace the projection with what is actually marching.
  ascent.threat = liveInvaderPower(state);

  // The landing. Snapshotted here rather than when the counter advanced because the response
  // card can sit open for a season, and a province taken while deciding belongs to the season
  // before the invasion, not to it.
  const landed = Math.max(1, (state.invasions?.length ?? 0) - hostsBefore);
  const kingdom = state.kingdoms.find((candidate) => candidate.id === kingdomId);
  // Re-measured at the landing, not left at what `startWave` opened the ledger with: the response
  // card can stand for a season, and a province taken while the player was deciding belongs to the
  // season before this invasion rather than to it.
  const snapshot = ascent.pendingWave;
  if (snapshot && snapshot.wave === ascent.wave) {
    snapshot.kingdomName = kingdom?.name;
    snapshot.lands = ownedLandCount(state);
    snapshot.hosts = landed;
    snapshot.power = ascent.threat;
    snapshot.repelledAt = state.invasionsRepelled ?? 0;
    snapshot.turn = state.turn;
  }
  raiseWaveCue(state, {
    phase: 'start',
    wave: ascent.wave,
    boss,
    kingdomName: kingdom?.name,
    hosts: landed,
    power: ascent.threat,
  });
}

/**
 * Border raids: the run's background pressure between waves.
 *
 * One host, raid intent, sent at the frontier — `tickInvasions` already walks it in, calls
 * `pillage` (which destroys a building) and withdraws it. The permanent income loss is what
 * makes an undefended frontier cost something, and it gives the map activity in the long
 * quiet stretches that made the mode feel abandoned by its enemies.
 */
export function tickRaids(state: GameState): void {
  const ascent = state.ascent;
  if (!ascent) return;

  ascent.raidCooldown = Math.max(0, (ascent.raidCooldown ?? 0) - 1);
  if (ascent.raidCooldown > 0) return;

  // Not while a wave is on the map, and not on its doorstep: a raid still walking in when the
  // wave lands stacks two hosts on one province, which reads as a difficulty spike rather than
  // as background pressure — and was what made the first tuning pass unsurvivable.
  if ((state.invasions?.length ?? 0) > 0) return;
  if (ascent.ticksToWave <= RAID_WAVE_CLEARANCE) return;
  if (ownedLandCount(state) < RAID_MIN_LANDS) return;
  // Raids begin only once the realm has met its first wave and knows what a threat looks like.
  if (ascent.wave < 1) return;

  const raider = pickAggressor(state);
  if (!raider) return;

  ascent.raidCooldown = RAID_INTERVAL_TICKS;
  // Sized off field power directly, with its own small floor. Reusing the wave budget (and
  // its `MIN_WAVE_SOLDIERS` floor) made an early raid as large as the wave it was supposed to
  // be a prelude to, and two of them stacked on the capital ended runs before wave three.
  const budget = Math.round(laggedDefencePower(state) * RAID_POWER_SHARE / INVADER_POWER_PER_SOLDIER);
  launchOffMapInvasion(state, raider.id, {
    forceCoalition: 1,
    forceRaid: true,
    totalSoldiers: Math.max(MIN_RAID_SOLDIERS, budget),
  });
  pushToast(state, t('ascent.raid.incoming', { kingdom: raider.name }), 'threat');
}

/**
 * Applies the player's chosen preparation, then launches the wave. Each branch spends real
 * resources through the normal APIs, so the projections shown on the modal are honest.
 */
export function resolveEmpireResponse(state: GameState, prompt: AscentPrompt, optionId: string): void {
  const ascent = state.ascent;
  if (!ascent || prompt.kind !== 'empire-response') return;

  const option = prompt.options.find((candidate) => candidate.id === optionId);
  if (!option || !option.affordable) return;

  switch (option.id) {
    case 'send-host': {
      if (option.heroId) {
        applyResourceDelta(state, { supplies: -SEND_HOST_SUPPLIES });
        // `queueRecruitment` only accepts an unposted hero, so the chosen commander vacates
        // their posting here — answering the wave is one decision, not two screens.
        releaseHero(state, option.heroId);
        const soldiers = emergencyLevySize(state);
        if (queueRecruitment(
          state,
          option.heroId,
          soldiers,
          Math.ceil(soldiers / 100) * SUPPLY_TICKS_HELD,
          Math.ceil(soldiers / 150) * SUPPLY_TICKS_HELD,
        )) chargeAmbition(state, 'host');
      }
      break;
    }
    case 'hire-mercenaries': {
      const cost = option.cost?.gold ?? mercenaryCost(state, prompt.wave);
      applyResourceDelta(state, { gold: -cost });
      hireMercenaries(state, mercenarySize(state));
      ascent.warPurchases = (ascent.warPurchases ?? 0) + 1;
      // Bought soldiers count like raised ones. Charging only the levy would make coin the
      // one way to grow that nobody notices, which is a loophole rather than a strategy.
      chargeAmbition(state, 'host');
      break;
    }
    case 'fortify': {
      applyResourceDelta(state, { gold: -(option.cost?.gold ?? fortifyCost(state, prompt.wave)) });
      const capital = playerCapital(state);
      if (capital) capital.defense += fortifyDefenceGain(state);
      ascent.warPurchases = (ascent.warPurchases ?? 0) + 1;
      break;
    }
    case 'buy-off': {
      applyResourceDelta(state, { gold: -(option.cost?.gold ?? buyOffCost(state, prompt.wave)) });
      // Bought off entirely: no hosts this wave, and the next one is pushed back.
      ascent.ticksToWave += BUYOFF_DELAY_TICKS;
      pushToast(state, t('empire.invade.withdraw', { kingdom: prompt.kingdomName }), 'info');
      return;
    }
    case 'endure': {
      addAscentXp(state, ENDURE_MOMENTUM);
      break;
    }
  }

  const aggressor = state.kingdoms.find((kingdom) => kingdom.id === prompt.kingdomId);
  launchWave(state, prompt.kingdomId, aggressor?.king?.name ?? prompt.kingdomName);
}

/** Label parts for the send-host option, so the modal can name the commander inline. */
export function responseCommanderName(state: GameState, heroId: string | undefined): string | undefined {
  const hero = state.heroes.find((candidate) => candidate.id === heroId);
  return hero ? heroName(hero) : undefined;
}

/**
 * Per-tick wave clock: telegraphs a Great Invasion two seasons out, fires the next wave when
 * the countdown elapses, and reports the result once the last host of a wave leaves the map.
 */
export function tickWaveDirector(state: GameState): void {
  const ascent = state.ascent;
  if (!ascent) return;

  const liveInvasions = state.invasions?.length ?? 0;
  const wasInFlight = (ascent.invasionsLastTick ?? 0) > 0;
  ascent.waveInFlight = liveInvasions > 0;
  ascent.invasionsLastTick = liveInvasions;

  // The map just cleared. This — not the next wave's clock — is the moment the invasion ended,
  // and it is where the result is paid and the banner raised. Guarded on the wave having actually
  // put hosts on the map, so a border raid withdrawing cannot cash a wave whose own hosts have not
  // spawned yet: raids and waves share `state.invasions`, and a raid clears like anything else.
  if (wasInFlight && liveInvasions === 0 && (ascent.pendingWave?.hosts ?? 0) > 0) {
    resolveWaveResult(state);
  }

  // THREAT tracks the hosts on the map while a wave is live; between waves it shows what
  // the next one is projected to bring, so the readout is never blank or stale.
  ascent.threat = liveInvasions > 0 ? liveInvaderPower(state) : projectedWaveThreat(state, ascent.wave + 1);

  ascent.ticksToWave -= 1;

  const nextWaveIsBoss = isBossWave(ascent.wave + 1);
  if (nextWaveIsBoss && !ascent.bossTelegraphed && ascent.ticksToWave <= BOSS_TELEGRAPH_TICKS) {
    ascent.bossTelegraphed = true;
    pushToast(state, t('ascent.wave.telegraph', { ticks: Math.max(0, ascent.ticksToWave) }), 'threat');
  }

  if (ascent.ticksToWave <= 0) {
    startWave(state);
  }
}
