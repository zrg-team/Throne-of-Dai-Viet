import { getProject, REALM_PROJECTS, type ProjectUnlock, type RealmProject } from '../../data/edicts';
import { PLAYER_KINGDOM_ID } from '../../game/constants';
import type { GameState, ResourceKey } from '../../state/types';
import { addCourtModifier } from '../CourtSystem';
import { applyResourceDelta, canSpend, refreshAllLandOutputs } from '../ResourceSystem';
import { eraIndex, grantEdictPoints } from './MandateSystem';
import { pushToast } from './notifications';
import { resourceLabel, t } from '../../i18n';

function pct(v: number): string {
  return `${v > 0 ? '+' : ''}${Math.round(v * 100)}%`;
}

/**
 * A concrete, human-readable summary of exactly what a project's permanent modifier does
 * (e.g. "+30% market gold · −20% building cost"), so enacting an edict shows its payoff in
 * hard numbers rather than a vague blurb — the point of "chiếu chỉ" becomes legible.
 */
export function projectEffectSummary(project: RealmProject): string {
  const m = project.modifier;
  const parts: string[] = [];
  if (m.resourceRateModifier) {
    for (const [k, v] of Object.entries(m.resourceRateModifier)) {
      if (!v) continue;
      parts.push(t('edict.fx.rate', { value: `${v > 0 ? '+' : ''}${v}`, res: resourceLabel(k as ResourceKey) }));
    }
  }
  if (m.marketGoldOutputModifier) parts.push(t('edict.fx.marketGold', { pct: pct(m.marketGoldOutputModifier) }));
  if (m.recruitSpeedModifier) parts.push(t('edict.fx.recruitSpeed', { pct: pct(m.recruitSpeedModifier) }));
  if (m.armyXpModifier) parts.push(t('edict.fx.armyXp', { pct: pct(m.armyXpModifier) }));
  if (m.buildingCostModifier) parts.push(t('edict.fx.buildCost', { pct: pct(m.buildingCostModifier) }));
  if (m.buildSpeedBonus) parts.push(t('edict.fx.buildSpeed', { n: m.buildSpeedBonus }));
  if (m.upgradeSpeedBonus) parts.push(t('edict.fx.upgradeSpeed', { n: m.upgradeSpeedBonus }));
  if (m.acquisitionCostModifier) parts.push(t('edict.fx.acqCost', { pct: pct(m.acquisitionCostModifier) }));
  if (m.armyGoldUpkeepModifier) parts.push(t('edict.fx.armyUpkeep', { pct: pct(m.armyGoldUpkeepModifier) }));
  if (m.recruitmentSupplyCostModifier) parts.push(t('edict.fx.recruitSupply', { pct: pct(m.recruitmentSupplyCostModifier) }));
  if (m.courtCardSpeedModifier) parts.push(t('edict.fx.courtCard', { pct: pct(m.courtCardSpeedModifier) }));
  if (m.armyLevelCapBonus) parts.push(t('edict.fx.levelCap', { n: m.armyLevelCapBonus }));
  return parts.join('  ·  ');
}

export function projectTitle(project: RealmProject): string {
  return t(`empire.edict.${project.id}` as Parameters<typeof t>[0]);
}

export function projectDescription(project: RealmProject): string {
  return t(`empire.edict.${project.id}.d` as Parameters<typeof t>[0]);
}

export function isProjectEnacted(state: GameState, id: string): boolean {
  return Boolean(state.mandate?.edicts.includes(id));
}

/** True once the run has produced what this unlock asks for. Non-ascent saves never satisfy one. */
export function isUnlockMet(state: GameState, unlock: ProjectUnlock): boolean {
  const ascent = state.ascent;
  if (!ascent) return false;
  switch (unlock.kind) {
    case 'level': return ascent.level >= unlock.level;
    case 'lands': return state.lands.filter((land) => land.ownerId === PLAYER_KINGDOM_ID).length >= unlock.count;
    case 'waves': return ascent.wavesSurvived >= unlock.count;
    case 'chronicle': return (state.storiesEnded?.length ?? 0) >= unlock.count;
    case 'seat': {
      const wanted: Array<GameState['heroes'][number]['rarity']> = unlock.rarity === 'Epic' ? ['Epic', 'Legendary'] : ['Legendary'];
      return state.heroes.some((hero) => hero.assignedTo?.startsWith('court:') && wanted.includes(hero.rarity));
    }
  }
}

/** The unmet unlock as a sentence — what play still has to produce before this project exists. */
function unlockBlockedReason(state: GameState, unlock: ProjectUnlock): string | undefined {
  if (isUnlockMet(state, unlock)) return undefined;
  switch (unlock.kind) {
    case 'level': return t('empire.edict.blocked.level', { n: unlock.level });
    case 'lands': return t('empire.edict.blocked.lands', { n: unlock.count });
    case 'waves': return t('empire.edict.blocked.waves', { n: unlock.count });
    case 'chronicle': return t('empire.edict.blocked.chronicle', { n: unlock.count });
    case 'seat': return t('empire.edict.blocked.seat', { rarity: t(`rarity.${unlock.rarity}` as Parameters<typeof t>[0]) });
  }
}

/** Reason a project can't be enacted right now, or undefined if it can. */
export function projectBlockedReason(state: GameState, project: RealmProject): string | undefined {
  const mandate = state.mandate;
  if (!mandate) return t('empire.edict.blocked.mode');
  if (mandate.edicts.includes(project.id)) return t('empire.edict.blocked.done');
  if (project.unlock) {
    const reason = unlockBlockedReason(state, project.unlock);
    if (reason) return reason;
  }
  // A mutually-exclusive sibling was already chosen — this path is locked for the run.
  if (project.exclusiveGroup && mandate.edicts.some((id) => {
    const other = getProject(id);
    return other && other.id !== project.id && other.exclusiveGroup === project.exclusiveGroup;
  })) {
    return t('empire.edict.blocked.exclusive');
  }
  if (eraIndex(mandate.era) < eraIndex(project.era)) {
    return t('empire.edict.blocked.era', { era: t(`empire.era.${project.era}` as Parameters<typeof t>[0]) });
  }
  if (project.kind === 'edict') {
    if ((mandate.edictPoints ?? 0) < (project.edictCost ?? 0)) return t('empire.edict.blocked.points');
  } else if (project.resourceCost && !canSpend(state, project.resourceCost)) {
    return t('empire.edict.blocked.cost');
  }
  return undefined;
}

/** Enacts an edict (spends edict-points) or funds a Wonder (spends resources). */
export function enactProject(state: GameState, id: string): boolean {
  const project = getProject(id);
  const mandate = state.mandate;
  if (!project || !mandate) return false;
  if (projectBlockedReason(state, project)) return false;

  if (project.kind === 'edict') {
    mandate.edictPoints -= project.edictCost ?? 0;
  } else if (project.resourceCost) {
    applyResourceDelta(state, Object.fromEntries(Object.entries(project.resourceCost).map(([k, v]) => [k, -(v ?? 0)])));
    state.wondersBuilt = (state.wondersBuilt ?? 0) + 1;
  }

  // Raising a Wonder is a feat of authority — it returns an edict point to spend.
  if (project.kind === 'wonder') {
    grantEdictPoints(state, 1);
  }

  mandate.edicts.push(project.id);
  addCourtModifier(state, {
    id: `project-${project.id}`,
    label: projectTitle(project),
    ...project.modifier,
  });
  refreshAllLandOutputs(state);

  const effects = projectEffectSummary(project);
  const baseToast = project.kind === 'wonder'
    ? t('empire.edict.wonderBuilt', { title: projectTitle(project) })
    : t('empire.edict.enacted', { title: projectTitle(project) });
  pushToast(state, effects ? `${baseToast} — ${effects}` : baseToast, 'milestone');
  return true;
}

/**
 * The projects this save can ever see. Play-unlocked edicts exist only in Dragon Ascent —
 * empire mode has no waves, levels or chronicle, so listing them there would be a column of
 * rows whose requirement can never come true.
 */
export function allProjects(state?: GameState): RealmProject[] {
  if (state && !state.ascent) return REALM_PROJECTS.filter((project) => !project.unlock);
  return REALM_PROJECTS;
}
