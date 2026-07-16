/**
 * Static analyses over the HIR.
 *
 * All analyses share one abstract interpreter: because the HIR is pure,
 * non-recursive and loop-free (only structural `map`), a single symbolic
 * evaluation of the body is enough to answer:
 *
 * - which model parameters and token attributes the code depends on,
 * - which probability distributions it constructs, how they derive from one
 *   another (the distribution DAG), and into which output slots their samples
 *   flow,
 * - which distributions share a single draw (the runtime caches a
 *   distribution object's first sample, so one binding feeding two output
 *   fields yields identical values),
 * - which `const` bindings are never used.
 */
import type {
  HirDistributionKind,
  HirExpr,
  HirFunction,
  HirNodeId,
  Span,
} from "./hir";

/**
 * The place a token read refers to: `"self"` for dynamics (the place the
 * equation is attached to), otherwise the place display name. The `& {}`
 * keeps the `"self"` literal from being absorbed into `string`.
 */
export type HirTokenReadPlace = "self" | (string & {});

/** A token attribute read. */
export type HirTokenRead = {
  place: HirTokenReadPlace;
  field: string;
};

export type HirDependencies = {
  /** Model parameters read via `parameters.<name>` (sorted, unique). */
  parameters: string[];
  /** Token attributes read (unique by place+field). */
  tokenReads: HirTokenRead[];
  /** Whether the code reads token counts (`.length`). */
  readsTokenCounts: boolean;
  /** Whether the code constructs probability distributions. */
  samplesDistributions: boolean;
  /** Whether the code calls `Math.random()` (breaks reproducibility). */
  usesMathRandom: boolean;
  /** Whether the code auto-generates UUIDs (consumes the seeded RNG). */
  generatesUuids: boolean;
  /** True when the result is a pure function of (tokens, parameters). */
  isDeterministic: boolean;
};

export type DistributionDagNode = {
  /** HIR node id of the `distribution` / `distributionMap` node. */
  nodeId: HirNodeId;
  kind: HirDistributionKind | "mapped";
  span: Span;
  /** Name of the `const` binding holding this distribution, if any. */
  bindingName?: string;
  /** True when constructed inside a `.map(...)` over tokens — a fresh
   * distribution (and draw) is created per token. */
  perIteration: boolean;
  /** Argument values when they fold to constants, e.g. `[0, 10]`. */
  constantArgs?: number[];
  /** Parameters feeding the arguments (or the map body). */
  dependsOnParameters: string[];
  /** Token attributes feeding the arguments (or the map body). */
  dependsOnTokens: HirTokenRead[];
};

/** Derivation edge: `to` is `from.map(...)`. */
export type DistributionDagEdge = {
  from: HirNodeId;
  to: HirNodeId;
};

/** Where a distribution's sample lands in a kernel's output. */
export type DistributionSink = {
  nodeId: HirNodeId;
  place: string;
  /** Token position within the place's output array, or `"dynamic"` when the
   * token is produced by a `.map(...)`. */
  tokenIndex: number | "dynamic";
  field: string;
};

export type DistributionDag = {
  nodes: DistributionDagNode[];
  edges: DistributionDagEdge[];
  sinks: DistributionSink[];
  /** Nodes whose single draw feeds more than one output slot. */
  sharedSampleNodeIds: HirNodeId[];
};

export type HirBindingInfo = {
  name: string;
  nameSpan: Span;
  referenceCount: number;
};

export type HirAnalysis = {
  dependencies: HirDependencies;
  distributionDag: DistributionDag;
  bindings: HirBindingInfo[];
};

// ---------------------------------------------------------------------------
// Abstract values
// ---------------------------------------------------------------------------

type AbstractValue =
  /** An opaque scalar (number/boolean). */
  | { kind: "scalar" }
  /** The lambda/kernel input object (`tokensByPlace`). */
  | { kind: "inputRecord" }
  /** A token array belonging to a place. */
  | { kind: "tokens"; place: HirTokenReadPlace }
  /** A single token of a place. */
  | { kind: "token"; place: HirTokenReadPlace }
  | { kind: "record"; fields: Map<string, AbstractValue> }
  /** `elements` is null for arrays of statically-unknown shape (map results
   * carry the per-element value in `element`). */
  | {
      kind: "array";
      elements: AbstractValue[] | null;
      element?: AbstractValue;
    }
  | { kind: "dist"; nodeId: HirNodeId }
  /** Either of several values (from conditionals). */
  | { kind: "union"; values: AbstractValue[] };

const SCALAR: AbstractValue = { kind: "scalar" };

type BindingRecord = {
  name: string;
  nameSpan: Span;
  referenceCount: number;
};

type DepSink = {
  parameters: Set<string>;
  tokenReads: Map<string, HirTokenRead>;
};

function createDepSink(): DepSink {
  return { parameters: new Set(), tokenReads: new Map() };
}

// ---------------------------------------------------------------------------
// Constant folding
// ---------------------------------------------------------------------------

function constantValue(name: "PI" | "E" | "Infinity" | "NaN"): number {
  switch (name) {
    case "PI":
      return Math.PI;
    case "E":
      return Math.E;
    case "Infinity":
      return Infinity;
    case "NaN":
      return NaN;
  }
}

function literalValue(expr: HirExpr): number | boolean | string | undefined {
  if (expr.kind === "numberLit") {
    return expr.value;
  }
  if (expr.kind === "boolLit") {
    return expr.value;
  }
  if (expr.kind === "stringLit") {
    return expr.value;
  }
  if (expr.kind === "constant") {
    return constantValue(expr.name);
  }
  return undefined;
}

function numberNode(
  original: HirExpr,
  value: number,
): Extract<HirExpr, { kind: "numberLit" }> {
  return {
    kind: "numberLit",
    value,
    raw: String(value),
    id: original.id,
    span: original.span,
  };
}

function foldBinary(
  op: Extract<HirExpr, { kind: "binary" }>["op"],
  left: number | boolean | string,
  right: number | boolean | string,
): number | boolean | undefined {
  // Strings only participate in equality folding.
  if (typeof left === "string" || typeof right === "string") {
    if (op === "==") {
      return left === right;
    }
    if (op === "!=") {
      return left !== right;
    }
    return undefined;
  }
  switch (op) {
    case "+":
      return typeof left === "number" && typeof right === "number"
        ? left + right
        : undefined;
    case "-":
      return Number(left) - Number(right);
    case "*":
      return Number(left) * Number(right);
    case "/":
      return Number(left) / Number(right);
    case "%":
      return Number(left) % Number(right);
    case "**":
      return Number(left) ** Number(right);
    case "<":
      return Number(left) < Number(right);
    case "<=":
      return Number(left) <= Number(right);
    case ">":
      return Number(left) > Number(right);
    case ">=":
      return Number(left) >= Number(right);
    case "==":
      return left === right;
    case "!=":
      return left !== right;
    case "&&":
      return typeof left === "boolean" && typeof right === "boolean"
        ? left && right
        : undefined;
    case "||":
      return typeof left === "boolean" && typeof right === "boolean"
        ? left || right
        : undefined;
  }
}

/**
 * Folds constant subexpressions. Folded nodes keep the id and span of the
 * expression they replace, so diagnostics and analyses remain anchored.
 * `Math.random()` and distributions are never folded.
 */
export function foldHir(expr: HirExpr): HirExpr {
  switch (expr.kind) {
    case "numberLit":
    case "boolLit":
    case "stringLit":
    case "uuidGenerate":
    case "constant":
    case "localRef":
    case "paramRef":
      return expr;
    case "uuidFrom":
      return { ...expr, operand: foldHir(expr.operand) };
    case "stringCall":
      return {
        ...expr,
        target: foldHir(expr.target),
        argument: foldHir(expr.argument),
      };
    case "unary": {
      const operand = foldHir(expr.operand);
      const value = literalValue(operand);
      if (value !== undefined) {
        if (expr.op === "!" && typeof value === "boolean") {
          return { ...expr, kind: "boolLit", value: !value } as HirExpr;
        }
        if (typeof value === "number") {
          if (expr.op === "-") {
            return numberNode(expr, -value);
          }
          if (expr.op === "+") {
            return numberNode(expr, value);
          }
        }
      }
      return { ...expr, operand };
    }
    case "binary": {
      const left = foldHir(expr.left);
      const right = foldHir(expr.right);
      const leftValue = literalValue(left);
      const rightValue = literalValue(right);
      if (leftValue !== undefined && rightValue !== undefined) {
        const folded = foldBinary(expr.op, leftValue, rightValue);
        if (folded !== undefined) {
          return typeof folded === "boolean"
            ? ({ ...expr, kind: "boolLit", value: folded } as HirExpr)
            : numberNode(expr, folded);
        }
      }
      return { ...expr, left, right };
    }
    case "cond": {
      const condition = foldHir(expr.condition);
      if (condition.kind === "boolLit") {
        return condition.value
          ? foldHir(expr.thenBranch)
          : foldHir(expr.elseBranch);
      }
      return {
        ...expr,
        condition,
        thenBranch: foldHir(expr.thenBranch),
        elseBranch: foldHir(expr.elseBranch),
      };
    }
    case "let": {
      return {
        ...expr,
        bindings: expr.bindings.map((binding) => ({
          ...binding,
          value: foldHir(binding.value),
        })),
        body: foldHir(expr.body),
      };
    }
    case "mathCall": {
      const args = expr.args.map(foldHir);
      if (expr.fn !== "random") {
        const values = args.map(literalValue);
        if (values.every((value) => typeof value === "number")) {
          const mathFn = Math[expr.fn] as (...values: number[]) => number;
          return numberNode(expr, mathFn(...(values as number[])));
        }
      }
      return { ...expr, args };
    }
    case "fieldAccess":
      return { ...expr, target: foldHir(expr.target) };
    case "indexAccess":
      return {
        ...expr,
        target: foldHir(expr.target),
        index: foldHir(expr.index),
      };
    case "length":
      return { ...expr, target: foldHir(expr.target) };
    case "recordLit":
      return {
        ...expr,
        entries: expr.entries.map((entry) => ({
          ...entry,
          value: foldHir(entry.value),
        })),
      };
    case "arrayLit":
      return { ...expr, elements: expr.elements.map(foldHir) };
    case "arrayMap":
      return {
        ...expr,
        target: foldHir(expr.target),
        body: foldHir(expr.body),
      };
    case "arrayReduce":
      // Never folded away — only the subexpressions are folded.
      return {
        ...expr,
        target: foldHir(expr.target),
        body: foldHir(expr.body),
        initial: foldHir(expr.initial),
      };
    case "arrayConcat":
      return { ...expr, left: foldHir(expr.left), right: foldHir(expr.right) };
    case "distribution":
      return { ...expr, args: expr.args.map(foldHir) };
    case "distributionMap":
      return { ...expr, base: foldHir(expr.base), body: foldHir(expr.body) };
  }
}

function constantArgsOf(args: HirExpr[]): number[] | undefined {
  const values: number[] = [];
  for (const argument of args) {
    const folded = foldHir(argument);
    if (folded.kind === "numberLit") {
      values.push(folded.value);
    } else if (folded.kind === "constant") {
      values.push(constantValue(folded.name));
    } else {
      return undefined;
    }
  }
  return values;
}

class Analyzer {
  readonly globalDeps = createDepSink();
  readonly depSinkStack: DepSink[] = [];
  readonly dagNodes = new Map<HirNodeId, DistributionDagNode>();
  readonly dagEdges: DistributionDagEdge[] = [];
  readonly bindings: BindingRecord[] = [];
  readsTokenCounts = false;
  usesMathRandom = false;
  generatesUuids = false;
  /** Depth of `.map(...)` iteration during evaluation. */
  private mapDepth = 0;

  constructor(private readonly fn: HirFunction) {}

  private recordParameter(name: string): void {
    this.globalDeps.parameters.add(name);
    for (const sink of this.depSinkStack) {
      sink.parameters.add(name);
    }
  }

  private recordTokenRead(read: HirTokenRead): void {
    const key = `${read.place}\u0000${read.field}`;
    this.globalDeps.tokenReads.set(key, read);
    for (const sink of this.depSinkStack) {
      sink.tokenReads.set(key, read);
    }
  }

  private withDepSink<Result>(run: () => Result): [Result, DepSink] {
    const sink = createDepSink();
    this.depSinkStack.push(sink);
    try {
      return [run(), sink];
    } finally {
      this.depSinkStack.pop();
    }
  }

  evaluate(): AbstractValue {
    const env = new Map<
      string,
      { value: AbstractValue; binding?: BindingRecord }
    >();
    const tokensParam = this.fn.params[0];
    if (tokensParam) {
      env.set(tokensParam.name, {
        value:
          this.fn.surface === "dynamics"
            ? { kind: "tokens", place: "self" }
            : { kind: "inputRecord" },
      });
    }
    return this.evalExpr(this.fn.body, env);
  }

  private evalExpr(
    expr: HirExpr,
    env: Map<string, { value: AbstractValue; binding?: BindingRecord }>,
  ): AbstractValue {
    switch (expr.kind) {
      case "numberLit":
      case "boolLit":
      case "stringLit":
      case "constant":
        return SCALAR;
      case "uuidGenerate":
        this.generatesUuids = true;
        return SCALAR;
      case "uuidFrom":
        this.evalExpr(expr.operand, env);
        return SCALAR;
      case "stringCall":
        this.evalExpr(expr.target, env);
        this.evalExpr(expr.argument, env);
        return SCALAR;
      case "localRef": {
        const entry = env.get(expr.name);
        if (entry) {
          if (entry.binding) {
            entry.binding.referenceCount += 1;
          }
          return entry.value;
        }
        return SCALAR;
      }
      case "paramRef":
        this.recordParameter(expr.name);
        return SCALAR;
      case "fieldAccess": {
        const target = this.evalExpr(expr.target, env);
        return this.accessField(target, expr.field);
      }
      case "indexAccess": {
        const target = this.evalExpr(expr.target, env);
        this.evalExpr(expr.index, env);
        return this.accessIndex(target, expr.index);
      }
      case "length": {
        const target = this.evalExpr(expr.target, env);
        if (target.kind === "tokens" || target.kind === "inputRecord") {
          this.readsTokenCounts = true;
        }
        return SCALAR;
      }
      case "unary":
        this.evalExpr(expr.operand, env);
        return SCALAR;
      case "binary":
        this.evalExpr(expr.left, env);
        this.evalExpr(expr.right, env);
        return SCALAR;
      case "cond": {
        this.evalExpr(expr.condition, env);
        const thenValue = this.evalExpr(expr.thenBranch, env);
        const elseValue = this.evalExpr(expr.elseBranch, env);
        if (thenValue === elseValue) {
          return thenValue;
        }
        return { kind: "union", values: [thenValue, elseValue] };
      }
      case "let": {
        const scoped = new Map(env);
        for (const bindingExpr of expr.bindings) {
          const binding: BindingRecord = {
            name: bindingExpr.name,
            nameSpan: bindingExpr.nameSpan,
            referenceCount: 0,
          };
          this.bindings.push(binding);
          const value = this.evalExpr(bindingExpr.value, scoped);
          this.nameDistribution(value, bindingExpr.name);
          scoped.set(bindingExpr.name, { value, binding });
        }
        return this.evalExpr(expr.body, scoped);
      }
      case "mathCall": {
        if (expr.fn === "random") {
          this.usesMathRandom = true;
        }
        for (const argument of expr.args) {
          this.evalExpr(argument, env);
        }
        return SCALAR;
      }
      case "recordLit": {
        const fields = new Map<string, AbstractValue>();
        for (const entry of expr.entries) {
          fields.set(entry.key, this.evalExpr(entry.value, env));
        }
        return { kind: "record", fields };
      }
      case "arrayLit":
        return {
          kind: "array",
          elements: expr.elements.map((element) => this.evalExpr(element, env)),
        };
      case "arrayMap": {
        const target = this.evalExpr(expr.target, env);
        const scoped = new Map(env);
        scoped.set(expr.param.name, { value: this.elementOf(target) });
        if (expr.indexParam) {
          scoped.set(expr.indexParam.name, { value: SCALAR });
        }
        this.mapDepth += 1;
        const element = this.evalExpr(expr.body, scoped);
        this.mapDepth -= 1;
        return { kind: "array", elements: null, element };
      }
      case "arrayReduce": {
        const target = this.evalExpr(expr.target, env);
        const initial = this.evalExpr(expr.initial, env);
        const scoped = new Map(env);
        // The body is evaluated once: the accumulator is seeded with the
        // initial value and the element with the target's element (so token
        // reads inside the body are attributed like `arrayMap`).
        scoped.set(expr.accParam.name, { value: initial });
        scoped.set(expr.param.name, { value: this.elementOf(target) });
        if (expr.indexParam) {
          scoped.set(expr.indexParam.name, { value: SCALAR });
        }
        this.mapDepth += 1;
        const body = this.evalExpr(expr.body, scoped);
        this.mapDepth -= 1;
        if (body === initial) {
          return body;
        }
        return { kind: "union", values: [initial, body] };
      }
      case "arrayConcat": {
        const left = this.evalExpr(expr.left, env);
        const right = this.evalExpr(expr.right, env);
        return {
          kind: "array",
          elements: null,
          element: {
            kind: "union",
            values: [this.elementOf(left), this.elementOf(right)],
          },
        };
      }
      case "distribution": {
        const [, argDeps] = this.withDepSink(() => {
          for (const argument of expr.args) {
            this.evalExpr(argument, env);
          }
        });
        const node: DistributionDagNode = {
          nodeId: expr.id,
          kind: expr.dist,
          span: expr.span,
          perIteration: this.mapDepth > 0,
          constantArgs: constantArgsOf(expr.args),
          dependsOnParameters: [...argDeps.parameters].sort(),
          dependsOnTokens: [...argDeps.tokenReads.values()],
        };
        this.dagNodes.set(expr.id, node);
        return { kind: "dist", nodeId: expr.id };
      }
      case "distributionMap": {
        const base = this.evalExpr(expr.base, env);
        const [, bodyDeps] = this.withDepSink(() => {
          const scoped = new Map(env);
          scoped.set(expr.param.name, { value: SCALAR });
          this.evalExpr(expr.body, scoped);
        });
        const node: DistributionDagNode = {
          nodeId: expr.id,
          kind: "mapped",
          span: expr.span,
          perIteration: this.mapDepth > 0,
          dependsOnParameters: [...bodyDeps.parameters].sort(),
          dependsOnTokens: [...bodyDeps.tokenReads.values()],
        };
        this.dagNodes.set(expr.id, node);
        for (const baseNodeId of this.distributionNodeIds(base)) {
          this.dagEdges.push({ from: baseNodeId, to: expr.id });
        }
        return { kind: "dist", nodeId: expr.id };
      }
    }
  }

  private accessField(target: AbstractValue, field: string): AbstractValue {
    switch (target.kind) {
      case "inputRecord":
        return { kind: "tokens", place: field };
      case "token":
        this.recordTokenRead({ place: target.place, field });
        return SCALAR;
      case "record":
        return target.fields.get(field) ?? SCALAR;
      case "union":
        return {
          kind: "union",
          values: target.values.map((value) => this.accessField(value, field)),
        };
      default:
        return SCALAR;
    }
  }

  private accessIndex(target: AbstractValue, _index: HirExpr): AbstractValue {
    switch (target.kind) {
      case "tokens":
        return { kind: "token", place: target.place };
      case "array":
        if (target.elements) {
          // Index may be dynamic; the result may be any element.
          return target.elements.length === 1
            ? target.elements[0]!
            : { kind: "union", values: target.elements };
        }
        return target.element ?? SCALAR;
      case "union":
        return {
          kind: "union",
          values: target.values.map((value) => this.accessIndex(value, _index)),
        };
      default:
        return SCALAR;
    }
  }

  private elementOf(target: AbstractValue): AbstractValue {
    switch (target.kind) {
      case "tokens":
        return { kind: "token", place: target.place };
      case "array":
        if (target.elements) {
          return target.elements.length === 1
            ? target.elements[0]!
            : { kind: "union", values: target.elements };
        }
        return target.element ?? SCALAR;
      default:
        return SCALAR;
    }
  }

  private nameDistribution(value: AbstractValue, name: string): void {
    for (const nodeId of this.distributionNodeIds(value)) {
      const node = this.dagNodes.get(nodeId);
      if (node && node.bindingName === undefined) {
        node.bindingName = name;
      }
    }
  }

  private distributionNodeIds(value: AbstractValue): HirNodeId[] {
    switch (value.kind) {
      case "dist":
        return [value.nodeId];
      case "union":
        return value.values.flatMap((inner) => this.distributionNodeIds(inner));
      default:
        return [];
    }
  }

  collectSinks(result: AbstractValue): DistributionSink[] {
    if (this.fn.surface !== "kernel") {
      return [];
    }
    const sinks: DistributionSink[] = [];
    const visitToken = (
      token: AbstractValue,
      place: string,
      tokenIndex: number | "dynamic",
    ): void => {
      if (token.kind === "record") {
        for (const [field, fieldValue] of token.fields) {
          for (const nodeId of this.distributionNodeIds(fieldValue)) {
            sinks.push({ nodeId, place, tokenIndex, field });
          }
        }
      } else if (token.kind === "union") {
        for (const inner of token.values) {
          visitToken(inner, place, tokenIndex);
        }
      }
    };
    const visitPlaceValue = (value: AbstractValue, place: string): void => {
      if (value.kind === "array") {
        if (value.elements) {
          for (const [index, token] of value.elements.entries()) {
            visitToken(token, place, index);
          }
        } else if (value.element) {
          visitToken(value.element, place, "dynamic");
        }
      } else if (value.kind === "union") {
        for (const inner of value.values) {
          visitPlaceValue(inner, place);
        }
      }
    };
    const visitOutput = (value: AbstractValue): void => {
      if (value.kind === "record") {
        for (const [place, placeValue] of value.fields) {
          visitPlaceValue(placeValue, place);
        }
      } else if (value.kind === "union") {
        for (const inner of value.values) {
          visitOutput(inner);
        }
      }
    };
    visitOutput(result);
    return sinks;
  }
}

/** Runs all analyses over a lowered function. */
export function analyzeHir(fn: HirFunction): HirAnalysis {
  const analyzer = new Analyzer(fn);
  const result = analyzer.evaluate();
  const sinks = analyzer.collectSinks(result);

  const sinkCountByNode = new Map<HirNodeId, number>();
  for (const sink of sinks) {
    sinkCountByNode.set(
      sink.nodeId,
      (sinkCountByNode.get(sink.nodeId) ?? 0) + 1,
    );
  }
  const sharedSampleNodeIds = [...sinkCountByNode.entries()]
    .filter(([nodeId, count]) => {
      const node = analyzer.dagNodes.get(nodeId);
      // A per-iteration distribution is fresh per token; sharing across a
      // dynamic token array is not sharing a draw. Sharing within one token
      // record still is, but we cannot distinguish that statically here, so
      // stay conservative and only flag non-iterated nodes.
      return count > 1 && node && !node.perIteration;
    })
    .map(([nodeId]) => nodeId);

  const dagNodes = [...analyzer.dagNodes.values()];

  const dependencies: HirDependencies = {
    parameters: [...analyzer.globalDeps.parameters].sort(),
    tokenReads: [...analyzer.globalDeps.tokenReads.values()],
    readsTokenCounts: analyzer.readsTokenCounts,
    samplesDistributions: dagNodes.length > 0,
    usesMathRandom: analyzer.usesMathRandom,
    generatesUuids: analyzer.generatesUuids,
    isDeterministic:
      dagNodes.length === 0 &&
      !analyzer.usesMathRandom &&
      !analyzer.generatesUuids,
  };

  return {
    dependencies,
    distributionDag: {
      nodes: dagNodes,
      edges: analyzer.dagEdges,
      sinks,
      sharedSampleNodeIds,
    },
    bindings: analyzer.bindings.map((binding) => ({
      name: binding.name,
      nameSpan: binding.nameSpan,
      referenceCount: binding.referenceCount,
    })),
  };
}
