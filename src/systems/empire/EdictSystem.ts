import { getProject, REALM_PROJECTS, type RealmProject } from '../../data/edicts';
import type { GameState } from '../../state/types';
import { addCourtModifier } from '../CourtSystem';
import { applyResourceDelta, canSpend, refreshAllLandOutputs } from '../ResourceSystem';
import { eraIndex } from './MandateSystem';
import { pushToast } from './notifications';
import { t } from '../../i18n';

export function projectTitle(project: RealmProject): string {
  return t(`empire.edict.${project.id}` as Parameters<typeof t>[0]);
}

export function projectDescription(project: RealmProject): string {
  return t(`empire.edict.${project.id}.d` as Parameters<typeof t>[0]);
}

export function isProjectEnacted(state: GameState, id: string): boolean {
  return Boolean(state.mandate?.edicts.includes(id));
}

/** Reason a project can't be enacted right now, or undefined if it can. */
export function projectBlockedReason(state: GameState, project: RealmProject): string | undefined {
  const mandate = state.mandate;
  if (!mandate) return t('empire.edict.blocked.mode');
  if (mandate.edicts.includes(project.id)) return t('empire.edict.blocked.done');
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

  mandate.edicts.push(project.id);
  addCourtModifier(state, {
    id: `project-${project.id}`,
    label: projectTitle(project),
    ...project.modifier,
  });
  refreshAllLandOutputs(state);

  pushToast(
    state,
    project.kind === 'wonder'
      ? t('empire.edict.wonderBuilt', { title: projectTitle(project) })
      : t('empire.edict.enacted', { title: projectTitle(project) }),
    'milestone',
  );
  return true;
}

export function allProjects(): RealmProject[] {
  return REALM_PROJECTS;
}
