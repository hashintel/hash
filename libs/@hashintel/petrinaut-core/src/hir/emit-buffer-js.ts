/**
 * Buffer-ABI JavaScript emission for lambdas, transition kernels and
 * metrics.
 *
 * Emitted functions read token attributes straight out of the engine's packed
 * token bytes at statically-resolved offsets:
 *
 *   lambda: (f64, u64, u8, placeBases, indices) => number | boolean
 *   kernel: (f64, u64, u8, placeBases, indices, outF64, outU64, outU8, sink) => void
 *   metric: (f64, u64, u8, placeCounts, placeOffsets) => number
 *
 * The full ABI is documented in `BUFFER_ABI.md`.
 *
 * Emission works by symbolic evaluation: structural values (input tuples,
 * tokens, records, arrays) exist only at compile time; everything that
 * reaches the output is a scalar JS expression or a distribution constant.
 * `.map(...)` over token tuples is unrolled (arc weights are static).
 * Shapes the evaluator cannot scalarize return `null`; `compileHirArtifacts`
 * reports those as compile failures.
 *
 * Only emit from functions whose typecheck produced no errors: the emitter
 * relies on attribute/place validity established by `typecheckHir`.
 */
import {
  computeTokenSlotLayout,
  type TokenSlotLayout,
} from "../simulation/engine/token-layout";
import { foldHir } from "./analyze";

import type { HirExpr, HirFunction } from "./hir";
import type {
  HirArcSlot,
  HirKernelContext,
  HirLambdaContext,
  HirMetricContext,
  HirTokenElementInfo,
} from "./surface-context";

export type BufferProgram = {
  /** JS source of the emitted function (arrow expression). */
  source: string;
  /** Expected `indices.length` — engine-side sanity check. */
  inputSlotCount: number;
};

export type BufferKernelProgram = BufferProgram & {
  /** Expected staging byte length — engine-side sanity check. */
  outputByteCount: number;
};

export type BufferMetricProgram = {
  /** JS source of the emitted function (arrow expression). */
  source: string;
  /** Places referenced by the program, in emitted-ordinal order — the
   * instantiation binds `__places[ordinal] → frame place index`. */
  placeNames: string[];
};

/** Maximum tokens per arc slot we are willing to unroll `.map` over. */
const MAX_UNROLL = 16;

const RESERVED_NAMES = [
  "f64",
  "u64",
  "u8",
  "__pool",
  "__out",
  "__sink",
  "__places",
  "placeBases",
  "placeCounts",
  "placeOffsets",
  "indices",
  "out",
  "distSink",
  "__params",
  "__dist",
  "Math",
  "Number",
  "RangeError",
  "Infinity",
  "NaN",
];

/** Internal bail signal: shape outside the buffer-ABI subset. */
class BailError extends Error {}

/** One place referenced by a metric program (registered ordinal + color). */
type MetricPlaceRef = {
  ordinal: number;
  elements: HirTokenElementInfo[];
};

type Value =
  /** A JS expression producing a number or boolean. */
  | { kind: "scalar"; code: string }
  /** A JS expression producing a RuntimeDistribution (a hoisted const). */
  | { kind: "dist"; code: string }
  /** `Uuid.generate()` / `Uuid.from(...)` — resolved by the engine sink. */
  | { kind: "uuidSentinel"; mode: "generate" | "from"; code: string }
  /** The lambda/kernel first parameter (`tokensByPlace`). */
  | { kind: "inputRecord" }
  /** A whole input arc slot's token tuple. */
  | { kind: "tokens"; slot: HirArcSlot }
  /** One token; `baseCode` is a JS expression for its float base offset. */
  | { kind: "token"; baseCode: string; elements: HirTokenElementInfo[] }
  | { kind: "record"; fields: Map<string, Value> }
  | { kind: "array"; items: Value[] }
  /** The metric `state` parameter. */
  | { kind: "metricState" }
  /** `state.places` in a metric program. */
  | { kind: "placesRecord" }
  /** `state.places.<Name>` — `count`/`tokens` read through `__places`. */
  | ({ kind: "placeState" } & MetricPlaceRef)
  /** `state.places.<Name>.tokens` — a dynamically-sized token array. */
  | ({ kind: "placeTokens" } & MetricPlaceRef)
  /** `a.concat(b)` over place token arrays (parts in source order). */
  | { kind: "placeTokensConcat"; parts: MetricPlaceRef[] };

function quoteKey(key: string): string {
  return JSON.stringify(key);
}

function emitNumber(value: number, raw: string): string {
  if (Number.isNaN(value)) {
    return "NaN";
  }
  if (Number(raw) === value) {
    return raw;
  }
  if (value === Infinity) {
    return "Infinity";
  }
  if (value === -Infinity) {
    return "-Infinity";
  }
  return String(value);
}

class NameAllocator {
  private readonly used: Set<string>;

  constructor(used: Iterable<string>) {
    this.used = new Set(used);
  }

  allocate(preferred: string): string {
    let name = preferred;
    let suffix = 2;
    while (this.used.has(name)) {
      name = `${preferred}_${suffix}`;
      suffix += 1;
    }
    this.used.add(name);
    return name;
  }
}

class BufferEmitter {
  /** Hoisted statements (consts, metric reduce loops), in evaluation order. */
  readonly lines: string[] = [];
  readonly names = new NameAllocator(RESERVED_NAMES);

  /** Metric-referenced place names in emitted-ordinal order. */
  readonly placeNames: string[] = [];
  private readonly metricPlaceByName: Map<
    string,
    { name: string; elements: HirTokenElementInfo[] }
  > | null;
  private readonly metricOrdinalByName = new Map<string, number>();

  constructor(
    readonly inputSlots: HirArcSlot[],
    metricContext: HirMetricContext | null = null,
  ) {
    this.metricPlaceByName = metricContext
      ? new Map(metricContext.places.map((place) => [place.name, place]))
      : null;
  }

  /** Resolves a place display name to its arc slot (last arc wins, matching
   * the runtime's object-key overwrite). */
  private slotForPlace(name: string): HirArcSlot | null {
    for (let index = this.inputSlots.length - 1; index >= 0; index -= 1) {
      if (this.inputSlots[index]!.name === name) {
        return this.inputSlots[index]!;
      }
    }
    return null;
  }

  /** Registers (on first reference) and returns the metric place ref for a
   * `state.places.<name>` access. Unknown names bail — typecheck already
   * errors on them, so this only guards mistyped programs. */
  private metricPlaceRef(name: string): MetricPlaceRef {
    const place = this.metricPlaceByName?.get(name);
    if (!place) {
      throw new BailError();
    }
    let ordinal = this.metricOrdinalByName.get(name);
    if (ordinal === undefined) {
      ordinal = this.placeNames.length;
      this.placeNames.push(name);
      this.metricOrdinalByName.set(name, ordinal);
    }
    return { ordinal, elements: place.elements };
  }

  /** `placeCounts[...]` read for one referenced place. */
  private metricCountCode(ordinal: number): string {
    return `placeCounts[__places[${ordinal}]]`;
  }

  /** Flattens a reduce/concat target into place parts; anything that is not
   * a place token array (or a concat of them) bails to the object path. */
  private concatParts(value: Value): MetricPlaceRef[] {
    if (value.kind === "placeTokens") {
      return [{ ordinal: value.ordinal, elements: value.elements }];
    }
    if (value.kind === "placeTokensConcat") {
      return value.parts;
    }
    throw new BailError();
  }

  /** Token layouts computed once per arc slot; byte offsets and strides are
   * baked into the emitted code as literal constants. */
  private readonly layoutBySlot = new Map<HirArcSlot, TokenSlotLayout>();

  private layoutOf(elements: readonly HirTokenElementInfo[]): TokenSlotLayout {
    return computeTokenSlotLayout(
      elements.map((element, index) => ({
        elementId: String(index),
        name: element.name,
        type: element.type,
      })),
    );
  }

  private slotLayout(slot: HirArcSlot): TokenSlotLayout {
    let layout = this.layoutBySlot.get(slot);
    if (!layout) {
      layout = this.layoutOf(slot.elements);
      this.layoutBySlot.set(slot, layout);
    }
    return layout;
  }

  /** Which `placeBases` entry an arc slot reads from (its arc index). */
  private placeBaseIndex(slot: HirArcSlot): number {
    return this.inputSlots.indexOf(slot);
  }

  private tokenOfSlot(slot: HirArcSlot, tokenIndex: number): Value {
    const stride = this.slotLayout(slot).strideBytes;
    const slotIndex = slot.slotStart + tokenIndex;
    const strideCode = stride === 0 ? "0" : `indices[${slotIndex}] * ${stride}`;
    return {
      kind: "token",
      baseCode: `placeBases[${this.placeBaseIndex(slot)}] + ${strideCode}`,
      elements: slot.elements,
    };
  }

  /**
   * Emits a read of one attribute from the packed token struct (format v2):
   * `baseCode` is the token's base BYTE offset within the token region;
   * field offsets come from `computeTokenSlotLayout`. real/integer are f64,
   * booleans u8 (0/1), strings u64 pool handles (resolved through `__pool`),
   * uuids two u64 lanes assembled into one bigint.
   */
  /** Public wrappers for the kernel emitter. */
  tokenValueOf(slot: HirArcSlot, tokenIndex: number): Value {
    return this.tokenOfSlot(slot, tokenIndex);
  }

  readTokenField(
    token: Extract<Value, { kind: "token" }>,
    field: string,
  ): Value | undefined {
    try {
      return this.readAttribute(token, field);
    } catch (error) {
      if (error instanceof BailError) {
        return undefined;
      }
      throw error;
    }
  }

  private readAttribute(
    token: Extract<Value, { kind: "token" }>,
    field: string,
  ): Value {
    const layout = this.layoutOf(token.elements);
    const layoutField = layout.fields.find(
      (candidate) => candidate.element.name === field,
    );
    if (!layoutField) {
      throw new BailError();
    }
    const byteOffset = layoutField.byteOffset;
    const base =
      byteOffset === 0 ? token.baseCode : `${token.baseCode} + ${byteOffset}`;
    switch (layoutField.kind) {
      case "f64": {
        const read = `f64[(${base}) >> 3]`;
        return {
          kind: "scalar",
          code:
            layoutField.element.type === "integer"
              ? `Math.round(${read})`
              : read,
        };
      }
      case "u8":
        return { kind: "scalar", code: `(u8[${base}] !== 0)` };
      case "u64":
        return {
          kind: "scalar",
          code: `__pool.get(Number(u64[(${base}) >> 3]))`,
        };
      case "u64x2":
        return {
          kind: "scalar",
          code: `((u64[((${base}) >> 3) + 1] << 64n) | u64[(${base}) >> 3])`,
        };
    }
  }

  private scalar(value: Value): string {
    if (value.kind !== "scalar") {
      throw new BailError();
    }
    return value.code;
  }

  eval(expr: HirExpr, env: Map<string, Value>): Value {
    switch (expr.kind) {
      case "numberLit":
        return { kind: "scalar", code: emitNumber(expr.value, expr.raw) };
      case "boolLit":
        return { kind: "scalar", code: expr.value ? "true" : "false" };
      case "stringLit":
        return { kind: "scalar", code: JSON.stringify(expr.value) };
      case "stringCall":
        return {
          kind: "scalar",
          code: `${this.scalar(this.eval(expr.target, env))}.${expr.fn}(${this.scalar(
            this.eval(expr.argument, env),
          )})`,
        };
      case "uuidGenerate":
        return { kind: "uuidSentinel", mode: "generate", code: "0" };
      case "uuidFrom":
        return {
          kind: "uuidSentinel",
          mode: "from",
          code: this.scalar(this.eval(expr.operand, env)),
        };
      case "constant":
        switch (expr.name) {
          case "PI":
            return { kind: "scalar", code: "Math.PI" };
          case "E":
            return { kind: "scalar", code: "Math.E" };
          case "Infinity":
            return { kind: "scalar", code: "Infinity" };
          case "NaN":
            return { kind: "scalar", code: "NaN" };
        }
        break;
      case "localRef": {
        const value = env.get(expr.name);
        if (!value) {
          throw new BailError();
        }
        return value;
      }
      case "paramRef":
        return { kind: "scalar", code: `__params[${quoteKey(expr.name)}]` };
      case "fieldAccess": {
        const target = this.eval(expr.target, env);
        if (target.kind === "inputRecord") {
          const slot = this.slotForPlace(expr.field);
          if (!slot) {
            throw new BailError();
          }
          return { kind: "tokens", slot };
        }
        if (target.kind === "metricState") {
          if (expr.field !== "places") {
            throw new BailError();
          }
          return { kind: "placesRecord" };
        }
        if (target.kind === "placesRecord") {
          return { kind: "placeState", ...this.metricPlaceRef(expr.field) };
        }
        if (target.kind === "placeState") {
          if (expr.field === "count") {
            return {
              kind: "scalar",
              code: this.metricCountCode(target.ordinal),
            };
          }
          if (expr.field === "tokens") {
            return {
              kind: "placeTokens",
              ordinal: target.ordinal,
              elements: target.elements,
            };
          }
          throw new BailError();
        }
        if (target.kind === "token") {
          return this.readAttribute(target, expr.field);
        }
        if (target.kind === "record") {
          const field = target.fields.get(expr.field);
          if (!field) {
            throw new BailError();
          }
          return field;
        }
        throw new BailError();
      }
      case "indexAccess": {
        const target = this.eval(expr.target, env);
        if (target.kind === "placeTokens") {
          // Metric token counts are dynamic. Preserve array-index semantics
          // instead of allowing an invalid index to read an adjacent place's
          // packed bytes.
          const indexCode = this.scalar(this.eval(expr.index, env));
          const index = this.names.allocate("__metricIndex");
          const count = this.metricCountCode(target.ordinal);
          const placeName = this.placeNames[target.ordinal] ?? "unknown";
          this.lines.push(`const ${index} = ${indexCode};`);
          this.lines.push(
            `if (!Number.isInteger(${index}) || ${index} < 0 || ${index} >= ${count}) throw new RangeError(${quoteKey(`Metric token index for place "${placeName}" is out of bounds`)});`,
          );
          const stride = this.layoutOf(target.elements).strideBytes;
          const strideCode = stride === 0 ? "0" : `(${index}) * ${stride}`;
          return {
            kind: "token",
            baseCode: `placeOffsets[__places[${target.ordinal}]] + ${strideCode}`,
            elements: target.elements,
          };
        }
        const index = foldHir(expr.index);
        if (index.kind !== "numberLit" || !Number.isInteger(index.value)) {
          // Dynamic transition-token indices would read unchecked memory.
          throw new BailError();
        }
        if (target.kind === "tokens") {
          if (index.value < 0 || index.value >= target.slot.tokenCount) {
            throw new BailError();
          }
          return this.tokenOfSlot(target.slot, index.value);
        }
        if (target.kind === "array") {
          const item = target.items[index.value];
          if (!item) {
            throw new BailError();
          }
          return item;
        }
        throw new BailError();
      }
      case "length": {
        const target = this.eval(expr.target, env);
        if (target.kind === "tokens") {
          return { kind: "scalar", code: String(target.slot.tokenCount) };
        }
        if (target.kind === "array") {
          return { kind: "scalar", code: String(target.items.length) };
        }
        if (target.kind === "placeTokens") {
          return { kind: "scalar", code: this.metricCountCode(target.ordinal) };
        }
        if (target.kind === "placeTokensConcat") {
          return {
            kind: "scalar",
            code: `(${target.parts
              .map((part) => this.metricCountCode(part.ordinal))
              .join(" + ")})`,
          };
        }
        throw new BailError();
      }
      case "unary":
        return {
          kind: "scalar",
          code: `(${expr.op}${this.scalar(this.eval(expr.operand, env))})`,
        };
      case "binary": {
        const op =
          expr.op === "==" ? "===" : expr.op === "!=" ? "!==" : expr.op;
        const left = this.scalar(this.eval(expr.left, env));
        const rightMark = this.lines.length;
        const right = this.scalar(this.eval(expr.right, env));
        const rightLines = this.lines.splice(rightMark);

        // The right operand can emit prerequisite statements (for example a
        // dynamic metric-token index guard). Preserve short-circuiting by
        // keeping those statements inside the branch that evaluates it.
        if ((op === "&&" || op === "||") && rightLines.length > 0) {
          const leftResult = this.names.allocate("__left");
          const result = this.names.allocate("__shortCircuit");
          const evaluatesRight = op === "&&" ? leftResult : `!(${leftResult})`;
          this.lines.push(
            `const ${leftResult} = ${left};`,
            `let ${result};`,
            `if (${evaluatesRight}) {`,
            ...rightLines.map((line) => `  ${line}`),
            `  ${result} = ${right};`,
            `} else {`,
            `  ${result} = ${leftResult};`,
            `}`,
          );
          return { kind: "scalar", code: result };
        }
        return {
          kind: "scalar",
          code: `(${left} ${op} ${right})`,
        };
      }
      case "cond": {
        const condition = this.scalar(this.eval(expr.condition, env));
        const thenMark = this.lines.length;
        const thenValue = this.eval(expr.thenBranch, env);
        const thenLines = this.lines.splice(thenMark);
        const elseMark = this.lines.length;
        const elseValue = this.eval(expr.elseBranch, env);
        const elseLines = this.lines.splice(elseMark);
        if (
          (thenValue.kind === "scalar" && elseValue.kind === "scalar") ||
          (thenValue.kind === "dist" && elseValue.kind === "dist")
        ) {
          if (thenLines.length === 0 && elseLines.length === 0) {
            return {
              kind: thenValue.kind,
              code: `(${condition} ? ${thenValue.code} : ${elseValue.code})`,
            };
          }

          // Some expressions emit prerequisite statements (metric reduce loops,
          // dynamic-index guards). Keep those statements inside the branch that
          // owns them so an untaken branch cannot do work or throw.
          const result = this.names.allocate("__conditional");
          this.lines.push(
            `let ${result};`,
            `if (${condition}) {`,
            ...thenLines.map((line) => `  ${line}`),
            `  ${result} = ${thenValue.code};`,
            `} else {`,
            ...elseLines.map((line) => `  ${line}`),
            `  ${result} = ${elseValue.code};`,
            `}`,
          );
          return { kind: thenValue.kind, code: result };
        }
        // Structural conditionals (records/tuples) stay on the object path.
        throw new BailError();
      }
      case "let": {
        const scoped = new Map(env);
        for (const binding of expr.bindings) {
          const value = this.eval(binding.value, scoped);
          scoped.set(binding.name, this.hoist(binding.name, value));
        }
        return this.eval(expr.body, scoped);
      }
      case "mathCall": {
        const args = expr.args.map((argument) =>
          this.scalar(this.eval(argument, env)),
        );
        return { kind: "scalar", code: `Math.${expr.fn}(${args.join(", ")})` };
      }
      case "recordLit": {
        const fields = new Map<string, Value>();
        for (const entry of expr.entries) {
          fields.set(entry.key, this.eval(entry.value, env));
        }
        return { kind: "record", fields };
      }
      case "arrayLit":
        return {
          kind: "array",
          items: expr.elements.map((element) => this.eval(element, env)),
        };
      case "arrayMap": {
        const target = this.eval(expr.target, env);
        let items: Value[];
        if (target.kind === "tokens") {
          if (target.slot.tokenCount > MAX_UNROLL) {
            throw new BailError();
          }
          items = Array.from({ length: target.slot.tokenCount }, (_, index) =>
            this.tokenOfSlot(target.slot, index),
          );
        } else if (target.kind === "array") {
          if (target.items.length > MAX_UNROLL) {
            throw new BailError();
          }
          items = target.items;
        } else {
          throw new BailError();
        }
        return {
          kind: "array",
          items: items.map((item, index) => {
            const scoped = new Map(env);
            scoped.set(expr.param.name, item);
            if (expr.indexParam) {
              scoped.set(expr.indexParam.name, {
                kind: "scalar",
                code: String(index),
              });
            }
            return this.eval(expr.body, scoped);
          }),
        };
      }
      case "arrayReduce":
        return this.evalReduce(expr, env);
      case "arrayConcat": {
        const left = this.eval(expr.left, env);
        const right = this.eval(expr.right, env);
        return {
          kind: "placeTokensConcat",
          parts: [...this.concatParts(left), ...this.concatParts(right)],
        };
      }
      case "distribution": {
        const args = expr.args.map((argument) =>
          this.scalar(this.eval(argument, env)),
        );
        // Always hoisted to a const: object identity is what makes several
        // sinks share one draw at sampling time.
        const name = this.names.allocate("__d");
        this.lines.push(
          `const ${name} = __dist.${expr.dist}(${args.join(", ")});`,
        );
        return { kind: "dist", code: name };
      }
      case "distributionMap": {
        const base = this.eval(expr.base, env);
        if (base.kind !== "dist") {
          throw new BailError();
        }
        const paramName = this.names.allocate(expr.param.name);
        const scoped = new Map(env);
        scoped.set(expr.param.name, { kind: "scalar", code: paramName });
        const body = this.evalCallbackBody(expr.body, scoped);
        const name = this.names.allocate("__d");
        this.lines.push(
          `const ${name} = __dist.map(${base.code}, (${paramName}) => ${body});`,
        );
        return { kind: "dist", code: name };
      }
    }
    throw new BailError();
  }

  /**
   * Emits a `.reduce(...)` over place token arrays (metric surface) as
   * sequential loops sharing one accumulator — token counts are dynamic, so
   * unrolling is impossible. A reduce over a concat emits one loop per part;
   * when the index parameter is used, a global running index continues
   * across parts.
   *
   * A reduce nested inside a `cond` branch is captured by the conditional
   * emitter and runs only when that branch is selected.
   */
  private evalReduce(
    expr: Extract<HirExpr, { kind: "arrayReduce" }>,
    env: Map<string, Value>,
  ): Value {
    const target = this.eval(expr.target, env);
    const parts = this.concatParts(target);
    const initial = this.scalar(this.eval(expr.initial, env));

    const accName = this.names.allocate(expr.accParam.name);
    this.lines.push(`let ${accName} = ${initial};`);
    let indexName: string | null = null;
    if (expr.indexParam) {
      indexName = this.names.allocate(expr.indexParam.name);
      this.lines.push(`let ${indexName} = 0;`);
    }

    for (const part of parts) {
      const stride = this.layoutOf(part.elements).strideBytes;
      const countName = this.names.allocate("__n");
      const baseName = this.names.allocate("__b");
      const iterName = this.names.allocate("__i");

      const scoped = new Map(env);
      scoped.set(expr.accParam.name, { kind: "scalar", code: accName });
      scoped.set(expr.param.name, {
        kind: "token",
        baseCode:
          stride === 0 ? baseName : `${baseName} + ${iterName} * ${stride}`,
        elements: part.elements,
      });
      if (expr.indexParam && indexName) {
        scoped.set(expr.indexParam.name, { kind: "scalar", code: indexName });
      }

      // Body `const` bindings (and nested reduce loops) evaluated after this
      // mark belong inside the per-iteration loop body.
      const mark = this.lines.length;
      const body = this.scalar(this.eval(expr.body, scoped));
      const bodyLines = this.lines.splice(mark);

      this.lines.push(
        `{ const ${countName} = ${this.metricCountCode(part.ordinal)}; const ${baseName} = placeOffsets[__places[${part.ordinal}]];`,
        `  for (let ${iterName} = 0; ${iterName} < ${countName}; ${iterName}++) {`,
        ...bodyLines.map((line) => `    ${line}`),
        `    ${accName} = ${body};`,
        ...(indexName ? [`    ${indexName} += 1;`] : []),
        `  }`,
        `}`,
      );
    }

    return { kind: "scalar", code: accName };
  }

  /**
   * Evaluates a distribution-map callback body to a self-contained JS body
   * (its `let` bindings must stay inside the callback, not hoisted).
   */
  private evalCallbackBody(expr: HirExpr, env: Map<string, Value>): string {
    if (expr.kind !== "let") {
      return `(${this.scalar(this.eval(expr, env))})`;
    }
    const statements: string[] = [];
    const scoped = new Map(env);
    for (const binding of expr.bindings) {
      const value = this.eval(binding.value, scoped);
      if (value.kind !== "scalar") {
        throw new BailError();
      }
      const name = this.names.allocate(binding.name);
      statements.push(`const ${name} = ${value.code};`);
      scoped.set(binding.name, { kind: "scalar", code: name });
    }
    statements.push(`return ${this.scalar(this.eval(expr.body, scoped))};`);
    return `{ ${statements.join(" ")} }`;
  }

  /** Binds a `const`: scalars and distributions become hoisted consts (so
   * they evaluate once); structural values stay symbolic. */
  hoist(name: string, value: Value): Value {
    if (value.kind === "scalar") {
      const jsName = this.names.allocate(name);
      this.lines.push(`const ${jsName} = ${value.code};`);
      return { kind: "scalar", code: jsName };
    }
    if (value.kind === "dist") {
      // Distribution constructions are already hoisted consts; a `cond` of
      // two dists is cheap to re-evaluate but must keep identity — hoist it.
      if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(value.code)) {
        const jsName = this.names.allocate(name);
        this.lines.push(`const ${jsName} = ${value.code};`);
        return { kind: "dist", code: jsName };
      }
      return value;
    }
    return value;
  }
}

function initialEnv(fn: HirFunction): Map<string, Value> {
  const env = new Map<string, Value>();
  const tokensParam = fn.params[0];
  if (tokensParam) {
    env.set(tokensParam.name, { kind: "inputRecord" });
  }
  return env;
}

function slotCount(inputSlots: HirArcSlot[]): number {
  return inputSlots.reduce((sum, slot) => sum + slot.tokenCount, 0);
}

/**
 * Emits a buffer-ABI lambda:
 *
 *   (f64, u64, u8, placeBases, indices) => number | boolean
 *
 * Reads `__params` for model parameters (bound at instantiation). Returns
 * `null` when the function shape cannot be scalarized.
 */
export function emitBufferLambdaJs(
  fn: HirFunction,
  context: HirLambdaContext,
): BufferProgram | null {
  try {
    const emitter = new BufferEmitter(context.inputSlots);
    const result = emitter.eval(foldHir(fn.body), initialEnv(fn));
    if (result.kind !== "scalar") {
      return null;
    }
    const source = [
      `(f64, u64, u8, placeBases, indices) => {`,
      ...emitter.lines.map((line) => `  ${line}`),
      `  return ${result.code};`,
      `}`,
    ].join("\n");
    return { source, inputSlotCount: slotCount(context.inputSlots) };
  } catch (error) {
    if (error instanceof BailError) {
      return null;
    }
    throw error;
  }
}

/**
 * Emits a buffer-ABI kernel (token format v2):
 *
 *   (f64, u64, u8, placeBases, indices, outF64, outU64, outU8, sink) => void
 *
 * Output attributes are written into per-transition staging bytes at
 * compile-time-constant offsets (colored output arcs place-major, tokens
 * back-to-back with baked strides). Values that consume the seeded RNG —
 * distributions, generated/converted UUIDs — are deferred through
 * `sink(kind, index, payload)`, and the emitted calls follow (arc, token,
 * element-declaration) order so the engine reproduces the exact RNG stream
 * by processing them in call order. String attributes intern through
 * `__pool` inline. Returns `null` for shapes that don't scalarize (which
 * `compileHirArtifacts` reports as a compile failure — there is no other
 * program).
 */
export function emitBufferKernelJs(
  fn: HirFunction,
  context: HirKernelContext,
): BufferKernelProgram | null {
  try {
    const emitter = new BufferEmitter(context.inputSlots);
    const result = emitter.eval(foldHir(fn.body), initialEnv(fn));
    if (result.kind !== "record") {
      return null;
    }

    const writes: string[] = [];
    let byteBase = 0;

    for (const slot of context.outputSlots) {
      const layout = computeTokenSlotLayout(
        slot.elements.map((element, index) => ({
          elementId: String(index),
          name: element.name,
          type: element.type,
        })),
      );
      const entry = result.fields.get(slot.name);
      if (!entry) {
        return null;
      }

      // Resolve the entry to one token Value per output slot position.
      let tokens: Value[];
      if (entry.kind === "array") {
        tokens = entry.items;
      } else if (entry.kind === "tokens") {
        // Whole input tuple forwarded to an output place.
        if (entry.slot.tokenCount !== slot.tokenCount) {
          return null;
        }
        tokens = Array.from({ length: entry.slot.tokenCount }, (_, index) =>
          emitter.tokenValueOf(entry.slot, index),
        );
      } else {
        return null;
      }
      if (tokens.length !== slot.tokenCount) {
        return null;
      }

      /* eslint-disable no-bitwise -- `at >> 3` converts compile-time-constant
         byte offsets of 8-aligned fields to 64-bit lane indices */
      for (const [tokenIndex, token] of tokens.entries()) {
        const tokenBase = byteBase + tokenIndex * layout.strideBytes;
        // Element declaration order — this is the engine's RNG order.
        for (const element of slot.elements) {
          const field = layout.fields.find(
            (candidate) => candidate.element.name === element.name,
          )!;
          const at = tokenBase + field.byteOffset;

          let value: Value | undefined;
          if (token.kind === "record") {
            value = token.fields.get(element.name);
          } else if (token.kind === "token") {
            value = emitter.readTokenField(token, element.name);
          } else {
            return null;
          }

          // Omitted uuid attributes auto-generate from the seeded RNG.
          if (value === undefined) {
            if (element.type === "uuid") {
              writes.push(`__sink("generate", ${at >> 3}, 0);`);
              continue;
            }
            return null;
          }

          if (value.kind === "dist") {
            if (element.type !== "real") {
              return null;
            }
            writes.push(`__sink("dist", ${at >> 3}, ${value.code});`);
            continue;
          }
          if (value.kind === "uuidSentinel") {
            writes.push(
              value.mode === "generate"
                ? `__sink("generate", ${at >> 3}, 0);`
                : `__sink("from", ${at >> 3}, ${value.code});`,
            );
            continue;
          }
          if (value.kind !== "scalar") {
            return null;
          }

          switch (element.type) {
            case "real":
              writes.push(`outF64[${at >> 3}] = ${value.code};`);
              break;
            case "integer":
              writes.push(`outF64[${at >> 3}] = Math.round(${value.code});`);
              break;
            case "boolean":
              writes.push(`outU8[${at}] = (${value.code}) ? 1 : 0;`);
              break;
            case "string":
              writes.push(
                `outU64[${at >> 3}] = BigInt(__pool.intern(${value.code}));`,
              );
              break;
            case "uuid":
              // A uuid-typed scalar is a bigint (copied from an input token)
              // or a string (converted deterministically) — defer strings.
              writes.push(`__sink("from", ${at >> 3}, ${value.code});`);
              break;
          }
        }
      }
      /* eslint-enable no-bitwise */

      byteBase += slot.tokenCount * layout.strideBytes;
    }

    const source = [
      `(f64, u64, u8, placeBases, indices, outF64, outU64, outU8, __sink) => {`,
      ...emitter.lines.map((line) => `  ${line}`),
      ...writes.map((line) => `  ${line}`),
      `}`,
    ].join("\n");
    return {
      source,
      inputSlotCount: slotCount(context.inputSlots),
      outputByteCount: byteBase,
    };
  } catch (error) {
    if (error instanceof BailError) {
      return null;
    }
    throw error;
  }
}

/**
 * Emits a buffer-ABI metric program (token format v2):
 *
 *   (f64, u64, u8, placeCounts, placeOffsets) => number
 *
 * - `f64`/`u64`/`u8` — shared views over the frame's token byte region.
 * - `placeCounts`/`placeOffsets` — the frame's dense per-place token counts
 *   and byte offsets (Monte-Carlo frame buffer / engine frame fields).
 * - `__places` (instantiation-bound `Int32Array`) maps each emitted place
 *   ordinal (see `placeNames`) to its frame place index; `__pool` resolves
 *   interned string attributes.
 *
 * `state.places.<Name>.count` reads compile to `placeCounts` lookups;
 * `.tokens` accesses index the packed token structs at compile-time-constant
 * strides/offsets; `.reduce(...)` over token arrays (or `.concat(...)`s of
 * them) compiles to loops since counts are dynamic. Returns `null` for
 * shapes that don't scalarize — `compileHirArtifacts` reports those as
 * compile failures (there is no other metric program).
 */
export function emitBufferMetricJs(
  fn: HirFunction,
  context: HirMetricContext,
): BufferMetricProgram | null {
  const stateParam = fn.params[0];
  if (!stateParam) {
    return null;
  }
  try {
    const emitter = new BufferEmitter([], context);
    const env = new Map<string, Value>();
    env.set(stateParam.name, { kind: "metricState" });
    const result = emitter.eval(foldHir(fn.body), env);
    if (result.kind !== "scalar") {
      return null;
    }
    const source = [
      `(f64, u64, u8, placeCounts, placeOffsets) => {`,
      ...emitter.lines.map((line) => `  ${line}`),
      `  return ${result.code};`,
      `}`,
    ].join("\n");
    return { source, placeNames: emitter.placeNames };
  } catch (error) {
    if (error instanceof BailError) {
      return null;
    }
    throw error;
  }
}

/**
 * Compiles a dynamics function to the buffer-native v2 shape:
 *
 *   (placeBytes: Uint8Array, numberOfTokens) => Float64Array
 *
 * Reads token attributes at packed-struct byte offsets through views created
 * once per call; derivatives are written flat as `numberOfTokens × realField`
 * in layout field order (matching `TokenSlotLayout.realFieldF64Offsets`).
 * References `__params` / `__pool`, bound at instantiation. Returns `null`
 * when the body doesn't fit the `tokens.map((token, index?) => ({ ... }))`
 * shape.
 */
export function emitBufferDynamicsJs(
  fn: HirFunction,
  elements: readonly HirTokenElementInfo[],
): string | null {
  const tokensParam = fn.params[0];
  if (!tokensParam) {
    return null;
  }
  const layout = computeTokenSlotLayout(
    elements.map((element, index) => ({
      elementId: String(index),
      name: element.name,
      type: element.type,
    })),
  );
  const realFields = layout.fields.filter(
    (field) => field.element.type === "real",
  );
  if (realFields.length === 0) {
    return null;
  }

  let body = foldHir(fn.body);
  let outerBindings: Extract<HirExpr, { kind: "let" }>["bindings"] = [];
  if (body.kind === "let") {
    outerBindings = body.bindings;
    body = body.body;
  }
  if (
    body.kind !== "arrayMap" ||
    body.target.kind !== "localRef" ||
    body.target.name !== tokensParam.name
  ) {
    return null;
  }
  const mapBody = body.body;
  const innerBindings = mapBody.kind === "let" ? mapBody.bindings : [];
  const record = mapBody.kind === "let" ? mapBody.body : mapBody;
  if (record.kind !== "recordLit") {
    return null;
  }

  try {
    const emitter = new BufferEmitter([]);
    const env = new Map<string, Value>();

    // Token-independent bindings, hoisted before the loop.
    for (const binding of outerBindings) {
      env.set(
        binding.name,
        emitter.hoist(binding.name, emitter.eval(binding.value, env)),
      );
    }
    const hoisted = [...emitter.lines];
    emitter.lines.length = 0;

    const loopEnv = new Map(env);
    loopEnv.set(body.param.name, {
      kind: "token",
      baseCode: "__b",
      elements: [...elements],
    });
    if (body.indexParam) {
      loopEnv.set(body.indexParam.name, { kind: "scalar", code: "__i" });
    }
    for (const binding of innerBindings) {
      loopEnv.set(
        binding.name,
        emitter.hoist(binding.name, emitter.eval(binding.value, loopEnv)),
      );
    }

    const writes: string[] = [];
    for (const [fieldIndex, field] of realFields.entries()) {
      const entry = record.entries.find(
        (candidate) => candidate.key === field.element.name,
      );
      // Missing real derivatives default to 0 (`out` is zero-initialised),
      // matching the object adapter's `?? 0`.
      if (!entry) {
        continue;
      }
      const value = emitter.eval(entry.value, loopEnv);
      if (value.kind !== "scalar") {
        throw new BailError();
      }
      writes.push(
        `    out[__i * ${realFields.length} + ${fieldIndex}] = ${value.code};`,
      );
    }
    const perIteration = emitter.lines;

    return [
      `(placeBytes, numberOfTokens) => {`,
      `  "use strict";`,
      `  const f64 = new Float64Array(placeBytes.buffer, placeBytes.byteOffset, placeBytes.byteLength >> 3);`,
      `  const u64 = new BigUint64Array(placeBytes.buffer, placeBytes.byteOffset, placeBytes.byteLength >> 3);`,
      `  const u8 = placeBytes;`,
      ...hoisted.map((line) => `  ${line}`),
      `  const out = new Float64Array(numberOfTokens * ${realFields.length});`,
      `  for (let __i = 0; __i < numberOfTokens; __i++) {`,
      `    const __b = __i * ${layout.strideBytes};`,
      ...perIteration.map((line) => `    ${line}`),
      ...writes,
      `  }`,
      `  return out;`,
      `}`,
    ].join("\n");
  } catch (error) {
    if (error instanceof BailError) {
      return null;
    }
    throw error;
  }
}
