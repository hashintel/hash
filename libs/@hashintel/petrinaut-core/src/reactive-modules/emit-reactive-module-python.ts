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
 * `update`, and `net` bound to the system.
 */

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

const COMPARISONS = new Set(["<=", ">="]);

/** An operand of `&`: a comparison needs parentheses under Python's precedence. */
const conjunct = (node: ReactiveExpr, text: string): string =>
  node.kind === "binary" && COMPARISONS.has(node.op) ? `(${text})` : text;

const expr = (node: ReactiveExpr, asFloat: boolean): string => {
  switch (node.kind) {
    case "ref":
      return node.next ? `X(${node.name})` : node.name;
    case "num":
      return literal(node.value, asFloat);
    case "bool":
      return node.value ? "True" : "False";
    case "binary": {
      const left = expr(node.left, asFloat);
      const right = expr(node.right, asFloat);
      return node.op === "&"
        ? `${conjunct(node.left, left)} & ${conjunct(node.right, right)}`
        : `${left} ${node.op} ${right}`;
    }
    case "ite":
      return `ite(${expr(node.condition, asFloat)}, ${expr(node.thenBranch, asFloat)}, ${expr(node.elseBranch, asFloat)})`;
  }
};

const tupleLiteral = (names: string[]): string =>
  names.length === 1 ? `(${names[0]},)` : `(${names.join(", ")})`;

const usesNext = (node: ReactiveExpr): boolean => {
  switch (node.kind) {
    case "ref":
      return node.next;
    case "num":
    case "bool":
      return false;
    case "binary":
      return usesNext(node.left) || usesNext(node.right);
    case "ite":
      return (
        usesNext(node.condition) ||
        usesNext(node.thenBranch) ||
        usesNext(node.elseBranch)
      );
  }
};

const usesIte = (node: ReactiveExpr): boolean => {
  switch (node.kind) {
    case "ref":
    case "num":
    case "bool":
      return false;
    case "binary":
      return usesIte(node.left) || usesIte(node.right);
    case "ite":
      return true;
  }
};

const moduleExprs = (module: ReactiveModuleDecl): ReactiveExpr[] => [
  ...module.init,
  ...module.update.flatMap((statement) =>
    statement.kind === "assign" ? [statement.expr] : [],
  ),
  ...module.returns,
];

const imports = (graph: ReactiveModuleGraph): string[] => {
  const theories = [
    ...new Set(graph.modules.map((module) => module.theory)),
  ].toSorted() as ReactiveTheory[];
  const sorts = SORT_ORDER.filter((sort) =>
    graph.variables.some((variable) => variable.sort === sort),
  );
  const sortNames = sorts.map((sort) => SORT_CONSTANTS[sort].ctor).toSorted();
  const exprs = graph.modules.flatMap(moduleExprs);
  const sugar = [
    "Module",
    ...(exprs.some(usesNext) ? ["X"] : []),
    ...(exprs.some(usesIte) ? ["ite"] : []),
  ];
  return [
    `from zrth import ${[...theories, ...sortNames, "Var"].join(", ")}`,
    ...(graph.root.kind === "compose"
      ? ["from zrth import Module as compose"]
      : []),
    `from zrth.sugar import ${sugar.join(", ")}`,
    "",
    ...sorts.map(
      (sort) =>
        `${SORT_CONSTANTS[sort].name} = ${SORT_CONSTANTS[sort].ctor}([1, 1])`,
    ),
  ];
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
  const asFloat = module.theory === "LRA";
  const lines = [
    `class ${module.className}(Module):`,
    `${INDENT}"""${module.docstring}"""`,
    "",
    `${INDENT}def init(${["self", ...module.extl].join(", ")}):`,
    `${INDENT}${INDENT}return ${module.init.map((node) => expr(node, asFloat)).join(", ")}`,
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
        `${INDENT}${INDENT}${statement.target} = ${expr(statement.expr, asFloat)}${trailer}`,
      );
    }
  }
  lines.push(
    `${INDENT}${INDENT}return ${module.returns.map((node) => expr(node, asFloat)).join(", ")}`,
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
