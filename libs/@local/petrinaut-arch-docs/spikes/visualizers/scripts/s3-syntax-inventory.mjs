import { ts, exampleVisualizers } from "./common.mjs";

const HIR_OK_CALLS = new Set([
  "map",
  "reduce",
  "concat",
  "startsWith",
  "endsWith",
  "includes",
]);
const totals = {};
const perFile = [];
for (const { name, code } of exampleVisualizers()) {
  const sf = ts.createSourceFile(
    "v.tsx",
    code,
    ts.ScriptTarget.ES2020,
    true,
    ts.ScriptKind.TSX,
  );
  const kinds = {};
  const calls = {};
  const bump = (m, k) => {
    m[k] = (m[k] ?? 0) + 1;
  };
  const visit = (n) => {
    bump(kinds, ts.SyntaxKind[n.kind]);
    if (ts.isCallExpression(n)) {
      if (ts.isPropertyAccessExpression(n.expression)) {
        const obj = n.expression.expression;
        const objName = ts.isIdentifier(obj) ? obj.text : "";
        bump(
          calls,
          objName === "Math"
            ? `Math.${n.expression.name.text}`
            : `.${n.expression.name.text}`,
        );
      } else if (ts.isIdentifier(n.expression)) bump(calls, n.expression.text);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  perFile.push({
    name,
    lines: code.split("\n").length,
    parseErrors: sf.parseDiagnostics.length,
    kinds,
    calls,
  });
  for (const [k, v] of Object.entries(kinds)) bump(totals, k, v);
}
console.log("visualizers:", perFile.length);
for (const f of perFile) {
  const flags = [];
  const k = f.kinds;
  if (k.TemplateExpression) flags.push(`template:${k.TemplateExpression}`);
  if (k.FunctionDeclaration || k.FunctionExpression)
    flags.push(
      `fnDecl:${(k.FunctionDeclaration ?? 0) + (k.FunctionExpression ?? 0)}`,
    );
  if (k.ArrowFunction) flags.push(`arrows:${k.ArrowFunction}`);
  if (k.IfStatement) flags.push(`if:${k.IfStatement}`);
  if (k.ForStatement || k.ForOfStatement || k.WhileStatement)
    flags.push("loops");
  if (k.SpreadElement || k.SpreadAssignment || k.JsxSpreadAttribute)
    flags.push("spread");
  if (k.VariableDeclaration) flags.push(`vars:${k.VariableDeclaration}`);
  if (k.ObjectLiteralExpression)
    flags.push(`objLit:${k.ObjectLiteralExpression}`);
  if (k.ArrayLiteralExpression)
    flags.push(`arrLit:${k.ArrayLiteralExpression}`);
  if (k.JsxElement || k.JsxSelfClosingElement)
    flags.push(`jsx:${(k.JsxElement ?? 0) + (k.JsxSelfClosingElement ?? 0)}`);
  if (k.JsxExpression) flags.push(`jsxExpr:${k.JsxExpression}`);
  if (k.ConditionalExpression) flags.push(`ternary:${k.ConditionalExpression}`);
  if (k.AmpersandAmpersandToken) flags.push(`&&:${k.AmpersandAmpersandToken}`);
  if (k.NewExpression) flags.push("new");
  if (k.ClassDeclaration) flags.push("class");
  if (k.ImportDeclaration) flags.push("import");
  if (k.TryStatement) flags.push("try");
  if (k.AsExpression || k.TypeAssertionExpression || k.TypeReference)
    flags.push("typeAnnotations");
  const callList = Object.entries(f.calls)
    .sort((a, b) => b[1] - a[1])
    .map(([c, n]) => `${c}×${n}`)
    .join(" ");
  const outside = Object.keys(f.calls).filter(
    (c) =>
      !c.startsWith("Math.") &&
      !HIR_OK_CALLS.has(c.replace(/^\./, "")) &&
      c !== "Visualization",
  );
  console.log(
    `\n${f.name} (${f.lines} lines, parseErrors=${f.parseErrors})\n  ${flags.join(" ")}\n  calls: ${callList}\n  outside HIR subset: ${outside.join(" ") || "none"}`,
  );
}
