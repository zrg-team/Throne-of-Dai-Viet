import { getProject, REALM_PROJECTS } from '../../data/edicts';
import type { GameState, SchoolId } from '../../state/types';
import { addCourtModifier } from '../CourtSystem';
import { applyEstateDeltas, standingDecrees } from '../DecreeSystem';
import { pushToast } from '../empire/notifications';
import { projectTitle } from '../empire/EdictSystem';
import { t } from '../../i18n';

/**
 * Schools of statecraft — what makes one reign different from the last.
 *
 * Three exclusive groups across the whole catalogue was never enough branching for two runs to
 * feel different: everything else was bought in whatever order the points arrived, which is a
 * checklist rather than a decision. Four opposed schools, each with a capstone that locks its
 * opposite out, is.
 *
 * The pairs are opposed because they *were*. Pháp gia against Phật gia is Hồ Quý Ly against the
 * Lý–Trần settlement — legislation imposed at speed against a realm governed by leaving it alone.
 * Nho gia against Binh gia is Lê Thánh Tông's civil bureaucracy against the Tây Sơn's armed
 * pragmatism. A run that commits to one of those is committing against the other, and the capstone
 * makes the commitment worth having made.
 */

/** Decrees of one school needed before its capstone unlocks. */
export const SCHOOL_COMMIT = 3;

export const SCHOOL_OPPOSITE: Record<SchoolId, SchoolId> = {
  phap: 'phat',
  phat: 'phap',
  nho: 'binh',
  binh: 'nho',
};

export const ALL_SCHOOLS: SchoolId[] = ['phap', 'nho', 'binh', 'phat'];

/** The modifier id a capstone's permanent bonus is filed under, so it can be found later. */
const capstoneModifierId = (school: SchoolId) => `capstone-${school}`;

/** How many standing decrees the realm holds of each school. */
export function schoolTally(state: GameState): Record<SchoolId, number> {
  const tally: Record<SchoolId, number> = { phap: 0, nho: 0, binh: 0, phat: 0 };
  for (const project of standingDecrees(state)) {
    if (project.school) tally[project.school] += 1;
  }
  return tally;
}

/** The school this reign has committed to, if any. Highest tally at or past the threshold. */
export function committedSchool(state: GameState): SchoolId | undefined {
  const tally = schoolTally(state);
  const best = ALL_SCHOOLS
    .filter((school) => tally[school] >= SCHOOL_COMMIT)
    .sort((a, b) => tally[b] - tally[a])[0];
  return best;
}

/**
 * True once a school is shut for this run.
 *
 * Shut by *commitment to its opposite*, not by the capstone being taken — the fork has to close
 * when the player commits, or they could hedge across both halves of an opposed pair and then pick
 * whichever capstone the run happened to favour, which is the opposite of a decision.
 */
export function isSchoolLocked(state: GameState, school: SchoolId): boolean {
  const committed = committedSchool(state);
  if (!committed) return false;
  return SCHOOL_OPPOSITE[committed] === school;
}

/** Capstones already taken this run. */
export function capstonesTaken(state: GameState): SchoolId[] {
  return (state.mandate?.capstones ?? []) as SchoolId[];
}

/** True once this school's capstone is available and not yet taken. */
export function capstoneReady(state: GameState, school: SchoolId): boolean {
  if (!state.mandate) return false;
  if (capstonesTaken(state).includes(school)) return false;
  return schoolTally(state)[school] >= SCHOOL_COMMIT;
}

/**
 * Grants a school's capstone.
 *
 * Each is deliberately lopsided rather than large. A capstone that was simply a big bonus would
 * make the school choice a power ranking; each of these instead takes something away, and the
 * thing it takes is what the opposing school was for. Nghiêm pháp frees you from weight entirely
 * and starts the country bleeding obedience; Trúc Lâm makes the realm unshakeable and closes the
 * army down; Sát Thát vĩnh cửu makes the army unbreakable and closes governing down; the Hồng Đức
 * code is the only one with no sting, and it is the one that takes longest to reach.
 */
export function takeCapstone(state: GameState, school: SchoolId): boolean {
  const mandate = state.mandate;
  if (!mandate || !capstoneReady(state, school)) return false;

  mandate.capstones = [...capstonesTaken(state), school];

  switch (school) {
    case 'nho':
      // Quốc triều hình luật, 1483 — the Hồng Đức code. Every weight lighter, more authority,
      // and (as the real code allowed, uniquely in the region) women inherit.
      addCourtModifier(state, {
        id: capstoneModifierId(school),
        label: t('decree.capstone.nho'),
        courtCardSpeedModifier: 0.4,
        resourceRateModifier: { humans: 4, gold: 2 },
      });
      mandate.edictPoints += 2;
      applyEstateDeltas(state, { si: 15, nong: 10 });
      break;

    case 'binh':
      // Sát Thát vĩnh cửu. The host never breaks again, and nobody will ever legislate for you.
      addCourtModifier(state, {
        id: capstoneModifierId(school),
        label: t('decree.capstone.binh'),
        armyPowerModifier: 0.25,
        armyLevelCapBonus: 1,
      });
      applyEstateDeltas(state, { vo: 25, si: -25, nong: -20 });
      break;

    case 'phap':
      // Nghiêm pháp. Weight stops mattering; obedience starts bleeding. Read by `authorityCap`.
      applyEstateDeltas(state, { thuong: 15, si: 10, nong: -20 });
      break;

    case 'phat':
      // Trúc Lâm — Trần Nhân Tông's mountain school. Nothing shakes the realm, and it stops
      // wanting anything. Ambition and stability are read from `hasCapstone` at their own sites.
      addCourtModifier(state, {
        id: capstoneModifierId(school),
        label: t('decree.capstone.phat'),
        resourceRateModifier: { food: 6, humans: 4 },
      });
      applyEstateDeltas(state, { nong: 20, si: 10, vo: -20 });
      break;
  }

  pushToast(state, t('decree.capstone.taken', {
    title: t(`decree.capstone.${school}` as Parameters<typeof t>[0]),
  }), 'milestone');
  return true;
}

/** True when a given capstone is in force — the reader the rule sites use. */
export function hasCapstone(state: GameState, school: SchoolId): boolean {
  return capstonesTaken(state).includes(school);
}

/**
 * The reign, named.
 *
 * The run summary previously had nothing to say about *how* you governed, only how long you
 * lasted — which is the whole reason a decree-heavy run and a decree-free one felt identical at
 * the end. Named off the school, the capstone and the heaviest law actually passed, so two runs
 * that scored the same read differently.
 */
export function reignName(state: GameState): string {
  const school = committedSchool(state);
  const capstone = capstonesTaken(state)[0];
  if (capstone) return t(`decree.capstone.${capstone}` as Parameters<typeof t>[0]);

  if (school) {
    return t('decree.reign.school', { school: t(`decree.school.${school}` as Parameters<typeof t>[0]) });
  }

  const heaviest = standingDecrees(state).sort((a, b) => b.weight - a.weight)[0];
  if (heaviest) return t('decree.reign.law', { title: projectTitle(heaviest) });
  return t('decree.reign.plain');
}

/** A one-line account of the reign for the summary screen. */
export function reignSummary(state: GameState): string {
  const tally = schoolTally(state);
  const school = committedSchool(state);
  return t('decree.reign.summary', {
    decrees: standingDecrees(state).length,
    school: school ? t(`decree.school.${school}` as Parameters<typeof t>[0]) : t('decree.school.none'),
    n: school ? tally[school] : 0,
  });
}

/** Every decree of a school, for the court screen's progress readout. */
export function schoolDecrees(school: SchoolId) {
  return REALM_PROJECTS.filter((project) => project.school === school);
}

/** Blocks a decree whose school this reign has already committed against. */
export function schoolBlockedReason(state: GameState, projectId: string): string | undefined {
  const project = getProject(projectId);
  if (!project?.school) return undefined;
  if (!isSchoolLocked(state, project.school)) return undefined;
  return t('decree.school.locked', {
    school: t(`decree.school.${project.school}` as Parameters<typeof t>[0]),
  });
}
