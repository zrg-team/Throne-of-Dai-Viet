import { PLAYER_KINGDOM_ID } from '../../game/constants';
import { addCourtModifier } from '../CourtSystem';
import { applyResourceDelta } from '../ResourceSystem';
import { pushToast } from '../empire/notifications';
import { launchPunitiveHost } from '../ascent/EnemyCommandDirector';
import { findPowerCard } from '../../data/ascentCards';
import { generateHero } from '../../data/heroFactory';
import { recordEcho } from './echoes';
import type { StoryCtx } from './types';
import type { Army, AscentRarity, Hero, Land, LandBuildingType, ResourceBag } from '../../state/types';

/**
 * The outcome vocabulary.
 *
 * A story fragment should read like a sentence about the world, not like a patch to `GameState`.
 * Everything a story is allowed to do to the player lives here, once, with the guards in one
 * place — so a fragment says `defectHost(ctx)` and cannot forget to clear the general, strand the
 * army on a province nobody owns, or leave a court seat pointing at a hero who no longer exists.
 *
 * Grouped the way the design document groups them: war, rebellion, heroes, land, resources,
 * diplomacy, **rules**, and legacy. The rules layer is the one that matters most — a resource
 * swing is forgotten within a minute, while a card entering your draft deck changes how the rest
 * of the run is *played*.
 */

// ── Helpers ─────────────────────────────────────────────────────────────────

export function ourLands(ctx: StoryCtx): Land[] {
  return ctx.state.lands.filter((land) => land.ownerId === PLAYER_KINGDOM_ID);
}

export function ourHosts(ctx: StoryCtx): Army[] {
  return ctx.state.armies.filter((army) => army.kingdomId === PLAYER_KINGDOM_ID);
}

export function theirHosts(ctx: StoryCtx): Army[] {
  return ctx.state.armies.filter((army) => army.kingdomId !== PLAYER_KINGDOM_ID);
}

function headcount(army: Army): number {
  return army.units.spearmen + army.units.archers + army.units.heavyInfantry;
}

function scaleUnits(army: Army, factor: number): void {
  army.units.spearmen = Math.max(0, Math.floor(army.units.spearmen * factor));
  army.units.archers = Math.max(0, Math.floor(army.units.archers * factor));
  army.units.heavyInfantry = Math.max(0, Math.floor(army.units.heavyInfantry * factor));
}

/** Detaches a hero from every office, seat and command. Used before removing or moving them. */
function unseat(ctx: StoryCtx, hero: Hero): void {
  const { state } = ctx;
  hero.assignedTo = undefined;
  for (const seat of Object.keys(state.court.seats)) {
    const key = seat as keyof typeof state.court.seats;
    if (state.court.seats[key] === hero.id) state.court.seats[key] = undefined;
  }
  for (const army of state.armies) {
    if (army.generalHeroId === hero.id) army.generalHeroId = undefined;
  }
  state.heroMissions = (state.heroMissions ?? []).filter((mission) => mission.heroId !== hero.id);
}

// ── War ─────────────────────────────────────────────────────────────────────

/** A host arrives already raised. The one gain that is felt immediately rather than banked. */
export function grantHost(ctx: StoryCtx, size: number, at?: Land): Army | undefined {
  const home = at ?? ctx.land() ?? ourLands(ctx)[0];
  if (!home) return undefined;
  const army: Army = {
    id: `story-host-${ctx.story.id}-${ctx.state.turn}`,
    kingdomId: PLAYER_KINGDOM_ID,
    name: home.name,
    landId: home.id,
    units: {
      spearmen: Math.round(size * 0.6),
      archers: Math.round(size * 0.28),
      heavyInfantry: Math.round(size * 0.12),
    },
    morale: 88,
    supply: 70,
    rations: Math.round(size * 0.3),
    provisions: Math.round(size * 0.2),
    level: 1,
    experience: 0,
    experienceToNextLevel: 140,
  };
  ctx.state.armies.push(army);
  return army;
}

/** Veterans folded into whatever host we already have. Cheaper drama than a whole new army. */
export function reinforceHosts(ctx: StoryCtx, soldiers: number): void {
  const hosts = ourHosts(ctx).sort((a, b) => headcount(b) - headcount(a));
  if (hosts.length === 0) return;
  const each = Math.floor(soldiers / hosts.length);
  for (const army of hosts) {
    army.units.spearmen += Math.round(each * 0.6);
    army.units.archers += Math.round(each * 0.3);
    army.units.heavyInfantry += Math.round(each * 0.1);
    army.morale = Math.min(100, army.morale + 6);
  }
}

/** A free elite tier on every host. Small number, large felt difference. */
export function grantEliteTier(ctx: StoryCtx): void {
  for (const army of ourHosts(ctx)) {
    army.elite = Math.min(2, (army.elite ?? 0) + 1);
  }
}

/**
 * A host defects — **with its general**, which is the whole sting. Losing an army is arithmetic;
 * losing the man you trusted with it is a story.
 */
export function defectHost(ctx: StoryCtx, toKingdomId?: string): Army | undefined {
  const hosts = ourHosts(ctx).filter((army) => army.generalHeroId);
  const army = hosts.sort((a, b) => headcount(b) - headcount(a))[0] ?? ourHosts(ctx)[0];
  if (!army) return undefined;

  const rival = toKingdomId
    ?? ctx.rival()?.id
    ?? ctx.state.kingdoms.find((k) => k.id !== PLAYER_KINGDOM_ID && !k.isDefeated)?.id;
  if (!rival) return undefined;

  const general = ctx.state.heroes.find((hero) => hero.id === army.generalHeroId);
  army.kingdomId = rival;
  army.morale = Math.min(100, army.morale + 12);
  if (general) {
    unseat(ctx, general);
    ctx.state.heroes = ctx.state.heroes.filter((hero) => hero.id !== general.id);
    army.name = general.name;
  }
  return army;
}

/** The host is still ours and will not move. Not routed, not lost — refusing, and they know it. */
export function mutinyHosts(ctx: StoryCtx, seasons: number): void {
  for (const army of ourHosts(ctx)) {
    army.morale = Math.max(10, army.morale - 35);
    army.unpaidTicks = (army.unpaidTicks ?? 0) + seasons;
  }
  ctx.state.movementOrders = ctx.state.movementOrders.filter(
    (order) => !ourHosts(ctx).some((army) => army.id === order.armyId),
  );
}

/** Rations spoil on the road. Quiet, and it decides the next battle. */
export function spoilRations(ctx: StoryCtx): void {
  for (const army of ourHosts(ctx)) {
    army.rations = Math.floor(army.rations * 0.35);
    army.supply = Math.max(10, army.supply - 25);
  }
}

/** An enemy general is killed; their host loses the edge he gave it. */
export function killEnemyGeneral(ctx: StoryCtx): boolean {
  const army = theirHosts(ctx).find((candidate) => candidate.generalHeroId);
  if (!army) return false;
  army.generalHeroId = undefined;
  army.morale = Math.max(15, army.morale - 25);
  return true;
}

/** A host disperses before it ever arrives. */
export function disperseIncoming(ctx: StoryCtx, share = 1): number {
  const incoming = theirHosts(ctx);
  let gone = 0;
  for (const army of incoming) {
    if (Math.random() > share) continue;
    gone += headcount(army);
    ctx.state.armies = ctx.state.armies.filter((candidate) => candidate.id !== army.id);
    ctx.state.invasions = (ctx.state.invasions ?? []).filter((rec) => rec.armyId !== army.id);
  }
  return gone;
}

/** A great host, launched now, outside the wave cycle. The loudest thing a story can do. */
export function launchHostNow(ctx: StoryCtx, sizeMult = 1): boolean {
  const rival = ctx.rival()
    ?? ctx.state.kingdoms.find((k) => k.id !== PLAYER_KINGDOM_ID && !k.isDefeated);
  if (!rival) return false;
  return launchPunitiveHost(ctx.state, rival.id, { conquest: true, sizeMult });
}

// ── Rebellion ───────────────────────────────────────────────────────────────

/**
 * Provinces secede and form a hostile power out of your own realm — **keeping your buildings**.
 * Everything you paid for is now pointed at you, which is what makes this worse than losing a
 * battle for the same ground.
 */
export function secede(ctx: StoryCtx, count: number, leader?: Hero): Land[] {
  const rebel = ctx.state.kingdoms.find((k) => k.id !== PLAYER_KINGDOM_ID && !k.isDefeated);
  if (!rebel) return [];
  const taken = ourLands(ctx)
    .filter((land) => land.id !== ctx.state.ascent?.capitalLandId)
    .sort((a, b) => a.loyalty - b.loyalty)
    .slice(0, count);
  for (const land of taken) {
    land.ownerId = rebel.id;
    land.loyalty = 55;
  }
  if (leader) {
    unseat(ctx, leader);
    ctx.state.heroes = ctx.state.heroes.filter((hero) => hero.id !== leader.id);
  }
  return taken;
}

/** A province turns hostile on its own — no foreign hand, and no army to blame. */
export function revolt(ctx: StoryCtx, land?: Land): Land | undefined {
  const target = land ?? ourLands(ctx).sort((a, b) => a.loyalty - b.loyalty)[0];
  const rebel = ctx.state.kingdoms.find((k) => k.id !== PLAYER_KINGDOM_ID && !k.isDefeated);
  if (!target || !rebel || target.id === ctx.state.ascent?.capitalLandId) return undefined;
  target.ownerId = rebel.id;
  target.loyalty = 40;
  return target;
}

/** The capital riots. There is no enemy; it is your own people, and prosperity is what did it. */
export function capitalRiots(ctx: StoryCtx): void {
  const capital = ctx.state.lands.find((land) => land.id === ctx.state.ascent?.capitalLandId);
  ctx.state.court.stability = Math.max(0, ctx.state.court.stability - 26);
  if (capital) {
    capital.loyalty = Math.max(0, capital.loyalty - 30);
    capital.population = Math.floor(capital.population * 0.9);
    capital.defense = Math.max(1, capital.defense - 8);
  }
  applyResourceDelta(ctx.state, { gold: -Math.floor(ctx.state.resources.gold * 0.25) });
}

/** A noble house stops paying, and nothing you do restarts it. */
export function withholdTax(ctx: StoryCtx, seasons: number, land?: Land): void {
  const target = land ?? ctx.land() ?? ourLands(ctx)[0];
  if (!target) return;
  target.loyalty = Math.max(0, target.loyalty - 18);
  addCourtModifier(ctx.state, {
    id: `withhold-${ctx.story.id}-${ctx.state.turn}`,
    label: target.name,
    remainingTicks: seasons,
    resourceRateModifier: { gold: -Math.max(4, Math.round(target.outputs?.gold ?? 6)) },
  });
}

/** A permanent floor under a region's loyalty — the one boon that never wears off. */
export function loyaltyFloor(ctx: StoryCtx, floor: number, only?: Land): void {
  const lands = only ? [only] : ourLands(ctx);
  for (const land of lands) land.loyalty = Math.max(land.loyalty, floor);
}

// ── Heroes ──────────────────────────────────────────────────────────────────

/**
 * A hero who cannot be drafted, carrying a trait that exists nowhere else.
 *
 * The trait is the point. A story-only hero with ordinary stats is a stat stick with a good
 * anecdote; one whose trait names what they did is a person the player remembers.
 */
export function grantStoryHero(
  ctx: StoryCtx,
  opts: { trait: string; martial?: number; admin?: number; loyalty?: number; renown?: number },
): Hero {
  const hero = generateHero(ctx.state.turn * 7919 + ctx.story.spoken.length, {
    id: `story-${ctx.story.id}-${ctx.state.turn}`,
    rarity: 'Epic',
  });
  hero.stats.martial = opts.martial ?? hero.stats.martial;
  hero.stats.administration = opts.admin ?? hero.stats.administration;
  hero.stats.loyalty = opts.loyalty ?? 70;
  hero.stats.renown = opts.renown ?? hero.stats.renown;
  hero.traits = [...(hero.traits ?? []), opts.trait];
  ctx.state.heroes.push(hero);
  return hero;
}

/** A hero dies. No roll, no save, no ransom — which is exactly why it lands. */
export function killHero(ctx: StoryCtx, hero?: Hero): Hero | undefined {
  const target = hero ?? ctx.hero();
  if (!target) return undefined;
  unseat(ctx, target);
  ctx.state.heroes = ctx.state.heroes.filter((candidate) => candidate.id !== target.id);
  return target;
}

/** A hero leaves quietly and goes back into the world. A later run may name them. */
export function heroLeaves(ctx: StoryCtx, hero?: Hero, leaveEcho = true): Hero | undefined {
  const target = hero ?? ctx.hero();
  if (!target) return undefined;
  unseat(ctx, target);
  ctx.state.heroes = ctx.state.heroes.filter((candidate) => candidate.id !== target.id);
  ctx.state.heroDeck.push(target);
  if (leaveEcho) recordEcho(ctx.story.templateId, ctx.story.spoken[ctx.story.spoken.length - 1] ?? '', target.name);
  return target;
}

/** Two heroes bond. Every battle they fight together is better, for as long as both live. */
export function bondHeroes(ctx: StoryCtx, a?: Hero, b?: Hero): boolean {
  const first = a ?? ctx.hero();
  const second = b ?? ctx.otherHero() ?? ctx.state.heroes.find((h) => h.id !== first?.id);
  if (!first || !second) return false;
  first.traits = [...(first.traits ?? []), `Sworn: ${second.name}`];
  second.traits = [...(second.traits ?? []), `Sworn: ${first.name}`];
  first.stats.loyalty = Math.min(100, first.stats.loyalty + 15);
  second.stats.loyalty = Math.min(100, second.stats.loyalty + 15);
  addCourtModifier(ctx.state, {
    id: `bond-${first.id}-${second.id}`,
    label: `${first.name} · ${second.name}`,
    armyPowerModifier: 0.12,
  });
  return true;
}

/** Two heroes fall out and cannot serve together again. */
export function feudHeroes(ctx: StoryCtx, a?: Hero, b?: Hero): boolean {
  const first = a ?? ctx.hero();
  const second = b ?? ctx.otherHero() ?? ctx.state.heroes.find((h) => h.id !== first?.id);
  if (!first || !second) return false;
  first.traits = [...(first.traits ?? []), `Feud: ${second.name}`];
  second.traits = [...(second.traits ?? []), `Feud: ${first.name}`];
  first.stats.loyalty = Math.max(0, first.stats.loyalty - 12);
  second.stats.loyalty = Math.max(0, second.stats.loyalty - 12);
  // One of them will not take an order from the other's province.
  if (second.assignedTo && second.assignedTo === first.assignedTo) second.assignedTo = undefined;
  return true;
}

/** A hero is taken, and can be ransomed, stormed for, or left. */
export function captureHero(ctx: StoryCtx, hero?: Hero): Hero | undefined {
  const target = hero ?? ctx.hero();
  if (!target) return undefined;
  unseat(ctx, target);
  target.traits = [...(target.traits ?? []), 'Captive'];
  return target;
}

/** A permanent stat gain, the kind a draft cannot buy. */
export function temper(ctx: StoryCtx, stat: keyof Hero['stats'], by: number, hero?: Hero): void {
  const target = hero ?? ctx.hero();
  if (!target) return;
  target.stats[stat] = Math.max(0, Math.min(100, target.stats[stat] + by));
}

// ── Land ────────────────────────────────────────────────────────────────────

/** A province joins with no battle: full population, buildings intact. */
export function joinBloodlessly(ctx: StoryCtx, land?: Land): Land | undefined {
  const target = land ?? ctx.state.lands.find(
    (candidate) => candidate.ownerId !== PLAYER_KINGDOM_ID
      && ourLands(ctx).some((mine) => mine.neighbors.includes(candidate.id)),
  );
  if (!target) return undefined;
  target.ownerId = PLAYER_KINGDOM_ID;
  target.loyalty = Math.max(target.loyalty, 70);
  applyResourceDelta(ctx.state, { humans: Math.round(target.population * 0.2) });
  return target;
}

/** A building appears, paid for by somebody else. */
export function freeBuilding(ctx: StoryCtx, type: LandBuildingType, land?: Land): boolean {
  const target = land ?? ctx.land();
  if (!target || target.buildings.length >= target.buildingCapacity) return false;
  target.buildings.push({ type, level: 1 });
  return true;
}

/**
 * A permanent terrain work — a dyke, a canal, stakes in a riverbed. Changes what the land *is*
 * rather than what it currently produces, so it survives every later focus change.
 */
export function terrainWork(ctx: StoryCtx, opts: { defense?: number; food?: number; gold?: number }, land?: Land): void {
  const target = land ?? ctx.land();
  if (!target) return;
  target.defense += opts.defense ?? 0;
  if (target.outputs) {
    target.outputs.food += opts.food ?? 0;
    target.outputs.gold += opts.gold ?? 0;
  }
}

/** A province is razed: people gone, buildings gone, and it stays yours. */
export function raze(ctx: StoryCtx, land?: Land): Land | undefined {
  const target = land ?? ctx.land();
  if (!target) return undefined;
  target.population = Math.floor(target.population * 0.45);
  target.buildings = target.buildings.slice(0, Math.max(0, target.buildings.length - 2));
  target.defense = Math.max(1, Math.floor(target.defense * 0.5));
  target.loyalty = Math.max(0, target.loyalty - 20);
  return target;
}

/** Plague, or a surge. One number, applied honestly. */
export function population(ctx: StoryCtx, factor: number, land?: Land): void {
  const targets = land ? [land] : ourLands(ctx);
  for (const target of targets) target.population = Math.max(10, Math.floor(target.population * factor));
}

// ── Resources ───────────────────────────────────────────────────────────────

export function windfall(ctx: StoryCtx, bag: Partial<ResourceBag>): void {
  applyResourceDelta(ctx.state, bag);
}

/** The treasury is seized. All of it, which is the only version of this worth writing. */
export function seizeTreasury(ctx: StoryCtx): number {
  const taken = Math.floor(ctx.state.resources.gold);
  applyResourceDelta(ctx.state, { gold: -taken });
  return taken;
}

/** A debt that services itself every season until it is done with you. */
export function debt(ctx: StoryCtx, perSeason: number, seasons: number): void {
  addCourtModifier(ctx.state, {
    id: `debt-${ctx.story.id}-${ctx.state.turn}`,
    label: 'Nợ',
    remainingTicks: seasons,
    resourceRateModifier: { gold: -perSeason },
  });
}

/** A standing gain for a while — a trade route, a tribute redirected, a good harvest. */
export function stipend(ctx: StoryCtx, bag: Partial<ResourceBag>, seasons: number, label: string): void {
  addCourtModifier(ctx.state, {
    id: `stipend-${ctx.story.id}-${ctx.state.turn}`,
    label,
    remainingTicks: seasons,
    resourceRateModifier: bag,
  });
}

/** The granary spoils. Not a rate change — the stores themselves. */
export function spoilGranary(ctx: StoryCtx, share = 0.6): void {
  applyResourceDelta(ctx.state, { food: -Math.floor(ctx.state.resources.food * share) });
}

// ── Diplomacy ───────────────────────────────────────────────────────────────

export function opinion(ctx: StoryCtx, by: number, kingdomId?: string): void {
  const target = kingdomId
    ? ctx.state.kingdoms.find((k) => k.id === kingdomId)
    : ctx.rival();
  if (!target) return;
  target.relations = Math.max(0, Math.min(100, (target.relations ?? 50) + by));
}

/** Every third party that was watching revises its opinion at once. */
export function standing(ctx: StoryCtx, by: number): void {
  for (const kingdom of ctx.state.kingdoms) {
    if (kingdom.id === PLAYER_KINGDOM_ID || kingdom.isDefeated) continue;
    kingdom.relations = Math.max(0, Math.min(100, (kingdom.relations ?? 50) + by));
  }
}

/** A coalition: everyone who already disliked you decides together. */
export function coalition(ctx: StoryCtx): number {
  let joined = 0;
  for (const kingdom of ctx.state.kingdoms) {
    if (kingdom.id === PLAYER_KINGDOM_ID || kingdom.isDefeated) continue;
    if ((kingdom.relations ?? 50) > 45) continue;
    kingdom.warAppetite = Math.min(100, (kingdom.warAppetite ?? 0) + 45);
    kingdom.relations = Math.max(0, (kingdom.relations ?? 50) - 15);
    joined += 1;
  }
  return joined;
}

/** A rival collapses into civil war, and their ground comes loose. */
export function civilWar(ctx: StoryCtx, kingdomId?: string): boolean {
  const target = kingdomId
    ? ctx.state.kingdoms.find((k) => k.id === kingdomId)
    : ctx.rival();
  if (!target) return false;
  target.stability = Math.max(0, (target.stability ?? 60) - 45);
  target.power = Math.max(10, (target.power ?? 60) * 0.55);
  for (const army of ctx.state.armies) {
    if (army.kingdomId !== target.id) continue;
    scaleUnits(army, 0.5);
    army.morale = Math.max(15, army.morale - 30);
  }
  // Two of their border provinces stop being defended.
  for (const land of ctx.state.lands) {
    if (land.ownerId !== target.id) continue;
    land.defense = Math.max(1, Math.floor(land.defense * 0.6));
    land.loyalty = Math.max(0, land.loyalty - 25);
  }
  return true;
}

/** Tribute imposed on *them*, collected automatically for a while. */
export function exactTribute(ctx: StoryCtx, perSeason: number, seasons: number): void {
  stipend(ctx, { gold: perSeason }, seasons, ctx.rival()?.name ?? 'Cống');
}

// ── Rules — the layer that changes how the run is played ────────────────────

/**
 * A Power card enters the draft deck permanently.
 *
 * The most valuable thing in this file. A resource swing is forgotten inside a minute; a rule you
 * now own changes every decision for the rest of the run, and it is the outcome players describe
 * to each other afterwards.
 */
export function grantPowerCard(ctx: StoryCtx, cardId: string): boolean {
  const ascent = ctx.state.ascent;
  if (!ascent) return false;
  const card = findPowerCard(cardId);
  if (!card || ascent.retiredCards.includes(cardId)) return false;
  ascent.cardStacks[cardId] = (ascent.cardStacks[cardId] ?? 0) + 1;
  return true;
}

/** A rule you were relying on is taken back. You are the king; you were still not consulted. */
export function suppressPowerCard(ctx: StoryCtx, cardId?: string): string | undefined {
  const ascent = ctx.state.ascent;
  if (!ascent) return undefined;
  const held = Object.keys(ascent.cardStacks).filter((id) => (ascent.cardStacks[id] ?? 0) > 0);
  const target = cardId ?? held.sort((a, b) => (ascent.cardStacks[b] ?? 0) - (ascent.cardStacks[a] ?? 0))[0];
  if (!target) return undefined;
  delete ascent.cardStacks[target];
  ascent.retiredCards.push(target);
  return target;
}

/** Bias the draft toward or away from a rarity, for the rest of the run. */
export function tiltDraft(ctx: StoryCtx, rarity: AscentRarity, by: number): void {
  const ascent = ctx.state.ascent;
  if (!ascent) return;
  ascent.draftWeights[rarity] = Math.max(0.1, (ascent.draftWeights[rarity] ?? 1) + by);
}

/** A level-up owed immediately — a draft the player did not earn by fighting. */
export function grantDraft(ctx: StoryCtx, count = 1): void {
  const ascent = ctx.state.ascent;
  if (!ascent) return;
  ascent.pendingLevelUps += count;
}

/** The wave clock moves. Slower is a reprieve; faster is a story acting against you. */
export function shiftWaveClock(ctx: StoryCtx, seasons: number): void {
  const ascent = ctx.state.ascent;
  if (!ascent) return;
  ascent.ticksToWave = Math.max(1, ascent.ticksToWave + seasons);
}

/** An extra province the realm may court at once, permanently. */
export function grantClaimSlot(ctx: StoryCtx, count = 1): void {
  addCourtModifier(ctx.state, {
    id: `claim-slot-${ctx.story.id}`,
    label: 'Sứ đoàn',
    claimSlotBonus: count,
  });
}

/** Edict points, so a story can hand the player a law they have not earned. */
export function grantEdictPoints(ctx: StoryCtx, count = 1): void {
  if (!ctx.state.mandate) return;
  ctx.state.mandate.edictPoints = (ctx.state.mandate.edictPoints ?? 0) + count;
}

// ── Legacy ──────────────────────────────────────────────────────────────────

/** Something a later run gets to mention by name. */
export function leaveEcho(ctx: StoryCtx, name: string): void {
  recordEcho(ctx.story.templateId, ctx.story.spoken[ctx.story.spoken.length - 1] ?? '', name);
}

/** Says it out loud, in the header strip, in the story's own voice. */
export function announce(ctx: StoryCtx, text: string, kind: 'info' | 'reward' | 'threat' = 'info'): void {
  pushToast(ctx.state, text, kind);
}
