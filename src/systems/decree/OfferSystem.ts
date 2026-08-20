import { getProject, REALM_PROJECTS, type RealmProject } from '../../data/edicts';
import { BOSS_TELEGRAPH_TICKS } from '../../game/ascentConfig';
import { PLAYER_KINGDOM_ID } from '../../game/constants';
import type { DecreeInstrument, GameState, Land } from '../../state/types';
import { applyEstateDeltas, estateStanding, landCompliance } from '../DecreeSystem';
import { enqueueAscentPrompt } from '../ascent/AscentState';
import { famineReady } from '../ascent/FamineSystem';
import { isBossWave } from '../ascent/WaveDirector';
import { addCourtModifier } from '../CourtSystem';
import { pushToast } from '../empire/notifications';
import { projectTitle } from '../empire/EdictSystem';
import { refreshAllLandOutputs } from '../ResourceSystem';
import { heroName, t } from '../../i18n';

/**
 * Where sắc, dụ, hịch and lệ come from.
 *
 * A chiếu is something the throne reaches for; these four are raised *by the world* — a champion
 * worth ennobling, a granary running out, a Great Invasion telegraphed, a village that wants its
 * market days recognised. That is the whole reason the instruments exist as separate shapes: they
 * arrive unbidden, they mostly expire, and they cannot be planned for.
 *
 * All four share one prompt kind and therefore one slot in the decision director's queue. See the
 * note on `decree-offer` in `types.ts` for why that is a budget decision rather than a shortcut.
 */

/** Seasons a dụ or hịch stays in force before lapsing and returning its weight. */
const DU_SEASONS = 20;
const HICH_SEASONS = 12;

/** How long the family stays quiet after being answered, so it cannot crowd the court out. */
export const DECREE_OFFER_COOLDOWN = 10;

function ourLands(state: GameState): Land[] {
  return state.lands.filter((land) => land.ownerId === PLAYER_KINGDOM_ID);
}

function byInstrument(kind: DecreeInstrument): RealmProject[] {
  return REALM_PROJECTS.filter((project) => project.kind === kind);
}

function notStanding(state: GameState, project: RealmProject): boolean {
  return !state.mandate?.edicts.includes(project.id);
}

// ── What the world is asking for ────────────────────────────────────────────

/**
 * The single most deserving instrument right now, or nothing.
 *
 * Strictly ordered rather than weighted, because the ordering *is* the design: a hịch exists only
 * in the two seasons before a Great Invasion lands and is worthless a season later, a dụ answers a
 * crisis that is costing the realm every tick it waits, and a village asking about its feast can
 * always wait. Anything genuinely equal in urgency would be a tie the player cannot read.
 */
export function buildDecreeOffer(state: GameState): {
  instrument: DecreeInstrument;
  projectIds: string[];
  targetId?: string;
  targetName?: string;
} | undefined {
  return hichOffer(state) ?? duOffer(state) ?? sacOffer(state) ?? leOffer(state);
}

/** Hịch — only while a Great Invasion is telegraphed, or in the aftermath of breaking one. */
function hichOffer(state: GameState) {
  const ascent = state.ascent;
  if (!ascent) return undefined;

  const bossInbound = isBossWave(ascent.wave + 1) && ascent.ticksToWave <= BOSS_TELEGRAPH_TICKS;
  const bossJustBroken = ascent.lastWaveBoss && !ascent.waveInFlight;
  if (!bossInbound && !bossJustBroken) return undefined;

  const candidates = byInstrument('hich')
    .filter((project) => notStanding(state, project))
    // Bình Ngô đại cáo is written *after* the victory, never before it.
    .filter((project) => (project.id === 'binh-ngo-dai-cao' ? bossJustBroken : bossInbound));
  if (candidates.length === 0) return undefined;
  return { instrument: 'hich' as const, projectIds: candidates.map((p) => p.id) };
}

/** Dụ — only while something is actively costing the realm. */
function duOffer(state: GameState) {
  const ascent = state.ascent;
  if (!ascent) return undefined;

  const starving = famineReady(state) || state.resourceRates.food < 0;
  const capitalPressed = ascent.capitalLostTicks > 0 || ascent.waveInFlight;
  const unrest = state.court.stability < 40 || ourLands(state).some((land) => landCompliance(land) < 35);
  if (!starving && !capitalPressed && !unrest) return undefined;

  const wanted: string[] = [];
  if (starving) wanted.push('du-chan-te');
  if (capitalPressed) wanted.push('du-thanh-da', 'du-ti-nan');
  if (unrest) wanted.push('du-dai-xa');

  const projectIds = wanted.filter((id) => {
    const project = getProject(id);
    return project && notStanding(state, project);
  });
  if (projectIds.length === 0) return undefined;
  return { instrument: 'du' as const, projectIds };
}

/**
 * Sắc — a champion or a province that has earned an investiture.
 *
 * Every branch is separately gated, and the province branch is deliberately the *opposite* of the
 * one `leOffer` wants. Cải thổ quy lưu was the Nguyễn answer to the uplands, where hereditary local
 * chiefs ruled ground that was loyal to the dynasty and paid no attention whatever to its law: a
 * province that is devoted *and* obedient has no local lord to replace. Left overlapping, sắc won
 * every one of those provinces on ordering alone and the whole lệ instrument was dead content —
 * which is exactly what the harness caught.
 */
function sacOffer(state: GameState) {
  const seated = state.heroes.find((hero) => hero.assignedTo?.startsWith('court:')
    && (hero.rarity === 'Epic' || hero.rarity === 'Legendary'));
  // Loyal to the dynasty, indifferent to its law — the autonomous province, not the model one.
  const autonomous = ourLands(state).find((land) => land.loyalty >= 85 && landCompliance(land) < 60);
  // Someone worth remembering: a champion who has left the roster but not the Chronicle.
  const remembered = (state.storiesEnded?.length ?? 0) > 0 || state.heroes.length > 3;
  const beaten = state.kingdoms.find((k) => k.id !== PLAYER_KINGDOM_ID && !k.isDefeated && (k.power ?? 40) < 35);

  const allowed = (id: string): boolean => {
    switch (id) {
      case 'sac-cong-than': return Boolean(seated);
      case 'cai-tho-quy-luu': return Boolean(autonomous);
      case 'sac-phong-vuong': return Boolean(beaten);
      case 'sac-thanh-hoang': return remembered;
      default: return false;
    }
  };

  const projectIds = byInstrument('sac')
    .filter((project) => notStanding(state, project) && allowed(project.id))
    .map((project) => project.id);
  if (projectIds.length === 0) return undefined;

  // The target follows whichever branch actually opened the card, so the copy names the right
  // thing — a champion for an ennoblement, a province for a change of rule.
  const provinceOnly = projectIds.every((id) => id === 'cai-tho-quy-luu');
  const target = provinceOnly || !seated ? autonomous : undefined;
  return {
    instrument: 'sac' as const,
    projectIds,
    targetId: target?.id ?? seated?.id,
    targetName: target?.name ?? (seated ? heroName(seated) : undefined),
  };
}

/**
 * Lệ — a village proposing its own custom.
 *
 * Raised only by a province that is both loyal and obedient, because the whole point of a hương
 * ước is that it comes from a commune confident enough to codify its own practice. A sullen
 * province does not write conventions, it ignores yours.
 */
function leOffer(state: GameState) {
  const proposer = ourLands(state).find((land) => land.loyalty > 75 && landCompliance(land) > 80);
  if (!proposer) return undefined;

  const suits = (id: string): boolean => {
    switch (id) {
      case 'le-thuy-loi': return proposer.terrainSummary.water > 0 || proposer.terrainSummary.riceFields > 0;
      case 'le-cho-phien': return proposer.buildings.some((b) => b.type === 'market');
      case 'le-giap-binh': return proposer.localSoldiers > 0;
      default: return true;
    }
  };

  const projectIds = byInstrument('le')
    .filter((project) => notStanding(state, project) && suits(project.id))
    .map((project) => project.id);
  if (projectIds.length === 0) return undefined;

  return {
    instrument: 'le' as const,
    projectIds,
    targetId: proposer.id,
    targetName: proposer.name,
  };
}

// ── Raising and answering ───────────────────────────────────────────────────

export function offerDecree(state: GameState): boolean {
  const offer = buildDecreeOffer(state);
  if (!offer) return false;
  enqueueAscentPrompt(state, { kind: 'decree-offer', ...offer });
  return true;
}

/**
 * `decree:<id>` enacts · `le:<id>:local` grants a custom to its own village only ·
 * `le:<id>:realm` ratifies it everywhere · `decline` refuses.
 *
 * Refusing a lệ is the interesting option and is priced accordingly: it costs the proposing
 * village fifteen compliance but keeps the throne's weight free and its scholars content. A realm
 * that says yes to every village ends up unable to pass a law of its own — which is *phép vua thua
 * lệ làng* played forward.
 */
export function resolveDecreeOffer(state: GameState, choiceId: string, prompt: {
  instrument: DecreeInstrument;
  targetId?: string;
}): boolean {
  const mandate = state.mandate;
  if (!mandate) return true;

  // Anything we do not recognise is a refusal, and this function never returns false for a choice
  // it was given. `resolveDoctrine` returns true unconditionally for the same reason: a prompt that
  // rejects its answer is never dismissed, the queue stops draining, and the run silently stops
  // making decisions. Measured — the economy harness answers unknown kinds with `ok`, and a
  // strict resolver here wedged the card, froze the realm's whole decision loop, and cost it every
  // province by turn 245 with no error anywhere. Refusing is always a legal answer.
  const known = choiceId === 'decline' || choiceId.startsWith('le:') || choiceId.startsWith('decree:')
    || Boolean(getProject(choiceId));
  if (!known || choiceId === 'decline') {
    if (prompt.instrument === 'le' && prompt.targetId) {
      const land = state.lands.find((candidate) => candidate.id === prompt.targetId);
      if (land) {
        land.compliance = Math.max(0, landCompliance(land) - 15);
        pushToast(state, t('decree.le.refused', { land: land.name }), 'info');
      }
      applyEstateDeltas(state, { si: 4, nong: -4 });
    }
    return true;
  }

  if (choiceId.startsWith('le:')) {
    const [, id, scope] = choiceId.split(':');
    applyCustom(state, id, scope === 'realm', prompt.targetId);
    return true;
  }

  const id = choiceId.startsWith('decree:') ? choiceId.slice('decree:'.length) : choiceId;
  applyInstrument(state, id, prompt);
  return true;
}

/** Enacts a sắc, dụ or hịch, stamping an expiry on the two that carry one. */
function applyInstrument(state: GameState, id: string, prompt: { instrument: DecreeInstrument; targetId?: string }): boolean {
  const project = getProject(id);
  const mandate = state.mandate;
  if (!project || !mandate) return false;
  if (mandate.edicts.includes(id)) return false;

  // Sĩ withhold the paperwork below the crisis floor — an instrument still costs a scribe.
  if ((project.edictCost ?? 0) > 0) {
    if (mandate.edictPoints < (project.edictCost ?? 0)) return false;
    if (estateStanding(state, 'si') < 1) return false;
    mandate.edictPoints -= project.edictCost ?? 0;
  }

  mandate.edicts.push(id);
  applyEstateDeltas(state, project.estates);
  if (Object.keys(project.modifier).length > 0) {
    addCourtModifier(state, { id: `project-${id}`, label: projectTitle(project), ...project.modifier });
  }

  // A dụ or hịch lapses on its own; `tickTemporaryDecrees` hands the weight back when it does.
  if (project.kind === 'du' || project.kind === 'hich') {
    // Sát Thát is the exception among hịch: an oath sworn is not withdrawn at the end of a wave.
    if (id !== 'sat-that') {
      mandate.temporary = mandate.temporary ?? {};
      mandate.temporary[id] = state.turn + (project.kind === 'du' ? DU_SEASONS : HICH_SEASONS);
    }
  }

  applySpecialEffect(state, id, prompt.targetId);
  refreshAllLandOutputs(state);
  pushToast(state, t('decree.offer.enacted', { title: projectTitle(project) }), 'milestone');
  return true;
}

/**
 * A custom, granted to its own village or ratified across the realm.
 *
 * Local is strong, free and reaches one province; realm-wide is weaker, costs weight and reaches
 * all of them. That asymmetry is the decision — a wide realm wants the ratification and a tall one
 * usually should not bother.
 */
function applyCustom(state: GameState, id: string, realmWide: boolean, targetId?: string): boolean {
  const project = getProject(id);
  const mandate = state.mandate;
  if (!project || !mandate) return false;

  if (!realmWide) {
    const land = state.lands.find((candidate) => candidate.id === targetId);
    if (!land) return false;
    land.compliance = Math.min(100, landCompliance(land) + 10);
    land.loyalty = Math.min(100, land.loyalty + 6);
    switch (id) {
      case 'le-giap-binh': land.localSoldiers = Math.round(land.localSoldiers * 1.5); break;
      case 'le-cho-phien': land.outputs.gold = Math.round(land.outputs.gold * 1.4); break;
      case 'le-thuy-loi': land.outputs.food += 3; break;
      default: land.defense += 4; break;
    }
    applyEstateDeltas(state, { nong: 6 });
    pushToast(state, t('decree.le.granted', { land: land.name }), 'reward');
    refreshAllLandOutputs(state);
    return true;
  }

  if (mandate.edicts.includes(id)) return false;
  mandate.edicts.push(id);
  applyEstateDeltas(state, project.estates);
  if (Object.keys(project.modifier).length > 0) {
    addCourtModifier(state, { id: `project-${id}`, label: projectTitle(project), ...project.modifier });
  }
  for (const land of ourLands(state)) {
    land.compliance = Math.min(100, landCompliance(land) + 6);
  }
  refreshAllLandOutputs(state);
  pushToast(state, t('decree.le.ratified', { title: projectTitle(project) }), 'milestone');
  return true;
}

/**
 * The one-off world changes a few instruments make on enactment.
 *
 * Kept here rather than in `rules.ts` because these fire *once* and change the world, where a rule
 * reader answers a question every tick. Mixing the two is how a "rule" quietly becomes a hidden
 * side effect nobody can find.
 */
function applySpecialEffect(state: GameState, id: string, targetId?: string): void {
  const mandate = state.mandate;
  if (!mandate) return;

  switch (id) {
    case 'sac-thanh-hoang': {
      // The investiture outlives the person, so it is keyed by *name*: the province must still be
      // able to say who it honours after the hero has died, left, or become a Chronicle echo.
      const land = state.lands.find((candidate) => candidate.id === targetId) ?? ourLands(state)[0];
      const departed = state.heroes.find((hero) => hero.id === targetId);
      if (!land) break;
      mandate.tutelary = mandate.tutelary ?? {};
      mandate.tutelary[land.id] = departed ? heroName(departed) : land.name;
      land.compliance = Math.min(100, landCompliance(land) + 30);
      land.defense += 20;
      break;
    }
    case 'sac-cong-than': {
      const hero = state.heroes.find((candidate) => candidate.id === targetId)
        ?? state.heroes.find((candidate) => candidate.assignedTo?.startsWith('court:'));
      if (!hero) break;
      for (const key of Object.keys(hero.stats) as Array<keyof typeof hero.stats>) {
        hero.stats[key] = Math.min(100, Math.round(hero.stats[key] * 1.15));
      }
      hero.traits = [...(hero.traits ?? []), 'ennobled'];
      break;
    }
    case 'cai-tho-quy-luu': {
      const land = state.lands.find((candidate) => candidate.id === targetId);
      if (!land) break;
      land.compliance = Math.max(0, landCompliance(land) - 40);
      for (const key of ['food', 'supplies', 'gold'] as const) {
        land.outputs[key] = Math.round(land.outputs[key] * 1.4);
      }
      break;
    }
    case 'du-dai-xa': {
      // The accession pardon: everyone drawn back toward even, every grudge struck out.
      mandate.estates = { si: 50, nong: 50, thuong: 50, vo: 50 };
      mandate.decreeResentment = {};
      break;
    }
    case 'du-chan-te': {
      const given = Math.round(state.resources.food * 0.4);
      state.resources.food -= given;
      state.court.stability = Math.min(100, state.court.stability + 12);
      for (const land of ourLands(state)) {
        land.compliance = Math.min(100, landCompliance(land) + 12);
      }
      if (state.ascent) state.ascent.famineCooldown = DU_SEASONS;
      break;
    }
    case 'hoi-nghi-dien-hong': {
      resolveDienHong(state);
      break;
    }
    default: break;
  }
}

/**
 * Hội nghị Diên Hồng, winter 1284 — the elders asked whether to fight, and answered with one word.
 *
 * The single moment in the game where four seasons of governing are judged at once. It is not a
 * choice with a best answer: the *verdict* is read off the estates you already have, so the card is
 * a report on how you have ruled rather than another decision to optimise.
 */
export function resolveDienHong(state: GameState): 'united' | 'divided' | 'mixed' {
  const ascent = state.ascent;
  const si = estateStanding(state, 'si');
  const nong = estateStanding(state, 'nong');
  const thuong = estateStanding(state, 'thuong');
  const vo = estateStanding(state, 'vo');
  const lowest = Math.min(si, nong, thuong, vo);
  const highest = Math.max(si, nong, thuong, vo);

  if (lowest >= 55) {
    state.court.stability = Math.min(100, state.court.stability + 10);
    if (state.mandate) state.mandate.edictPoints += 2;
    for (const land of ourLands(state)) land.defense = Math.round(land.defense * 1.4);
    pushToast(state, t('decree.dienHong.united'), 'milestone');
    return 'united';
  }
  if (lowest < 35) {
    state.court.stability = Math.max(0, state.court.stability - 20);
    if (ascent) ascent.ambition += 4;
    pushToast(state, t('decree.dienHong.divided'), 'threat');
    return 'divided';
  }
  state.court.stability = Math.min(100, state.court.stability + 4);
  pushToast(state, t('decree.dienHong.mixed', { n: Math.round(highest - lowest) }), 'info');
  return 'mixed';
}
