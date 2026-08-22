import { storyTemplates } from '../../data/stories';
import type { StoryFragment, StoryNode, StoryTemplate } from './types';

/**
 * Structural checks on the Chronicle's decision trees.
 *
 * A pure graph walk over the authored templates — no run, no state, milliseconds to evaluate. It
 * exists because the design promise *"every answer leads somewhere"* is otherwise a thing people
 * intend rather than a thing that is true: an option with no destination, a node nothing reaches,
 * a typo in a node id. None of those show up until a player is forty minutes into a run and a
 * story stops dead, and at that point nobody can tell what went wrong.
 *
 * So they are checked at module load in dev, and asserted by `verify-chronicle`.
 *
 * A template with no `nodes` is a flat pool and skips every check below except INV-1 — that is
 * what lets the catalogue convert one story at a time.
 */

export interface Violation {
  templateId: string;
  rule: string;
  detail: string;
}

/** Fragments that ask a question, which is what makes a node a decision rather than a scene. */
function decisionFragments(template: StoryTemplate, nodeId: string): StoryFragment[] {
  return template.fragments.filter((fragment) => Boolean(fragment.options?.length)
    && !fragment.opening
    && (fragment.in?.includes(nodeId) ?? false));
}

/**
 * Every node this one can move the story to.
 *
 * Three ways out, and all three have to be counted or the walk reports honest nodes as orphans:
 * an option's `to`, the node's own `onIgnored`, and a fragment's declared `leadsTo` — the last
 * being how a beat that branches on an *outcome* rather than an answer stays visible to a checker
 * that cannot see inside a closure.
 *
 * `only` narrows to the record: exits taken by an option marked `annal`, plus outcome branches,
 * which is what "how many decisions has the record got left" has to follow.
 */
function exitsOf(template: StoryTemplate, nodeId: string, only?: 'annal'): string[] {
  const out = new Set<string>();
  for (const fragment of template.fragments) {
    if (!fragment.in?.includes(nodeId)) continue;
    for (const option of fragment.options ?? []) {
      if (only && option.historicity !== only) continue;
      if (option.to && option.to !== nodeId) out.add(option.to);
    }
    for (const next of fragment.leadsTo ?? []) {
      if (next !== nodeId) out.add(next);
    }
  }
  const node = template.nodes?.find((candidate) => candidate.id === nodeId);
  // An ignored exit is not an answer, so it is not part of the record's own line.
  if (!only && node?.onIgnored && node.onIgnored !== nodeId) out.add(node.onIgnored);
  return [...out];
}

/**
 * Decisions and endings reachable from a node, following exits.
 *
 * Depth-first with a visited set, so a confluence — a divergent branch rejoining the record —
 * is counted once rather than sending the walk round forever.
 */
function subtree(
  template: StoryTemplate,
  from: string,
  opts: { only?: 'annal'; exclude?: Set<string>; skipSelf?: boolean } = {},
): { decisions: number; terminals: number } {
  const seen = new Set<string>();
  const stack = [from];
  let decisions = 0;
  let terminals = 0;
  while (stack.length > 0) {
    const nodeId = stack.pop()!;
    if (seen.has(nodeId)) continue;
    seen.add(nodeId);
    const counts = !(opts.skipSelf && nodeId === from) && !opts.exclude?.has(nodeId);
    if (counts) {
      const node = template.nodes?.find((candidate) => candidate.id === nodeId);
      if (node?.terminal) terminals += 1;
      if (decisionFragments(template, nodeId).length > 0) decisions += 1;
    }
    for (const next of exitsOf(template, nodeId, opts.only)) stack.push(next);
  }
  return { decisions, terminals };
}

function nodeClass(template: StoryTemplate, nodeId: string): StoryNode['historicity'] {
  return template.nodes?.find((candidate) => candidate.id === nodeId)?.historicity ?? 'chinh-su';
}

/** Every structural violation in the catalogue, or an empty list. */
export function storyViolations(templates: StoryTemplate[] = storyTemplates): Violation[] {
  const out: Violation[] = [];
  const fail = (templateId: string, rule: string, detail: string) => out.push({ templateId, rule, detail });

  for (const template of templates) {
    const nodes = template.nodes;
    const ids = new Set((nodes ?? []).map((node) => node.id));

    // INV-1 — the whole promise, and the only rule that applies to a flat pool too.
    for (const fragment of template.fragments) {
      for (const option of fragment.options ?? []) {
        if (nodes?.length && !option.to) {
          fail(template.id, 'INV-1', `${fragment.id}/${option.id} declares no destination`);
        }
      }
    }
    if (!nodes?.length) continue;

    const entry = template.entry ?? nodes[0].id;
    if (!ids.has(entry)) fail(template.id, 'INV-2', `entry '${entry}' is not a node`);

    // INV-8 — a typo in a string id is the failure mode this design is most exposed to, so it is
    // checked before anything that would walk those ids.
    for (const fragment of template.fragments) {
      for (const nodeId of fragment.in ?? []) {
        if (!ids.has(nodeId)) fail(template.id, 'INV-8', `${fragment.id}.in names unknown node '${nodeId}'`);
      }
      for (const option of fragment.options ?? []) {
        if (option.to && !ids.has(option.to)) {
          fail(template.id, 'INV-8', `${fragment.id}/${option.id}.to names unknown node '${option.to}'`);
        }
      }
    }
    for (const node of nodes) {
      if (node.onIgnored && !ids.has(node.onIgnored)) {
        fail(template.id, 'INV-8', `${node.id}.onIgnored names unknown node '${node.onIgnored}'`);
      }
    }

    // INV-2 — reachability. Prose no player can reach is prose nobody wrote for a reason.
    const reached = new Set<string>();
    const stack = [entry];
    while (stack.length > 0) {
      const nodeId = stack.pop()!;
      if (reached.has(nodeId)) continue;
      reached.add(nodeId);
      for (const next of exitsOf(template, nodeId)) stack.push(next);
    }
    for (const node of nodes) {
      if (!reached.has(node.id)) fail(template.id, 'INV-2', `node '${node.id}' is unreachable from '${entry}'`);
    }

    for (const node of nodes) {
      if (node.terminal) {
        // INV-4 — otherwise the story stands in its own ending forever.
        const hasEnd = template.fragments.some((fragment) => fragment.terminal && fragment.in?.includes(node.id));
        if (!hasEnd) fail(template.id, 'INV-4', `terminal node '${node.id}' holds no terminal fragment`);
      } else {
        // INV-3 — a node with no way out strands the story wherever the player left it.
        if (exitsOf(template, node.id).length === 0) fail(template.id, 'INV-3', `node '${node.id}' has no exit`);
        if (!node.onIgnored) fail(template.id, 'INV-3', `node '${node.id}' declares no onIgnored`);
      }

      // INV-7 — "drift never decreases along a path" has no static form worth writing: `enterNode`
      // takes a max, so it is true by construction, and a downstream `chinh-su` node is a
      // deliberate confluence rather than a mistake. It stays in the numbering because the
      // property is real and load-bearing; it is simply enforced in the engine, not here.
    }

    // INV-5 — a story with only recorded endings has no counterfactual; one with only divergent
    // endings has no record to diverge from.
    const terminals = nodes.filter((node) => node.terminal);
    if (!terminals.some((node) => node.historicity === 'ngoai-truyen')) {
      fail(template.id, 'INV-5', 'no ngoại truyện ending');
    }
    if (!terminals.some((node) => node.historicity !== 'ngoai-truyen')) {
      fail(template.id, 'INV-5', 'no recorded (chính sử / dã sử) ending');
    }

    // INV-6 — one decision is an event, not a story.
    const decisionNodes = nodes.filter((node) => decisionFragments(template, node.id).length > 0);
    if (decisionNodes.length < 2) {
      fail(template.id, 'INV-6', `only ${decisionNodes.length} node(s) ask anything`);
    }

    // INV-9 / INV-10 — branch parity. The rule that stops a divergence being a detour: leave the
    // record at the first of five decisions and you owe the player four more, not a paragraph.
    // The record: every node reachable from the entry by taking annal answers and following
    // outcomes. A divergent branch is measured against what the record still had to offer, and
    // the record's own nodes are not counted as part of the branch even when it rejoins them.
    const record = new Set<string>();
    {
      const walk = [entry];
      while (walk.length > 0) {
        const nodeId = walk.pop()!;
        if (record.has(nodeId)) continue;
        record.add(nodeId);
        for (const next of exitsOf(template, nodeId, 'annal')) walk.push(next);
      }
    }

    for (const node of nodes) {
      if (node.historicity === 'ngoai-truyen') continue;
      // Decisions the record has left *after* this one — the count the branch is held against.
      const here = subtree(template, node.id, { only: 'annal', skipSelf: true });
      for (const fragment of template.fragments) {
        if (!fragment.in?.includes(node.id)) continue;
        for (const option of fragment.options ?? []) {
          if (!option.to || nodeClass(template, option.to) !== 'ngoai-truyen') continue;
          if (nodeClass(template, node.id) === 'ngoai-truyen') continue;
          const branch = subtree(template, option.to, { exclude: record });
          const owed = Math.max(0, here.decisions - 1);
          if (branch.decisions < owed) {
            fail(template.id, 'INV-9',
              `${node.id} → ${option.to}: branch has ${branch.decisions} decision(s), owes ${owed}`);
          }
          if (branch.terminals < 2) {
            fail(template.id, 'INV-10',
              `${node.id} → ${option.to}: branch has ${branch.terminals} ending(s), needs 2`);
          }
          const target = nodes.find((candidate) => candidate.id === option.to);
          if (target?.terminal) {
            fail(template.id, 'INV-10', `${node.id} → ${option.to}: first divergence is itself terminal`);
          }
        }
      }
    }
  }
  return out;
}

/** One line per violation, for a harness or a console. */
export function describeViolations(violations: Violation[]): string[] {
  return violations.map((v) => `${v.rule} ${v.templateId}: ${v.detail}`);
}
