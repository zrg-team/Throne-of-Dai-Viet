/**
 * Drops import specifiers a file no longer names.
 *
 * The split left ConquestUIScene importing most of what it used to need, because the code that
 * needed it moved out. Purely textual: it removes specifiers and whole import statements, and
 * never touches anything else.
 *
 *   node tools/prune-imports.cjs <file> [<file>...]
 */
const ts = require('typescript');
const fs = require('fs');

let totalSpecs = 0;
let totalDecls = 0;

for (const file of process.argv.slice(2)) {
  const text = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);

  /** Every identifier the file names outside of its own import clauses. */
  const used = new Set();
  const walk = (n) => {
    if (ts.isImportDeclaration(n)) return;
    if (ts.isIdentifier(n)) {
      const p = n.parent;
      const isMemberName =
        (ts.isPropertyAccessExpression(p) && p.name === n) ||
        (ts.isPropertyAssignment(p) && p.name === n) ||
        (ts.isPropertySignature(p) && p.name === n) ||
        (ts.isMethodSignature(p) && p.name === n) ||
        (ts.isQualifiedName(p) && p.right === n) ||
        (ts.isBindingElement(p) && p.propertyName === n) ||
        (ts.isEnumMember(p) && p.name === n);
      if (!isMemberName) used.add(n.text);
    }
    ts.forEachChild(n, walk);
  };
  ts.forEachChild(sf, walk);

  const edits = [];
  let specs = 0;
  let decls = 0;
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st)) continue;
    const c = st.importClause;
    if (!c) continue; // a bare `import 'x'` is a side effect, leave it
    const keepDefault = c.name ? used.has(c.name.text) : false;
    let keepNs = false;
    const keptNamed = [];
    const droppedNamed = [];
    if (c.namedBindings) {
      if (ts.isNamespaceImport(c.namedBindings)) keepNs = used.has(c.namedBindings.name.text);
      else for (const e of c.namedBindings.elements) (used.has(e.name.text) ? keptNamed : droppedNamed).push(e);
    }
    if (!keepDefault && !keepNs && keptNamed.length === 0) {
      // nothing survives: take the statement and its leading blank line with it
      edits.push({ start: st.getFullStart(), end: st.getEnd(), text: '' });
      decls++;
      specs += droppedNamed.length + (c.name ? 1 : 0);
      continue;
    }
    if (c.name && !keepDefault) throw new Error(`${file}: unused default import beside used named ones — hand edit`);
    for (const e of droppedNamed) {
      // swallow the following comma and space, or the preceding one for the last specifier
      let start = e.getFullStart();
      let end = e.getEnd();
      while (text[end] === ',' || text[end] === ' ' || text[end] === '\n') {
        if (text[end] === ',') { end++; break; }
        end++;
      }
      if (text[end - 1] !== ',') {
        while (start > 0 && (text[start - 1] === ' ' || text[start - 1] === '\n')) start--;
        if (text[start - 1] === ',') start--;
      }
      edits.push({ start, end });
      specs++;
    }
  }

  if (!edits.length) continue;
  edits.sort((a, b) => a.start - b.start);
  const out = [];
  let cursor = 0;
  for (const e of edits) {
    if (e.start < cursor) continue;
    out.push(text.slice(cursor, e.start), e.text ?? '');
    cursor = e.end;
  }
  out.push(text.slice(cursor));
  fs.writeFileSync(file, out.join('').replace(/\n{3,}/g, '\n\n'));
  console.log(`${file}: dropped ${specs} specifier(s), ${decls} whole import(s)`);
  totalSpecs += specs;
  totalDecls += decls;
}
console.log(`total: ${totalSpecs} specifiers, ${totalDecls} statements`);
