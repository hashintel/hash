import { isPickName } from "./lower-petri-net-ir";
import {
  moduleAwaits,
  type ReactiveExpr,
  type ReactiveModuleDecl,
  type ReactiveModuleGraph,
} from "./reactive-module-graph";

import type { LoweredGraph } from "./lower-petri-net-ir";

/**
 * Runs a reactive module graph the way Zeroth's evaluator runs a composed
 * module: every round, each module's `update` is evaluated once, in an
 * order where a module comes after the drivers of the variables it awaits,
 * and the next values are latched together at the end of the round. The
 * inputs are read from the harness each round; a pick the harness leaves
 * undriven is true, the deterministic sweep.
 *
 * Used to check that two shapes of the same net produce the same trace;
 * a host could also run a graph with it where no `zrth` is available. An
 * SPN graph runs clocks in continuous time, which the rounds do not model,
 * so it is refused.
 */

const linearGraph = (graph: LoweredGraph): ReactiveModuleGraph => {
  if (graph.language === "spn") {
    throw new Error(
      "an SPN graph runs clocks in continuous time, which the interpreter does not model; lower with rates: coin to interpret it",
    );
  }
  return graph;
};

export type ReactiveValue = number | boolean;

export type InterpretReactiveModuleGraphOptions = {
  steps: number;
  /**
   * The value of an input for a round; rounds count from 1. `undefined`
   * lets a pick fall to `true`; every other input needs a value.
   */
  inputs: (step: number, name: string) => ReactiveValue | undefined;
};

/** The variables' values after `init`, then after each round. */
export type ReactiveTrace = Record<string, ReactiveValue>[];

const driversOf = (
  graph: ReactiveModuleGraph,
): Map<string, ReactiveModuleDecl> => {
  const drivers = new Map<string, ReactiveModuleDecl>();
  for (const module of graph.modules) {
    for (const name of module.ctrl) {
      const other = drivers.get(name);
      if (other !== undefined) {
        throw new Error(
          `${name} is driven by both ${other.className} and ${module.className}`,
        );
      }
      drivers.set(name, module);
    }
  }
  for (const variable of graph.variables) {
    const driver = drivers.get(variable.name);
    if (variable.role === "input" && driver !== undefined) {
      throw new Error(
        `input ${variable.name} is driven by ${driver.className}`,
      );
    }
    if (variable.role !== "input" && driver === undefined) {
      throw new Error(`${variable.name} has no driver`);
    }
  }
  return drivers;
};

/**
 * The modules in an order every await can be met in: a module after the
 * drivers of the variables it awaits. Throws when the awaits form a cycle,
 * which composition would reject too.
 */
export const orderReactiveModules = (
  lowered: LoweredGraph,
): ReactiveModuleDecl[] => {
  const graph = linearGraph(lowered);
  const drivers = driversOf(graph);
  const inputs = new Set(
    graph.variables
      .filter((variable) => variable.role === "input")
      .map((variable) => variable.name),
  );
  const waitsOn = new Map<ReactiveModuleDecl, Set<ReactiveModuleDecl>>();
  for (const module of graph.modules) {
    const upstream = new Set<ReactiveModuleDecl>();
    for (const name of moduleAwaits(module)) {
      if (inputs.has(name)) {
        continue;
      }
      const driver = drivers.get(name);
      if (driver === undefined) {
        throw new Error(
          `${module.className} awaits ${name}, which nothing drives`,
        );
      }
      if (driver !== module) {
        upstream.add(driver);
      }
    }
    waitsOn.set(module, upstream);
  }
  const ordered: ReactiveModuleDecl[] = [];
  const placed = new Set<ReactiveModuleDecl>();
  let remaining = graph.modules;
  while (remaining.length > 0) {
    const ready = remaining.filter((module) =>
      [...(waitsOn.get(module) ?? [])].every((upstream) =>
        placed.has(upstream),
      ),
    );
    if (ready.length === 0) {
      throw new Error(
        `the awaits form a cycle through ${remaining.map((module) => module.className).join(", ")}`,
      );
    }
    for (const module of ready) {
      ordered.push(module);
      placed.add(module);
    }
    remaining = remaining.filter((module) => !placed.has(module));
  }
  return ordered;
};

type Scope = {
  /** Locals of the module being evaluated, over the latched values it reads. */
  locals: Map<string, ReactiveValue>;
  /** A variable's next value: an input's for this round, or its driver's. */
  awaited: (name: string) => ReactiveValue;
};

const asNumber = (value: ReactiveValue, where: string): number => {
  if (typeof value !== "number") {
    throw new TypeError(`${where} expects a number, got ${String(value)}`);
  }
  return value;
};

const asBoolean = (value: ReactiveValue, where: string): boolean => {
  if (typeof value !== "boolean") {
    throw new TypeError(`${where} expects a Bool, got ${String(value)}`);
  }
  return value;
};

const evaluate = (node: ReactiveExpr, scope: Scope): ReactiveValue => {
  switch (node.kind) {
    case "ref": {
      if (node.next) {
        return scope.awaited(node.name);
      }
      const value = scope.locals.get(node.name);
      if (value === undefined) {
        throw new Error(`${node.name} is read but not in scope`);
      }
      return value;
    }
    case "num":
      return node.value;
    case "bool":
      return node.value;
    case "binary": {
      const left = evaluate(node.left, scope);
      const right = evaluate(node.right, scope);
      switch (node.op) {
        case "+":
          return asNumber(left, "+") + asNumber(right, "+");
        case "-":
          return asNumber(left, "-") - asNumber(right, "-");
        case "<":
          return asNumber(left, "<") < asNumber(right, "<");
        case "<=":
          return asNumber(left, "<=") <= asNumber(right, "<=");
        case ">":
          return asNumber(left, ">") > asNumber(right, ">");
        case ">=":
          return asNumber(left, ">=") >= asNumber(right, ">=");
        case "==":
          return left === right;
        case "!=":
          return left !== right;
        case "&":
          return asBoolean(left, "&") && asBoolean(right, "&");
        case "|":
          return asBoolean(left, "|") || asBoolean(right, "|");
      }
      break;
    }
    case "ite":
      return asBoolean(evaluate(node.condition, scope), "ite")
        ? evaluate(node.thenBranch, scope)
        : evaluate(node.elseBranch, scope);
    case "not":
      return !asBoolean(evaluate(node.operand, scope), "~");
    case "scale":
      return node.factor * asNumber(evaluate(node.operand, scope), "*");
    case "relu":
      return Math.max(0, asNumber(evaluate(node.operand, scope), "relu"));
  }
};

const noAwait = (name: string): ReactiveValue => {
  throw new Error(`${name} is awaited where nothing is computed yet`);
};

export const interpretReactiveModuleGraph = (
  lowered: LoweredGraph,
  { steps, inputs }: InterpretReactiveModuleGraphOptions,
): ReactiveTrace => {
  const graph = linearGraph(lowered);
  const ordered = orderReactiveModules(graph);
  const inputNames = new Set(
    graph.variables
      .filter((variable) => variable.role === "input")
      .map((variable) => variable.name),
  );
  const state = new Map<string, ReactiveValue>();
  for (const module of ordered) {
    module.ctrl.forEach((name, index) => {
      const init = module.init[index];
      if (init === undefined) {
        throw new Error(`${module.className} has no init for ${name}`);
      }
      state.set(name, evaluate(init, { locals: new Map(), awaited: noAwait }));
    });
  }
  const snapshot = (): Record<string, ReactiveValue> =>
    Object.fromEntries(state);
  const trace: ReactiveTrace = [snapshot()];
  for (let step = 1; step <= steps; step++) {
    const nextValues = new Map<string, ReactiveValue>();
    const awaited = (name: string): ReactiveValue => {
      if (inputNames.has(name)) {
        const value = inputs(step, name);
        if (value !== undefined) {
          return value;
        }
        if (isPickName(name)) {
          return true;
        }
        throw new Error(`${name} has no value for round ${step}`);
      }
      const value = nextValues.get(name);
      if (value === undefined) {
        throw new Error(`${name} is awaited before its driver ran`);
      }
      return value;
    };
    for (const module of ordered) {
      const locals = new Map<string, ReactiveValue>();
      for (const name of [...module.ctrl, ...module.extl]) {
        if (inputNames.has(name)) {
          continue;
        }
        const value = state.get(name);
        if (value === undefined) {
          throw new Error(
            `${module.className} reads ${name}, which has no value`,
          );
        }
        locals.set(name, value);
      }
      const scope: Scope = { locals, awaited };
      for (const statement of module.update) {
        if (statement.kind === "assign") {
          locals.set(statement.target, evaluate(statement.expr, scope));
        }
      }
      module.ctrl.forEach((name, index) => {
        const value = module.returns[index];
        if (value === undefined) {
          throw new Error(`${module.className} returns nothing for ${name}`);
        }
        nextValues.set(name, evaluate(value, scope));
      });
    }
    for (const [name, value] of nextValues) {
      state.set(name, value);
    }
    trace.push(snapshot());
  }
  return trace;
};
