/**
 * Re-renders a file's import statements canonically, so pruning does not leave ragged clauses
 * behind (`import { Copilot} from`, a lone specifier stranded on three lines), and merges the
 * duplicates the split creates — the source imported `BattleSystem` twice, ninety lines apart, and
 * every module that took one function from each end got both statements.
 *
 * Modules, specifiers and their order are preserved; only the punctuation and the grouping change.
 *
 *   node scripts/conquest-split/format-imports.cjs <file> [<file>...]
 */
const ts = require('typescript');
const fs = require('fs');

const WIDTH = 110;

for (const file of process.argv.slice(2)) {
  const text = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);

  /* gather, grouped by module, in first-appearance order */
  const groups = new Map();
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !st.importClause) continue;
    const spec = st.moduleSpecifier.getText(sf);
    if (!groups.has(spec)) groups.set(spec, { first: st, stmts: [] });
    groups.get(spec).stmts.push(st);
  }
  if (!groups.size) continue;

  const edits = [];
  for (const [spec, g] of groups) {
    let def = null;
    let ns = null;
    const named = [];
    const seen = new Set();
    for (const st of g.stmts) {
      const c = st.importClause;
      if (c.name) def = c.name.text;
      if (!c.namedBindings) continue;
      if (ts.isNamespaceImport(c.namedBindings)) { ns = c.namedBindings.name.text; continue; }
      for (const e of c.namedBindings.elements) {
        const key = (e.propertyName ? `${e.propertyName.text}>` : '') + e.name.text;
        if (seen.has(key)) continue;
        seen.add(key);
        // a name imported as a type in one statement and a value in another is a value
        const typeOnly = (c.isTypeOnly || e.isTypeOnly) && !g.stmts.some((o) => {
          const oc = o.importClause;
          if (oc.isTypeOnly || !oc.namedBindings || ts.isNamespaceImport(oc.namedBindings)) return false;
          return oc.namedBindings.elements.some((x) => x.name.text === e.name.text && !x.isTypeOnly);
        });
        named.push(`${typeOnly ? 'type ' : ''}${e.propertyName ? `${e.propertyName.text} as ` : ''}${e.name.text}`);
      }
    }
    const allTypeOnly = g.stmts.every((st) => st.importClause.isTypeOnly);
    const lead = `import ${allTypeOnly && named.length && !def && !ns ? 'type ' : ''}`;
    const bare = allTypeOnly ? named.map((n) => n.replace(/^type /, '')) : named;
    const parts = [];
    if (def) parts.push(def);
    if (ns) parts.push(`* as ${ns}`);
    const one = `${lead}${[...parts, ...(bare.length ? [`{ ${bare.join(', ')} }`] : [])].join(', ')} from ${spec};`;
    const out = one.length <= WIDTH || !bare.length
      ? one
      : `${lead}${parts.length ? parts.join(', ') + ', ' : ''}{\n${bare.map((n) => `  ${n},`).join('\n')}\n} from ${spec};`;

    edits.push({ start: g.first.getStart(sf), end: g.first.getEnd(), text: out });
    for (const st of g.stmts.slice(1)) edits.push({ start: st.getFullStart(), end: st.getEnd(), text: '' });
  }

  const kept = edits.filter((e) => e.text !== text.slice(e.start, e.end));
  if (!kept.length) continue;
  const chunks = [];
  let cursor = 0;
  for (const e of kept.sort((a, b) => a.start - b.start)) {
    if (e.start < cursor) continue;
    chunks.push(text.slice(cursor, e.start), e.text);
    cursor = e.end;
  }
  chunks.push(text.slice(cursor));
  fs.writeFileSync(file, chunks.join('').replace(/\n{3,}/g, '\n\n'));
  const merged = [...groups.values()].filter((g) => g.stmts.length > 1).length;
  console.log(`${file}: reformatted ${kept.length} import(s)${merged ? `, merged ${merged} duplicate module(s)` : ''}`);
}
