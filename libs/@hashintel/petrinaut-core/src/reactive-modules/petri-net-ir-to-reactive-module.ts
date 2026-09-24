import {
  type PetriNetIr,
  type PetriNetIrTransition,
  petriNetIrArcWeight,
  petriNetIrInitialTokens,
  petriNetIrPlaceCapacity,
} from "./petri-net-ir";

/**
 * Lowers a Petri net IR to a Zeroth reactive module and renders it as Python
 * over the `zrth.sugar` DSL: one module variable per place, one external
 * input per stochastic transition, the initial marking as `init`, and one
 * Petrinaut engine step as `update`.
 *
 * The step keeps the engine's semantics: transitions are swept in record
 * order, a firing consumes its input tokens at once, produced tokens land at
 * the end of the step, and a capped place tracks what it would hold if the
 * step ended now so a later producer sees an earlier one's tokens.
 *
 * A stochastic transition with rate λ is tested against an external uniform
 * draw `u`: it fires when `u >= e^(-λ·dt)`, the probability of at least one
 * arrival in a step of length dt.
 */

/** Names the generated module uses for itself; the IR must not claim them. */
export const RESERVED_MODULE_NAMES: readonly string[] = [
  "net",
  "ite",
  "X",
  "Module",
  "Var",
  "LIA",
  "LRA",
  "Int",
  "Real",
  "INT",
  "REAL",
  "self",
  "None",
  "True",
  "False",
];

export type PetriNetIrToReactiveModuleOptions = {
  /** Step length a stochastic rate is tested over. Defaults to 1. */
  dt?: number;
  /** Named in the module's docstring as where the net came from. */
  source?: string;
};

type Expr =
  | { kind: "ref"; name: string; next: boolean }
  | { kind: "num"; value: number }
  | {
      kind: "binary";
      op: "+" | "-" | ">=" | "<=" | "&";
      left: Expr;
      right: Expr;
    }
  | { kind: "ite"; condition: Expr; thenBranch: Expr; elseBranch: Expr };

type Statement =
  | { kind: "comment"; text: string }
  | { kind: "assign"; target: string; expr: Expr; comment?: string };

const ref = (name: string): Expr => ({ kind: "ref", name, next: false });
const next = (name: string): Expr => ({ kind: "ref", name, next: true });
const num = (value: number): Expr => ({ kind: "num", value });
const binary = (
  op: "+" | "-" | ">=" | "<=" | "&",
  left: Expr,
  right: Expr,
): Expr => ({ kind: "binary", op, left, right });

const SWEEP_COMMENT =
  "sweep in order; a firing consumes its input tokens at once";
const LAND_COMMENT = "end of step: produced tokens land";
const FILL_COMMENT = "tokens a capped place would hold if the step ended now";

const fireName = (transition: string): string => `fire_${transition}`;
const inputName = (transition: string): string => `u_${transition}`;
const fillName = (place: string): string => `fill_${place}`;

const pascal = (name: string): string =>
  name
    .split("_")
    .filter((part) => part !== "")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("") || "Net";

/** Tokens an arc side moves per place, summed over the side's arcs. */
const sideTotals = (
  arcs: PetriNetIrTransition["inputs"],
): Map<string, number> => {
  const totals = new Map<string, number>();
  for (const [place, arc] of Object.entries(arcs ?? {})) {
    totals.set(place, (totals.get(place) ?? 0) + petriNetIrArcWeight(arc));
  }
  return totals;
};

/** Net tokens a firing adds to each place it touches. */
const netDeltas = (transition: PetriNetIrTransition): Map<string, number> => {
  const deltas = new Map<string, number>();
  for (const [place, weight] of sideTotals(transition.outputs)) {
    deltas.set(place, (deltas.get(place) ?? 0) + weight);
  }
  for (const [place, weight] of sideTotals(transition.inputs)) {
    deltas.set(place, (deltas.get(place) ?? 0) - weight);
  }
  return deltas;
};

const describe = (name: string, transition: PetriNetIrTransition): string => {
  const side = (arcs: PetriNetIrTransition["inputs"]): string =>
    Object.entries(arcs ?? {})
      .map(([place, arc]) => {
        const weight = petriNetIrArcWeight(arc);
        return weight === 1 ? place : `${weight} ${place}`;
      })
      .join(", ") || "nothing";
  return `${name}: ${side(transition.inputs)} -> ${side(transition.outputs)}`;
};

/** `current` changed by `weight` when `fire` holds; unconditionally without a guard. */
const apply = (
  fire: string | null,
  current: Expr,
  op: "+" | "-",
  weight: number,
): Expr => {
  const changed = binary(op, current, num(weight));
  return fire === null
    ? changed
    : {
        kind: "ite",
        condition: ref(fire),
        thenBranch: changed,
        elseBranch: current,
      };
};

const conjunction = (terms: Expr[]): Expr | null =>
  terms.reduce<Expr | null>(
    (guard, term) => (guard === null ? term : binary("&", guard, term)),
    null,
  );

type LoweredModule = {
  className: string;
  stochastic: boolean;
  dt: number;
  variables: { name: string; initial: number }[];
  inputs: { name: string; transition: string }[];
  update: Statement[];
  returns: string[];
  transitionCount: number;
};

const lower = (ir: PetriNetIr, dt: number): LoweredModule => {
  const stochastic = ir.kind === "stochastic";
  const places = Object.entries(ir.places);
  const transitions = Object.entries(ir.transitions);
  const capacities = new Map(
    places.map(([name, place]) => [name, petriNetIrPlaceCapacity(place)]),
  );
  const deltas = new Map(
    transitions.map(([name, transition]) => [name, netDeltas(transition)]),
  );
  // A capped place only needs the tracker when something produces into it.
  const capped = places
    .map(([name]) => name)
    .filter(
      (name) =>
        capacities.get(name) !== undefined &&
        transitions.some(
          ([transition]) => (deltas.get(transition)?.get(name) ?? 0) > 0,
        ),
    );

  const update: Statement[] = [];
  if (capped.length > 0) {
    update.push({ kind: "comment", text: FILL_COMMENT });
    for (const place of capped) {
      update.push({
        kind: "assign",
        target: fillName(place),
        expr: ref(place),
      });
    }
  }
  update.push({ kind: "comment", text: SWEEP_COMMENT });

  const produced = new Map<string, { fire: string | null; weight: number }[]>(
    places.map(([name]) => [name, []]),
  );
  for (const [name, transition] of transitions) {
    const transitionDeltas = deltas.get(name) ?? new Map<string, number>();
    const terms: Expr[] = [];
    for (const [place, arc] of Object.entries(transition.inputs ?? {})) {
      terms.push(binary(">=", ref(place), num(petriNetIrArcWeight(arc))));
    }
    for (const place of capped) {
      const delta = transitionDeltas.get(place) ?? 0;
      if (delta > 0) {
        terms.push(
          binary(
            "<=",
            binary("+", ref(fillName(place)), num(delta)),
            num(capacities.get(place) ?? 0),
          ),
        );
      }
    }
    if (stochastic) {
      terms.push(
        binary(
          ">=",
          next(inputName(name)),
          num(Math.exp(-(transition.rate ?? 0) * dt)),
        ),
      );
    }
    const guard = conjunction(terms);
    const fire = guard === null ? null : fireName(name);
    if (guard === null) {
      update.push({
        kind: "comment",
        text: `${describe(name, transition)}: always enabled`,
      });
    } else {
      update.push({
        kind: "assign",
        target: fireName(name),
        expr: guard,
        comment: describe(name, transition),
      });
    }
    for (const [place, weight] of sideTotals(transition.inputs)) {
      update.push({
        kind: "assign",
        target: place,
        expr: apply(fire, ref(place), "-", weight),
      });
    }
    for (const place of capped) {
      const delta = transitionDeltas.get(place) ?? 0;
      if (delta !== 0) {
        const fill = fillName(place);
        update.push({
          kind: "assign",
          target: fill,
          expr: apply(fire, ref(fill), delta > 0 ? "+" : "-", Math.abs(delta)),
        });
      }
    }
    for (const [place, weight] of sideTotals(transition.outputs)) {
      produced.get(place)?.push({ fire, weight });
    }
  }

  update.push({ kind: "comment", text: LAND_COMMENT });
  const returns: string[] = [];
  for (const [name] of places) {
    if (capped.includes(name)) {
      returns.push(fillName(name));
      continue;
    }
    for (const { fire, weight } of produced.get(name) ?? []) {
      update.push({
        kind: "assign",
        target: name,
        expr: apply(fire, ref(name), "+", weight),
      });
    }
    returns.push(name);
  }

  return {
    className: pascal(ir.name),
    stochastic,
    dt,
    variables: places.map(([name]) => ({
      name,
      initial: petriNetIrInitialTokens(ir, name),
    })),
    inputs: stochastic
      ? transitions.map(([name]) => ({
          name: inputName(name),
          transition: name,
        }))
      : [],
    update,
    returns,
    transitionCount: transitions.length,
  };
};

/** A Python literal: integers become floats in the LRA module, where every sort is Real. */
const literal = (value: number, asFloat: boolean): string =>
  Number.isInteger(value) ? (asFloat ? `${value}.0` : `${value}`) : `${value}`;

const COMPARISONS = new Set(["<=", ">="]);

/** An operand of `&`: a comparison needs parentheses under Python's precedence. */
const conjunct = (node: Expr, text: string): string =>
  node.kind === "binary" && COMPARISONS.has(node.op) ? `(${text})` : text;

const expr = (node: Expr, asFloat: boolean): string => {
  switch (node.kind) {
    case "ref":
      return node.next ? `X(${node.name})` : node.name;
    case "num":
      return literal(node.value, asFloat);
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

const plural = (count: number, noun: string): string =>
  `${count} ${noun}${count === 1 ? "" : "s"}`;

/** Lowers the IR and renders the module as Python. */
export const petriNetIrToReactiveModule = (
  ir: PetriNetIr,
  options: PetriNetIrToReactiveModuleOptions = {},
): string => {
  const module = lower(ir, options.dt ?? 1);
  const { stochastic } = module;
  const sort = stochastic ? "REAL" : "INT";
  const inputNames = module.inputs.map((input) => input.name);
  const variableNames = module.variables.map((variable) => variable.name);
  const origin = options.source === undefined ? "" : ` from ${options.source}`;
  const docstring = `${stochastic ? "Stochastic" : "Plain"} Petri net with ${plural(module.variables.length, "place")} and ${plural(module.transitionCount, "transition")}${stochastic ? `, dt = ${literal(module.dt, true)}` : ""}. One update is one Petrinaut step.`;

  const lines: string[] = [
    `"""${ir.name}: generated by Petrinaut${origin}. Do not edit."""`,
    "",
    ...(stochastic
      ? [
          "from zrth import LRA, Real, Var",
          "from zrth.sugar import Module, X, ite",
          "",
          "REAL = Real([1, 1])",
        ]
      : [
          "from zrth import LIA, Int, Var",
          "from zrth.sugar import Module, ite",
          "",
          "INT = Int([1, 1])",
        ]),
    "",
    ...variableNames.map((name) => `${name} = Var(${sort})`),
  ];
  if (module.inputs.length > 0) {
    lines.push("");
    for (const input of module.inputs) {
      lines.push(
        `${input.name} = Var(REAL)  # uniform draw for ${input.transition}, each step`,
      );
    }
  }
  lines.push(
    "",
    "",
    `class ${module.className}(Module):`,
    `    """${docstring}"""`,
    "",
    `    def init(${["self", ...inputNames].join(", ")}):`,
    `        return ${module.variables.map((variable) => literal(variable.initial, stochastic)).join(", ")}`,
    "",
    `    def update(${["self", ...variableNames, ...inputNames].join(", ")}):`,
  );
  for (const statement of module.update) {
    if (statement.kind === "comment") {
      lines.push(`        # ${statement.text}`);
    } else {
      const trailer =
        statement.comment === undefined ? "" : `  # ${statement.comment}`;
      lines.push(
        `        ${statement.target} = ${expr(statement.expr, stochastic)}${trailer}`,
      );
    }
  }
  const extl =
    inputNames.length > 0 ? `, extl=${tupleLiteral(inputNames)}` : "";
  lines.push(
    `        return ${module.returns.join(", ")}`,
    "",
    "",
    `net = ${module.className}(theory=${stochastic ? "LRA" : "LIA"}, ctrl=${tupleLiteral(variableNames)}${extl})`,
  );
  return `${lines.join("\n")}\n`;
};
