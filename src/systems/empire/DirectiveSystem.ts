import { DIRECTIVE_METRICS, DIRECTIVE_TEMPLATES, type DirectiveTemplate } from '../../data/directives';
import type { Directive, DirectiveTier, GameState } from '../../state/types';
import { applyResourceDelta } from '../ResourceSystem';
import { addMandate } from './MandateSystem';
import { pushToast } from './notifications';
import { t } from '../../i18n';

const TIERS: DirectiveTier[] = ['short', 'medium', 'epic'];

let directiveSeq = 0;

function metric(state: GameState, key: string): number {
  const fn = DIRECTIVE_METRICS[key];
  return fn ? fn(state) : 0;
}

function templatesForTier(tier: DirectiveTier): DirectiveTemplate[] {
  return DIRECTIVE_TEMPLATES.filter((tmpl) => tmpl.tier === tier);
}

/** Localised human-readable title, with the concrete target substituted in. */
export function directiveTitle(directive: Directive): string {
  return t(`empire.directive.${directive.templateId}` as Parameters<typeof t>[0], { target: directive.target });
}

function makeDirective(state: GameState, tmpl: DirectiveTemplate): Directive {
  const current = metric(state, tmpl.metricKey);
  directiveSeq += 1;
  return {
    id: `directive-${state.turn}-${directiveSeq}`,
    templateId: tmpl.id,
    tier: tmpl.tier,
    metricKey: tmpl.metricKey,
    target: tmpl.target(state, current),
    baseline: current,
    current,
    rewardMandate: tmpl.rewardMandate,
    rewardResources: tmpl.rewardResources,
    complete: false,
  };
}

/** Draws the next un-active template of a tier via a rotating cursor. */
function issueDirective(state: GameState, tier: DirectiveTier): void {
  if (!state.directives || !state.directiveDeckCursor) return;
  const pool = templatesForTier(tier);
  if (pool.length === 0) return;

  const activeIds = new Set(state.directives.filter((d) => !d.complete && !d.failed).map((d) => d.templateId));
  let cursor = state.directiveDeckCursor[tier] ?? 0;
  let chosen: DirectiveTemplate | undefined;
  for (let i = 0; i < pool.length; i += 1) {
    const candidate = pool[(cursor + i) % pool.length];
    if (!activeIds.has(candidate.id)) {
      chosen = candidate;
      cursor = (cursor + i + 1) % pool.length;
      break;
    }
  }
  if (!chosen) {
    chosen = pool[cursor % pool.length];
    cursor = (cursor + 1) % pool.length;
  }
  state.directiveDeckCursor[tier] = cursor;

  const directive = makeDirective(state, chosen);
  // Guard against issuing an already-met goal (e.g. relative target underflow).
  if (directive.current >= directive.target) {
    directive.target = directive.current + Math.max(1, Math.round(directive.target * 0.1));
  }
  state.directives.push(directive);
}

export function initDirectives(state: GameState): void {
  state.directives = [];
  state.directiveDeckCursor = { short: 0, medium: 0, epic: 0 };
  for (const tier of TIERS) {
    issueDirective(state, tier);
  }
}

/**
 * Issues a timed "prep" directive tied to a telegraphed threat: repel one more
 * host before the deadline. Rewards heavily; fails (no penalty beyond loss) if the
 * deadline passes uncompleted.
 */
export function issuePrepDirective(state: GameState, dueTurn: number, rewardMandate: number): void {
  if (!state.directives) return;
  const current = metric(state, 'invasionsRepelled');
  directiveSeq += 1;
  state.directives.push({
    id: `directive-prep-${state.turn}-${directiveSeq}`,
    templateId: 'prep-defense',
    tier: 'medium',
    metricKey: 'invasionsRepelled',
    target: current + 1,
    baseline: current,
    current,
    rewardMandate,
    rewardResources: { supplies: 40, gold: 30 },
    deadline: dueTurn + 3,
    complete: false,
  });
}

/** Issues the one-time climactic Ascension directive when the final era is reached. */
function maybeIssueAscension(state: GameState): void {
  const mandate = state.mandate;
  if (!state.directives || !mandate || !mandate.ascensionReady || mandate.ascensionIssued) return;
  mandate.ascensionIssued = true;
  const repelled = state.invasionsRepelled ?? 0;
  directiveSeq += 1;
  state.directives.push({
    id: `directive-ascension-${state.turn}-${directiveSeq}`,
    templateId: 'ascension',
    tier: 'epic',
    metricKey: 'invasionsRepelled',
    target: repelled + 3,
    baseline: repelled,
    current: repelled,
    rewardMandate: 60,
    complete: false,
  });
  pushToast(state, t('empire.ascend.available'), 'milestone');
}

export function progressDirectives(state: GameState): void {
  if (!state.directives) return;

  maybeIssueAscension(state);

  const completedTiers: DirectiveTier[] = [];
  const failedTiers: DirectiveTier[] = [];

  for (const directive of state.directives) {
    if (directive.complete || directive.failed) continue;
    directive.current = metric(state, directive.metricKey);

    if (directive.current >= directive.target) {
      directive.complete = true;
      addMandate(state, directive.rewardMandate);
      if (directive.rewardResources) {
        applyResourceDelta(state, directive.rewardResources);
      }
      if (directive.templateId === 'ascension') {
        if (state.mandate) state.mandate.ascended = true;
        pushToast(state, t('empire.ascend.done'), 'milestone');
      } else {
        pushToast(state, t('empire.directive.complete', { title: directiveTitle(directive), mandate: directive.rewardMandate }), 'reward');
      }
      // Prep and ascension directives are one-time; don't refill their tier.
      if (directive.templateId !== 'prep-defense' && directive.templateId !== 'ascension') {
        completedTiers.push(directive.tier);
      }
      continue;
    }

    if (directive.deadline !== undefined && state.turn > directive.deadline) {
      directive.failed = true;
      pushToast(state, t('empire.directive.failed', { title: directiveTitle(directive) }), 'threat');
    }
  }

  // Drop finished cards and refill each standard tier so three are always live.
  state.directives = state.directives.filter((d) => !d.complete && !d.failed);
  for (const tier of completedTiers) {
    issueDirective(state, tier);
  }
  // A standard tier can also go empty if a prep directive failed; keep 3 minimum.
  for (const tier of TIERS) {
    const hasStandard = state.directives.some((d) => d.tier === tier && d.templateId !== 'prep-defense');
    if (!hasStandard && !completedTiers.includes(tier) && !failedTiers.includes(tier)) {
      issueDirective(state, tier);
    }
  }
}
