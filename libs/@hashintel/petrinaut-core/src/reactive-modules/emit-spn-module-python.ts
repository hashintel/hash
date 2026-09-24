import {
  composeLines,
  INDENT,
  moduleFileStem,
  moduleFileStems,
  type ReactiveModuleFile,
  tupleLiteral,
} from "./shared/python-layout";
import { walkSpnExpr } from "./spn-module-graph";

import type {
  SpnExpr,
  SpnModuleDecl,
  SpnModuleGraph,
  SpnSort,
  SpnVariable,
} from "./spn-module-graph";

/**
 * Renders an SPN module graph as Python over the `zrth.sugar` DSL, in the
 * form of Zeroth's own `birth_death.py`: one `Var` per variable with its
 * SPN sort, one `Module` subclass per module with `init`, `next` and, on a
 * module that has one, `flow`, and `net` composed with the clocks hidden.
 * Either as one file, or as one file per module plus `net.py`.
 */

const SPN_SORTS: Record<SpnSort, string> = {
  nat: "Nat",
  clock: "Clock",
  event: "Event",
};

const ROLE_ORDER: SpnVariable["role"][] = ["time", "place", "clock", "event"];

/** A Python float literal: an integer rate is written with `.0`. */
const floatLiteral = (value: number): string =>
  Number.isInteger(value) ? `${value}.0` : `${value}`;

/** An operand of `&` or `|`: a comparison or the other operator needs parentheses. */
const logicalOperand = (
  node: SpnExpr,
  text: string,
  parent: "&" | "|",
): string =>
  node.kind === "test" ||
  node.kind === "nonNegative" ||
  (node.kind === "logic" && node.op !== parent)
    ? `(${text})`
    : text;

/** An operand of `~`, of a test or of a step: anything but a name, a literal or a call. */
const tightOperand = (node: SpnExpr, text: string): string =>
  node.kind === "logic" ||
  node.kind === "test" ||
  node.kind === "step" ||
  node.kind === "nonNegative" ||
  node.kind === "rate"
    ? `(${text})`
    : text;

const expr = (node: SpnExpr): string => {
  switch (node.kind) {
    case "ref":
      return node.name;
    case "nat":
      return `${node.value}`;
    case "bool":
      return node.value ? "True" : "False";
    case "test":
      return `${tightOperand(node.operand, expr(node.operand))} ${node.zero ? "==" : "!="} 0`;
    case "logic":
      return `${logicalOperand(node.left, expr(node.left), node.op)} ${node.op} ${logicalOperand(node.right, expr(node.right), node.op)}`;
    case "not":
      return `~${tightOperand(node.operand, expr(node.operand))}`;
    case "step":
      return `${tightOperand(node.operand, expr(node.operand))} ${node.op} 1`;
    case "ite":
      return `ite(${expr(node.condition)}, ${expr(node.thenBranch)}, ${expr(node.elseBranch)})`;
    case "ifThen":
      return `if_then(${expr(node.condition)}, ${expr(node.branch)})`;
    case "fired":
      return `fired(${node.event})`;
    case "exp":
      return `exp(${floatLiteral(node.rate)})`;
    case "nonNegative":
      return `${node.clock} >= 0`;
    case "rate":
      return `${node.factor} * d(${node.time})`;
  }
};

const moduleExprs = (module: SpnModuleDecl): SpnExpr[] => [
  ...module.init,
  ...module.next.map((statement) => statement.expr),
  ...module.returns,
  ...(module.flow ?? []).filter((node): node is SpnExpr => node !== null),
];

const uses = (exprs: SpnExpr[], kind: SpnExpr["kind"]): boolean =>
  exprs.some((node) => {
    let found = false;
    walkSpnExpr(node, (candidate) => {
      found ||= candidate.kind === kind;
    });
    return found;
  });

/** The sugar names the bodies use, in the order the reference file lists them. */
const sugarImport = (exprs: SpnExpr[]): string => {
  const names: [name: string, kind: SpnExpr["kind"]][] = [
    ["d", "rate"],
    ["ite", "ite"],
    ["if_then", "ifThen"],
    ["fired", "fired"],
    ["exp", "exp"],
  ];
  return `from zrth.sugar import ${[
    "Module",
    ...names.filter(([, kind]) => uses(exprs, kind)).map(([name]) => name),
  ].join(", ")}`;
};

/** `from zrth import SPN, Clock, Event, Nat, Var`, the sorts the variables take. */
const zrthImport = (variables: SpnVariable[]): string => {
  const sorts = new Set(variables.map((variable) => variable.sort));
  const constructors = [...sorts].map((sort) => SPN_SORTS[sort]).toSorted();
  return `from zrth import ${["SPN", ...constructors, "Var"].join(", ")}`;
};

const declarations = (variables: SpnVariable[]): string[] => {
  const groups = ROLE_ORDER.map((role) =>
    variables
      .filter((variable) => variable.role === role)
      .map(
        (variable) =>
          `${variable.name} = Var(${SPN_SORTS[variable.sort]}())${variable.comment === undefined ? "" : `  # ${variable.comment}`}`,
      ),
  ).filter((group) => group.length > 0);
  return groups.flatMap((group, index) =>
    index === 0 ? group : ["", ...group],
  );
};

const classBody = (module: SpnModuleDecl): string[] => {
  const parameters = ["self", ...module.ctrl, ...module.extl].join(", ");
  const lines = [
    `class ${module.className}(Module):`,
    `${INDENT}"""${module.docstring}"""`,
    "",
    `${INDENT}def init(${["self", ...module.extl].join(", ")}):`,
    `${INDENT}${INDENT}return ${module.init.map(expr).join(", ")}`,
    "",
    `${INDENT}def next(${parameters}):`,
  ];
  for (const statement of module.next) {
    const trailer =
      statement.comment === undefined ? "" : `  # ${statement.comment}`;
    lines.push(
      `${INDENT}${INDENT}${statement.target} = ${expr(statement.expr)}${trailer}`,
    );
  }
  lines.push(`${INDENT}${INDENT}return ${module.returns.map(expr).join(", ")}`);
  if (module.flow !== undefined) {
    lines.push(
      "",
      `${INDENT}def flow(${parameters}):`,
      `${INDENT}${INDENT}return ${module.flow.map((node) => (node === null ? "None" : expr(node))).join(", ")}`,
    );
  }
  return lines;
};

const construction = (module: SpnModuleDecl): string => {
  const extl =
    module.extl.length > 0 ? `, extl=${tupleLiteral(module.extl)}` : "";
  return `${module.className}(theory=SPN, ctrl=${tupleLiteral(module.ctrl)}${extl})`;
};

const system = (graph: SpnModuleGraph): string[] => [
  ...graph.modules.map(
    (module) => `${module.instance} = ${construction(module)}`,
  ),
  ...composeLines(
    graph.modules.map((module) => module.instance),
    graph.hidden,
  ),
];

export const emitSpnModulePython = (graph: SpnModuleGraph): string => {
  const lines = [
    `"""${graph.header}"""`,
    "",
    zrthImport(graph.variables),
    "from zrth import Module as compose",
    sugarImport(graph.modules.flatMap(moduleExprs)),
    "",
    ...declarations(graph.variables),
    ...graph.modules.flatMap((module) => ["", "", ...classBody(module)]),
    "",
    "",
    ...system(graph),
  ];
  return `${lines.join("\n")}\n`;
};

const moduleFile = (
  graph: SpnModuleGraph,
  module: SpnModuleDecl,
  stem: string,
): ReactiveModuleFile => {
  const lines = [
    `"""${graph.header}"""`,
    "",
    sugarImport(moduleExprs(module)),
    "",
    "",
    ...classBody(module),
  ];
  return { path: `${stem}.py`, text: `${lines.join("\n")}\n` };
};

const mainFile = (
  graph: SpnModuleGraph,
  stems: ReadonlyMap<string, string>,
): ReactiveModuleFile => {
  const lines = [
    `"""${graph.header}"""`,
    "",
    zrthImport(graph.variables),
    "from zrth import Module as compose",
    "",
    ...graph.modules.map(
      (module) =>
        `from ${stems.get(module.className) ?? moduleFileStem(module.className)} import ${module.className}`,
    ),
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
export const emitSpnModuleFiles = (
  graph: SpnModuleGraph,
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
      ),
    ),
  ];
};
