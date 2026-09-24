import { walkReactiveExpr } from "./reactive-module-graph";

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

export type ReactiveModuleFile = {
  /** Relative to the output directory, `net.py` for the main file. */
  path: string;
  text: string;
};

const SORT_CONSTANTS: Record<ReactiveSort, { name: string; ctor: string }> = {
  int: { name: "INT", ctor: "Int" },
  real: { name: "REAL", ctor: "Real" },
  bool: { name: "BOOL", ctor: "Bool" },
};

const SORT_ORDER: ReactiveSort[] = ["int", "real", "bool"];
const ROLE_ORDER: ReactiveVariable["role"][] = ["place", "input", "flag"];
const INDENT = "    ";
const LINE_WIDTH = 88;

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

const tupleLiteral = (names: string[]): string =>
  names.length === 1 ? `(${names[0]},)` : `(${names.join(", ")})`;

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

const classBody = (module: ReactiveModuleDecl): string[] => {
  const { theory } = module;
  const lines = [
    `class ${module.className}(Module):`,
    `${INDENT}"""${module.docstring}"""`,
    "",
    `${INDENT}def init(${["self", ...module.extl].join(", ")}):`,
    `${INDENT}${INDENT}return ${module.init.map((node) => expr(node, theory)).join(", ")}`,
    "",
    `${INDENT}def update(${["self", ...module.ctrl, ...module.extl].join(", ")}):`,
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
  const oneLine = `net = compose(${instances.join(", ")})`;
  return [
    ...instances.map(
      (instance) => `${instance} = ${construction(decl(instance))}`,
    ),
    ...(oneLine.length <= LINE_WIDTH
      ? [oneLine]
      : [
          "net = compose(",
          ...instances.map((instance) => `${INDENT}${instance},`),
          ")",
        ]),
  ];
};

export const emitReactiveModulePython = (
  graph: ReactiveModuleGraph,
): string => {
  const lines = [
    `"""${graph.header}"""`,
    "",
    ...imports(graph),
    "",
    ...declarations(graph.variables),
    ...graph.modules.flatMap((module) => ["", "", ...classBody(module)]),
    "",
    "",
    ...system(graph),
  ];
  return `${lines.join("\n")}\n`;
};

/** `Transition_FooBar` → `transition_foo_bar`: the Python module a class file imports as. */
export const moduleFileStem = (className: string): string =>
  className
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .toLowerCase();

const moduleFile = (
  graph: ReactiveModuleGraph,
  module: ReactiveModuleDecl,
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
    ...classBody(module),
  ];
  return {
    path: `${moduleFileStem(module.className)}.py`,
    text: `${lines.join("\n")}\n`,
  };
};

const mainFile = (graph: ReactiveModuleGraph): ReactiveModuleFile => {
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
        `from ${moduleFileStem(module.className)} import ${module.className}`,
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
): ReactiveModuleFile[] => {
  const files = [
    mainFile(graph),
    ...graph.modules.map((module) => moduleFile(graph, module)),
  ];
  const paths = new Set<string>();
  for (const file of files) {
    if (paths.has(file.path)) {
      throw new Error(`two modules would be written to ${file.path}`);
    }
    paths.add(file.path);
  }
  return files;
};
