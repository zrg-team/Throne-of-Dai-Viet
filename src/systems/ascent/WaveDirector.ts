import { PLAYER_KINGDOM_ID } from '../../game/constants';
import {
  BASE_THREAT,
  BOSS_EVERY_N_WAVES,
  BOSS_THREAT_MULT,
  BOSS_TELEGRAPH_TICKS,
  THREAT_GROWTH,
  WAVE_INTERVAL_TICKS,
  XP_PER_WAVE_SURVIVED,
} from '../../game/ascentConfig';
import { MIN_ARMY_SOLDIERS, recruitSoldiers, SUPPLY_TICKS_HELD, waveHostCount } from '../../game/ascentConfig';
import { weightedPick } from '../../utils/math';
import { launchOffMapInvasion } from '../empire/InvasionSystem';
import { applyResourceDelta, canSpend } from '../ResourceSystem';
import { armyPower, queueRecruitment } from '../WarSystem';
import { pushToast } from '../empire/notifications';
import { enqueueAscentPrompt } from './AscentState';
import { addAscentXp, computeDefensivePower } from './PowerSystem';
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
function fortifyCost(state: GameState, wave: number): number {
  return Math.round(Math.max(FORTIFY_GOLD_BASE * (1 + wave * 0.25), state.resourceRates.gold * 6));
}

function buyOffCost(state: GameState, wave: number): number {
  return Math.round(Math.max(BUYOFF_GOLD_BASE * (1 + wave * 0.32), state.resourceRates.gold * 14));
}
/** Ceiling on hosts the emergency levy may add on top of whatever the autopilot keeps. */
const MAX_STANDING_HOSTS = 5;
const FORTIFY_DEFENSE = 10;
const BUYOFF_DELAY_TICKS = 6;
const ENDURE_MOMENTUM = 60;

export function isBossWave(wave: number): boolean {
  return wave > 0 && wave % BOSS_EVERY_N_WAVES === 0;
}

/**
 * The *projected* threat curve, used only before a wave exists to measure. Geometric, so a
 * player whose power grows linearly will eventually be overrun — compounding card picks is
 * the only way to keep pace. That tension is the run.
 */
export function projectedWaveThreat(wave: number): number {
  const base = BASE_THREAT * Math.pow(THREAT_GROWTH, Math.max(0, wave - 1));
  return Math.round(base * (isBossWave(wave) ? BOSS_THREAT_MULT : 1));
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
 * Rough odds of holding, shown on every response so the choice is informed, not blind.
 * Uses defensive power (hosts + fortifications), not the headline POWER scalar — POWER
 * includes the economy, which does not fight.
 */
function projectedWinChance(state: GameState, threat: number, bonus = 0): number {
  const power = computeDefensivePower(state) * (1 + bonus);
  if (power <= 0) return 0;
  return Math.max(1, Math.min(99, Math.round((power / (power + Math.max(1, threat))) * 100)));
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

  return [
    {
      id: 'send-host',
      heroId: commanderId,
      cost: { supplies: SEND_HOST_SUPPLIES },
      winChance: projectedWinChance(state, threat, 0.25),
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
      winChance: projectedWinChance(state, threat, 0.12),
      affordable: canSpend(state, { gold: fortify }),
    },
    {
      id: 'buy-off',
      cost: { gold: buyOff },
      delayTicks: BUYOFF_DELAY_TICKS,
      affordable: canSpend(state, { gold: buyOff }),
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
    const momentum = XP_PER_WAVE_SURVIVED + (ascent.lastWaveBoss ? XP_PER_WAVE_SURVIVED : 0);
    addAscentXp(state, momentum);

    // Only Great Invasions get a result screen — stopping for a modal every forty seconds
    // would wreck the pacing. Ordinary waves report through the header strip instead, so
    // surviving one is still acknowledged.
    const capital = state.lands.find((land) => land.id === ascent.capitalLandId);
    const heldCapital = !capital || capital.ownerId === PLAYER_KINGDOM_ID;

    if (ascent.lastWaveBoss) {
      enqueueAscentPrompt(state, {
        kind: 'wave-result',
        wave: ascent.wave,
        survived: heldCapital,
        lines: [
          heldCapital
            ? t('ascent.wave.lineHeld', { land: capital?.name ?? '' })
            : t('ascent.wave.lineLost', { land: capital?.name ?? '' }),
          t('ascent.wave.lineMomentum', { xp: momentum }),
        ],
      });
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

  ascent.wave += 1;
  ascent.lastWaveBoss = isBossWave(ascent.wave);
  ascent.ticksToWave = WAVE_INTERVAL_TICKS;
  ascent.bossTelegraphed = false;

  const aggressor = pickAggressor(state);
  if (!aggressor) return;

  // Before the hosts exist there is nothing to measure, so the modal quotes the projection.
  ascent.threat = projectedWaveThreat(ascent.wave);

  enqueueAscentPrompt(state, {
    kind: 'empire-response',
    wave: ascent.wave,
    threat: ascent.threat,
    kingdomId: aggressor.id,
    kingdomName: aggressor.name,
    ticksToArrival: 3,
    options: buildResponseOptions(state, ascent.threat),
  });
}

/** Spawns the hosts for a wave through the existing invasion pipeline. */
function launchWave(state: GameState, kingdomId: string, warlordName?: string): void {
  const ascent = state.ascent;
  if (!ascent) return;

  const boss = ascent.lastWaveBoss;
  launchOffMapInvasion(state, kingdomId, {
    forceCoalition: waveHostCount(ascent.wave, boss),
    sizeMult: (boss ? 1.5 : 1) * (1 + ascent.wave * 0.06),
    forceConquest: boss,
    // A named warlord is what flags the record as `great`, which drives the harder siege
    // maths in resolveInvaderBattle and the Great Invasion presentation.
    warlordName: boss ? warlordName : undefined,
  });
  ascent.waveInFlight = true;
  // Now that the hosts exist, replace the projection with what is actually marching.
  ascent.threat = liveInvaderPower(state);
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
        queueRecruitment(
          state,
          option.heroId,
          soldiers,
          Math.ceil(soldiers / 100) * SUPPLY_TICKS_HELD,
          Math.ceil(soldiers / 150) * SUPPLY_TICKS_HELD,
        );
      }
      break;
    }
    case 'fortify': {
      applyResourceDelta(state, { gold: -(option.cost?.gold ?? fortifyCost(state, prompt.wave)) });
      const capital = playerCapital(state);
      if (capital) capital.defense += FORTIFY_DEFENSE;
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
  ascent.threat = liveInvasions > 0 ? liveInvaderPower(state) : projectedWaveThreat(ascent.wave + 1);

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
