import { walkReactiveExpr } from "./reactive-module-graph";
import {
  composeLines,
  INDENT,
  moduleFileStem,
  moduleFileStems,
  type ReactiveModuleFile,
  tupleLiteral,
} from "./shared/python-layout";

import type {
  ReactiveExpr,
  ReactiveModuleDecl,
  ReactiveModuleGraph,
  ReactiveSort,
  ReactiveTheory,
  ReactiveVariable,
} from "./reactive-module-graph";

/**
 * Renders a reactive module graph as Python over the `zrth.sugar` DSL: one
 * `Var` per variable, one `Module` subclass per module with its `init` and
 * `update`, and `net` bound to the system. Either as one file, or as one
 * file per module plus `net.py`, which declares the variables, imports the
 * modules and composes them.
 */

export type ReactiveModuleLayout = "single" | "per-module";

/** The step method's name: `update`, or `next` as the tangent-era sugar calls it. */
export type ReactiveModuleSyntax = "update" | "next";

export type EmitReactiveModuleOptions = {
  syntax?: ReactiveModuleSyntax;
};

const SORT_CONSTANTS: Record<ReactiveSort, { name: string; ctor: string }> = {
  int: { name: "INT", ctor: "Int" },
  real: { name: "REAL", ctor: "Real" },
  bool: { name: "BOOL", ctor: "Bool" },
};

const SORT_ORDER: ReactiveSort[] = ["int", "real", "bool"];
const ROLE_ORDER: ReactiveVariable["role"][] = ["place", "input", "flag"];

/** A Python literal: integers become floats where every sort is Real. */
const literal = (value: number, asFloat: boolean): string =>
  Number.isInteger(value) ? (asFloat ? `${value}.0` : `${value}`) : `${value}`;

const COMPARISONS = new Set(["<", "<=", ">", ">=", "==", "!="]);
const LOGICAL = new Set(["&", "|"]);

/**
 * An operand of `&` or `|`: a comparison or the other logical operator
 * needs parentheses under Python's precedence, where `&` and `|` bind
 * tighter than comparisons.
 */
const logicalOperand = (
  node: ReactiveExpr,
  text: string,
  parent: "&" | "|",
): string =>
  node.kind === "binary" &&
  (COMPARISONS.has(node.op) || (LOGICAL.has(node.op) && node.op !== parent))
    ? `(${text})`
    : text;

/** An operand of `~` or of a scale: anything but a name, a literal or a call. */
const tightOperand = (node: ReactiveExpr, text: string): string =>
  node.kind === "binary" ? `(${text})` : text;

const isLiteral = (node: ReactiveExpr): boolean =>
  node.kind === "num" || node.kind === "bool";

const expr = (node: ReactiveExpr, theory: ReactiveTheory): string => {
  const asFloat = theory === "LRA";
  switch (node.kind) {
    case "ref":
      return node.next ? `X(${node.name})` : node.name;
    case "num":
      return literal(node.value, asFloat);
    case "bool":
      return node.value ? "True" : "False";
    case "binary": {
      const left = expr(node.left, theory);
      const right = expr(node.right, theory);
      return node.op === "&" || node.op === "|"
        ? `${logicalOperand(node.left, left, node.op)} ${node.op} ${logicalOperand(node.right, right, node.op)}`
        : `${left} ${node.op} ${right}`;
    }
    case "ite": {
      // The sugar needs one branch to carry the theory and sort when both are literals.
      const thenText = expr(node.thenBranch, theory);
      const thenBranch =
        isLiteral(node.thenBranch) && isLiteral(node.elseBranch)
          ? `expr(${thenText}, theory=${theory}, sort=${node.thenBranch.kind === "bool" ? "BOOL" : asFloat ? "REAL" : "INT"})`
          : thenText;
      return `ite(${expr(node.condition, theory)}, ${thenBranch}, ${expr(node.elseBranch, theory)})`;
    }
    case "not":
      return `~${tightOperand(node.operand, expr(node.operand, theory))}`;
    case "scale":
      return `${literal(node.factor, asFloat)} * ${tightOperand(node.operand, expr(node.operand, theory))}`;
    case "relu":
      return `relu(${expr(node.operand, theory)})`;
  }
};

/** Whether some node of the expression satisfies `test`. */
const some = (
  node: ReactiveExpr,
  test: (candidate: ReactiveExpr) => boolean,
): boolean => {
  let found = false;
  walkReactiveExpr(node, (candidate) => {
    found ||= test(candidate);
  });
  return found;
};

const usesNext = (node: ReactiveExpr): boolean =>
  some(node, (candidate) => candidate.kind === "ref" && candidate.next);

const usesIte = (node: ReactiveExpr): boolean =>
  some(node, (candidate) => candidate.kind === "ite");

const usesRelu = (node: ReactiveExpr): boolean =>
  some(node, (candidate) => candidate.kind === "relu");

const usesLiteralIte = (node: ReactiveExpr): boolean =>
  some(
    node,
    (candidate) =>
      candidate.kind === "ite" &&
      isLiteral(candidate.thenBranch) &&
      isLiteral(candidate.elseBranch),
  );

const moduleExprs = (module: ReactiveModuleDecl): ReactiveExpr[] => [
  ...module.init,
  ...module.update.flatMap((statement) =>
    statement.kind === "assign" ? [statement.expr] : [],
  ),
  ...module.returns,
];

const sugarImport = (exprs: ReactiveExpr[]): string =>
  `from zrth.sugar import ${[
    "Module",
    ...(exprs.some(usesNext) ? ["X"] : []),
    ...(exprs.some(usesIte) ? ["ite"] : []),
  ].join(", ")}`;

const sortConstant = (sort: ReactiveSort): string =>
  `${SORT_CONSTANTS[sort].name} = ${SORT_CONSTANTS[sort].ctor}([1, 1])`;

const theoriesOf = (modules: ReactiveModuleDecl[]): ReactiveTheory[] =>
  [...new Set(modules.map((module) => module.theory))].toSorted();

const sortsOf = (variables: ReactiveVariable[]): ReactiveSort[] =>
  SORT_ORDER.filter((sort) =>
    variables.some((variable) => variable.sort === sort),
  );

const constructorNames = (sorts: ReactiveSort[]): string[] =>
  sorts.map((sort) => SORT_CONSTANTS[sort].ctor).toSorted();

const imports = (graph: ReactiveModuleGraph): string[] => {
  const sorts = sortsOf(graph.variables);
  const exprs = graph.modules.flatMap(moduleExprs);
  return [
    `from zrth import ${[...theoriesOf(graph.modules), ...constructorNames(sorts), "Var", ...(exprs.some(usesLiteralIte) ? ["expr"] : [])].join(", ")}`,
    ...(graph.root.kind === "compose"
      ? ["from zrth import Module as compose"]
      : []),
    ...(exprs.some(usesRelu) ? ["from zrth.expr import relu"] : []),
    sugarImport(exprs),
    "",
    ...sorts.map(sortConstant),
  ];
};

/** The sort constants a module's literal-only branches name: `expr(1.0, theory=LRA, sort=REAL)`. */
const literalIteSorts = (
  exprs: ReactiveExpr[],
  theory: ReactiveTheory,
): ReactiveSort[] => {
  const sorts = new Set<ReactiveSort>();
  for (const node of exprs) {
    walkReactiveExpr(node, (candidate) => {
      if (
        candidate.kind === "ite" &&
        isLiteral(candidate.thenBranch) &&
        isLiteral(candidate.elseBranch)
      ) {
        sorts.add(
          candidate.thenBranch.kind === "bool"
            ? "bool"
            : theory === "LRA"
              ? "real"
              : "int",
        );
      }
    });
  }
  return SORT_ORDER.filter((sort) => sorts.has(sort));
};

const declarations = (variables: ReactiveVariable[]): string[] => {
  const groups = ROLE_ORDER.map((role) =>
    variables
      .filter((variable) => variable.role === role)
      .map(
        (variable) =>
          `${variable.name} = Var(${SORT_CONSTANTS[variable.sort].name})${variable.comment === undefined ? "" : `  # ${variable.comment}`}`,
      ),
  ).filter((group) => group.length > 0);
  return groups.flatMap((group, index) =>
    index === 0 ? group : ["", ...group],
  );
};

const classBody = (
  module: ReactiveModuleDecl,
  syntax: ReactiveModuleSyntax,
): string[] => {
  const { theory } = module;
  const lines = [
    `class ${module.className}(Module):`,
    `${INDENT}"""${module.docstring}"""`,
    "",
    `${INDENT}def init(${["self", ...module.extl].join(", ")}):`,
    `${INDENT}${INDENT}return ${module.init.map((node) => expr(node, theory)).join(", ")}`,
    "",
    `${INDENT}def ${syntax}(${["self", ...module.ctrl, ...module.extl].join(", ")}):`,
  ];
  for (const statement of module.update) {
    if (statement.kind === "comment") {
      lines.push(`${INDENT}${INDENT}# ${statement.text}`);
    } else {
      const trailer =
        statement.comment === undefined ? "" : `  # ${statement.comment}`;
      lines.push(
        `${INDENT}${INDENT}${statement.target} = ${expr(statement.expr, theory)}${trailer}`,
      );
    }
  }
  lines.push(
    `${INDENT}${INDENT}return ${module.returns.map((node) => expr(node, theory)).join(", ")}`,
  );
  return lines;
};

const construction = (module: ReactiveModuleDecl): string => {
  const extl =
    module.extl.length > 0 ? `, extl=${tupleLiteral(module.extl)}` : "";
  return `${module.className}(theory=${module.theory}, ctrl=${tupleLiteral(module.ctrl)}${extl})`;
};

const system = (graph: ReactiveModuleGraph): string[] => {
  const byInstance = new Map(
    graph.modules.map((module) => [module.instance, module]),
  );
  const decl = (instance: string): ReactiveModuleDecl => {
    const module = byInstance.get(instance);
    if (module === undefined) {
      throw new Error(
        `the root names module ${instance}, which does not exist`,
      );
    }
    return module;
  };
  if (graph.root.kind === "single") {
    return [`net = ${construction(decl(graph.root.module))}`];
  }
  const instances = graph.root.modules;
  return [
    ...instances.map(
      (instance) => `${instance} = ${construction(decl(instance))}`,
    ),
    ...composeLines(instances),
  ];
};

export const emitReactiveModulePython = (
  graph: ReactiveModuleGraph,
  { syntax = "update" }: EmitReactiveModuleOptions = {},
): string => {
  const lines = [
    `"""${graph.header}"""`,
    "",
    ...imports(graph),
    "",
    ...declarations(graph.variables),
    ...graph.modules.flatMap((module) => [
      "",
      "",
      ...classBody(module, syntax),
    ]),
    "",
    "",
    ...system(graph),
  ];
  return `${lines.join("\n")}\n`;
};

const moduleFile = (
  graph: ReactiveModuleGraph,
  module: ReactiveModuleDecl,
  stem: string,
  syntax: ReactiveModuleSyntax,
): ReactiveModuleFile => {
  const exprs = moduleExprs(module);
  // A literal-only branch names the module's theory and a sort, which the
  // file declares for itself: zrth sorts compare by shape, not identity.
  const literalSorts = literalIteSorts(exprs, module.theory);
  const zrthNames =
    literalSorts.length > 0
      ? [module.theory, ...constructorNames(literalSorts), "expr"]
      : [];
  const lines = [
    `"""${graph.header}"""`,
    "",
    ...(zrthNames.length > 0
      ? [`from zrth import ${zrthNames.join(", ")}`]
      : []),
    ...(exprs.some(usesRelu) ? ["from zrth.expr import relu"] : []),
    sugarImport(exprs),
    ...(literalSorts.length > 0 ? ["", ...literalSorts.map(sortConstant)] : []),
    "",
    "",
    ...classBody(module, syntax),
  ];
  return { path: `${stem}.py`, text: `${lines.join("\n")}\n` };
};

const mainFile = (
  graph: ReactiveModuleGraph,
  stems: ReadonlyMap<string, string>,
): ReactiveModuleFile => {
  const sorts = sortsOf(graph.variables);
  const lines = [
    `"""${graph.header}"""`,
    "",
    `from zrth import ${[...theoriesOf(graph.modules), ...constructorNames(sorts), "Var"].join(", ")}`,
    ...(graph.root.kind === "compose"
      ? ["from zrth import Module as compose"]
      : []),
    "",
    ...graph.modules.map(
      (module) =>
        `from ${stems.get(module.className) ?? moduleFileStem(module.className)} import ${module.className}`,
    ),
    "",
    ...sorts.map(sortConstant),
    "",
    ...declarations(graph.variables),
    "",
    "",
    ...system(graph),
  ];
  return { path: "net.py", text: `${lines.join("\n")}\n` };
};

/**
 * The graph as one file per module plus `net.py`, which comes first. Run from
 * the directory the files are written to, `net.py` imports each module by
 * its file name.
 */
export const emitReactiveModuleFiles = (
  graph: ReactiveModuleGraph,
  { syntax = "update" }: EmitReactiveModuleOptions = {},
): ReactiveModuleFile[] => {
  const stems = moduleFileStems(
    graph.modules.map((module) => module.className),
  );
  return [
    mainFile(graph, stems),
    ...graph.modules.map((module) =>
      moduleFile(
        graph,
        module,
        stems.get(module.className) ?? moduleFileStem(module.className),
        syntax,
      ),
    ),
  ];
};
