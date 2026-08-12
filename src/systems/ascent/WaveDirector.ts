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
  XP_PER_WAVE_SURVIVED,
} from '../../game/ascentConfig';
import { MIN_ARMY_SOLDIERS, recruitSoldiers, SUPPLY_TICKS_HELD, waveHostCount } from '../../game/ascentConfig';
import { weightedPick } from '../../utils/math';
import { launchOffMapInvasion } from '../empire/InvasionSystem';
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
import { findFreeCommander } from './AutopilotSystem';
import { heroName, t } from '../../i18n';
import type {
  AscentPrompt,
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
 * The realm's defensive power as raids and mercenary companies see it: what it could field
 * `WAVE_LAG` waves ago, not what it can field now.
 *
 * Waves no longer read this — they are sized from ambition (see `waveTargetPower`) precisely
 * because sizing them against the realm's own strength made every pick self-cancelling. The
 * things that *should* scale with the player still do: a border raid is a neighbour testing
 * whatever you have, and a mercenary company is priced as a real answer to it.
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
  return baseline * heat * (boss ? BOSS_PRESSURE_MULT : 1);
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
  const candidates = state.kingdoms.filter(
    (kingdom) => kingdom.id !== PLAYER_KINGDOM_ID && !kingdom.isDefeated,
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
 * Who would lead the new host.
 *
 * Prefers an unposted hero, but falls back to the best court-seated one — a minister can be
 * pulled from their desk in an emergency. Without the fallback the option degrades to a
 * nameless "Raise a host" exactly when the roster is full, which is the common case and
 * loses the point of naming the commander on the card at all.
 */
function pickResponseCommander(state: GameState): string | undefined {
  const free = findFreeCommander(state);
  if (free) return free;

  // Then a minister, pulled from their desk — a real but recoverable cost.
  //
  // Deliberately NOT a hero already commanding a host: raising a new army under them
  // leaves the existing one leaderless, and an autopilot that takes this option every wave
  // spends the whole run churning generals between armies and conquers nothing. If nobody
  // is spare, the option is simply unavailable and the player fortifies or endures.
  const byMartial = (a: Hero, b: Hero) => b.stats.martial - a.stats.martial;
  return state.heroes
    .filter((hero) => hero.assignedTo?.startsWith('court:'))
    .sort(byMartial)[0]?.id;
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
 * Builds the counter-play menu. Everything the player might want to do about an incoming
 * wave is on this one modal, including *which hero* leads the new host — so responding never
 * means visiting a hero screen and then an army screen.
 */
export function buildResponseOptions(state: GameState, threat: number): EmpireResponseOption[] {
  const commanderId = pickResponseCommander(state);
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

  return [
    {
      id: 'send-host',
      heroId: commanderId,
      cost: { supplies: SEND_HOST_SUPPLIES },
      // No odds at all, not merely no bonus.
      //
      // Quoting the base chance here made this a verbatim duplicate of Endure — two rows on the
      // same card promising the identical outcome for different prices, which is worse than an
      // option that is merely weak. The levy is still mustering when this host arrives, so its
      // value is the wave *after* this one, and the card now says that instead of a number that
      // would be true of doing nothing.
      soldiers: emergencyLevySize(state),
      // Capped: without a ceiling the realm can answer every single wave with another
      // levy and end up fielding a dozen half-fed hosts it cannot supply or command.
      affordable:
        Boolean(commanderId) &&
        canSpend(state, { supplies: SEND_HOST_SUPPLIES }) &&
        state.armies.filter((army) => army.kingdomId === PLAYER_KINGDOM_ID).length < MAX_STANDING_HOSTS,
    },
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
 * Fires a wave: raises the counter, sets the threat, and asks the player how to meet it.
 * The hosts are not spawned here — they launch when the response resolves, so a preparation
 * actually lands before the enemy does.
 */
function startWave(state: GameState): void {
  const ascent = state.ascent;
  if (!ascent) return;

  // Reaching a new wave means the previous one is behind you. Reporting survival here
  // rather than when the map clears keeps the count honest even when waves overlap.
  if (ascent.wave > 0) {
    ascent.wavesSurvived += 1;
    // The other end of the dial: surviving a wave you made dangerous pays more than surviving
    // one you hid from. Without this the counter is a pure tax and the correct play is always
    // to take nothing — the reward has to ride the same number as the risk or the choice is
    // not a choice.
    const momentum = (XP_PER_WAVE_SURVIVED + (ascent.lastWaveBoss ? XP_PER_WAVE_SURVIVED : 0))
      * liveWaveHeat(state);
    addAscentXp(state, momentum);
    payAmbitionSpoils(state, liveWaveHeat(state));

    // Only Great Invasions get a result screen — stopping for a modal every forty seconds
    // would wreck the pacing. Ordinary waves report through the header strip instead, so
    // surviving one is still acknowledged.
    const capital = state.lands.find((land) => land.id === ascent.capitalLandId);
    const heldCapital = !capital || capital.ownerId === PLAYER_KINGDOM_ID;

    if (ascent.lastWaveBoss) {
      // Reported, not modal.
      //
      // A Great Invasion surviving deserves acknowledgement, but this was a full-screen pause
      // whose only control was "Continue" — it accounted for nearly every remaining prompt in a
      // run that had exactly one legal answer, four to six times each time. Announcing it in the
      // header strip marks the moment without stopping the game to collect a tap.
      pushToast(
        state,
        heldCapital
          ? t('ascent.wave.bossTitle', { wave: ascent.wave })
          : t('ascent.wave.bossTitleLost'),
        heldCapital ? 'reward' : 'threat',
      );
    } else {
      pushToast(
        state,
        heldCapital
          ? t('ascent.wave.title', { wave: ascent.wave })
          : t('ascent.wave.titleLost', { wave: ascent.wave }),
        heldCapital ? 'reward' : 'threat',
      );
    }
  }

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
  launchOffMapInvasion(state, kingdomId, {
    forceCoalition: hosts,
    // An explicit budget, sized from the realm's lagged defensive power. Without it the
    // spawn is clamped against `getPlayerMilitary` — a headcount blind to every multiplier
    // the Power Draft stacks — and the wave arrives a fraction of the size it should be.
    totalSoldiers: Math.round(waveSoldierBudget(state, ascent.wave, boss) * (coalition ? COALITION_WAVE_MULT : 1)),
    forceConquest: boss || coalition,
    // A named warlord is what flags the record as `great`, which drives the harder siege
    // maths in resolveInvaderBattle and the Great Invasion presentation.
    warlordName: boss ? warlordName : undefined,
  });
  ascent.waveInFlight = true;
  // Now that the hosts exist, replace the projection with what is actually marching.
  ascent.threat = liveInvaderPower(state);
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
  ascent.waveInFlight = liveInvasions > 0;
  ascent.invasionsLastTick = liveInvasions;

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
