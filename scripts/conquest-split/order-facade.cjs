/**
 * Reorders the members of ConquestUIScene so the facade reads as a table of contents: every field
 * together, then the lifecycle, then the forwarding methods grouped by the module they hand off to.
 *
 * Members are moved whole — leading doc comment included — and never rewritten. Field initialisers
 * in this class are all literals (`= []`, `= ''`, `= 0`, `= new Set()`), so with
 * `useDefineForClassFields` their relative order carries no meaning and regrouping is safe.
 *
 *   node tools/order-facade.cjs
 */
const ts = require('typescript');
const fs = require('fs');

const SRC = 'src/scenes/ConquestUIScene.ts';
const text = fs.readFileSync(SRC, 'utf8');
const sf = ts.createSourceFile(SRC, text, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
const cls = sf.statements.find((s) => ts.isClassDeclaration(s) && s.name && s.name.text === 'ConquestUIScene');

/** The module namespace a forwarding method hands off to, or null if it does something itself. */
function forwardsTo(m) {
  if (!ts.isMethodDeclaration(m) || !m.body || m.body.statements.length !== 1) return null;
  const st = m.body.statements[0];
  const expr = ts.isExpressionStatement(st) ? st.expression : ts.isReturnStatement(st) ? st.expression : null;
  if (!expr || !ts.isCallExpression(expr) || !ts.isPropertyAccessExpression(expr.expression)) return null;
  const ns = expr.expression.expression;
  return ts.isIdentifier(ns) ? ns.text : null;
}

const fields = [];
const getters = [];
let ctor = null;
const lifecycle = [];
const groups = new Map();

const LIFECYCLE = new Set(['init', 'create', 'refresh']);
for (const m of cls.members) {
  let src = text.slice(m.getFullStart(), m.getEnd()).replace(/^\n+/, '');
  // A one-line stub is the point; but where the signature itself wraps, the forwarding call ends up
  // trailing a return type three lines long. Give those a body of their own.
  if (ts.isMethodDeclaration(m) && m.body) {
    const head = text.slice(m.getStart(sf), m.body.getStart(sf));
    if (head.includes('\n') && m.body.statements.length === 1 && !text.slice(m.body.getStart(sf), m.getEnd()).includes('\n')) {
      const call = text.slice(m.body.getStart(sf) + 1, m.getEnd() - 1).trim();
      src = src.replace(text.slice(m.body.getStart(sf), m.getEnd()), `{\n    ${call}\n  }`);
    }
  }
  const entry = { src, name: m.name && ts.isIdentifier(m.name) ? m.name.text : '' };
  if (ts.isConstructorDeclaration(m)) { ctor = entry; continue; }
  if (ts.isPropertyDeclaration(m)) { fields.push(entry); continue; }
  if (ts.isGetAccessor(m) || ts.isSetAccessor(m)) { getters.push(entry); continue; }
  if (LIFECYCLE.has(entry.name)) { lifecycle.push(entry); continue; }
  const ns = forwardsTo(m) || '~scene';
  if (!groups.has(ns)) groups.set(ns, []);
  groups.get(ns).push(entry);
}

/** Reading order: the shell and the lanes frame the screen, then prompts, screens, and the fight. */
const ORDER = ['shell', 'tour', 'lanesFrame', 'lanesWidgets', 'promptsFrame', 'promptsOptionCard'];
const rank = (ns) => {
  const i = ORDER.indexOf(ns);
  if (i >= 0) return i;
  if (ns.startsWith('prompts')) return 100;
  if (ns.startsWith('screens')) return 200;
  if (ns.startsWith('battle')) return 300;
  return 400;
};
const ordered = [...groups.entries()].sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0]));

const BANNER = (title) => `  /* ${'-'.repeat(Math.max(3, 74 - title.length))} ${title} */`;
const LABEL = {
  shell: 'the standing screen: bar, map controls, overlays',
  tour: 'the first-run walkthrough',
  lanesFrame: 'the lane: the sliding page every screen is drawn into',
  lanesWidgets: 'the widgets a lane page is built from',
  promptsFrame: 'the prompt card, and the answer coming back',
  promptsOptionCard: 'the option card every prompt is a stack of',
};

const body = [
  fields.map((f) => f.src).join('\n\n'),
  getters.length ? getters.map((g) => g.src).join('\n\n') : null,
  ctor ? ctor.src : null,
  BANNER('Phaser lifecycle'),
  lifecycle.map((l) => l.src).join('\n\n'),
  ...ordered.map(([ns, ms]) => `${BANNER(LABEL[ns] || ns.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase())}\n\n${ms.map((m) => m.src).join('\n\n')}`),
].filter(Boolean).join('\n\n');

const out = text.slice(0, cls.members[0].getFullStart()) + '\n' + body + '\n}\n';
fs.writeFileSync(SRC, out);
console.log(`fields ${fields.length}  getters ${getters.length}  lifecycle ${lifecycle.length}  groups ${ordered.length}`);
for (const [ns, ms] of ordered) console.log(`  ${String(ms.length).padStart(3)}  ${ns}`);
