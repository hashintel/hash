/**
 * Buffer-ABI JavaScript emission for lambdas and transition kernels.
 *
 * Instead of the legacy object convention (decode packed tokens into
 * `{ Place: [{ x, y }] }` records per combination, call, re-encode), the
 * emitted functions read token attributes straight out of the engine's packed
 * `Float64Array` at statically-resolved offsets:
 *
 *   lambda: (tokenValues, slotBases) => number | boolean
 *   kernel: (tokenValues, slotBases, out, distSink) => void
 *
 * - `tokenValues` — the frame's token-value region (floats).
 * - `slotBases` — one float base offset per input token slot; slots are laid
 *   out per colored non-inhibitor input arc, `weight` slots each, in arc
 *   order (see the slot layout invariant in `surface-context.ts`). The
 *   engine fills this array per enumerated combination — no allocation.
 * - `out` — kernel staging: colored output arcs in arc order, each occupying
 *   `weight * elements.length` floats (integers pre-rounded, booleans 0/1).
 * - `distSink(floatIndex, distribution)` — deferred sampling: the engine
 *   samples after the call, ordered by float index, which reproduces the
 *   legacy (place, token, element) sampling order and therefore the exact
 *   RNG stream.
 *
 * Emission works by symbolic evaluation: structural values (input tuples,
 * tokens, records, arrays) exist only at compile time; everything that
 * reaches the output is a scalar JS expression or a distribution constant.
 * `.map(...)` over token tuples is unrolled (arc weights are static).
 * Shapes the evaluator cannot scalarize return `null` — callers fall back to
 * the object-convention emitter (`emit-js.ts`).
 *
 * Only emit from functions whose typecheck produced no errors: the emitter
 * relies on attribute/place validity established by `typecheckHir`.
 */
import { computeTokenSlotLayout } from "../simulation/engine/token-layout";
import { foldHir } from "./analyze";

import type { HirExpr, HirFunction } from "./hir";
import type {
  HirArcSlot,
  HirKernelContext,
  HirLambdaContext,
  HirTokenElementInfo,
} from "./surface-context";

export type BufferProgram = {
  /** JS source of the emitted function (arrow expression). */
  source: string;
  /** Expected `slotBases.length` — engine-side sanity check. */
  inputSlotCount: number;
};

export type BufferKernelProgram = BufferProgram & {
  /** Expected `out.length` — engine-side sanity check. */
  outputFloatCount: number;
};

/** Maximum tokens per arc slot we are willing to unroll `.map` over. */
const MAX_UNROLL = 16;

const RESERVED_NAMES = [
  "f64",
  "u64",
  "u8",
  "__pool",
  "slotBases",
  "out",
  "distSink",
  "__params",
  "__dist",
  "Math",
  "Infinity",
  "NaN",
];

/** Internal bail signal: shape outside the buffer-ABI subset. */
class BailError extends Error {}

type Value =
  /** A JS expression producing a number or boolean. */
  | { kind: "scalar"; code: string }
  /** A JS expression producing a RuntimeDistribution (a hoisted const). */
  | { kind: "dist"; code: string }
  /** The lambda/kernel first parameter (`tokensByPlace`). */
  | { kind: "inputRecord" }
  /** A whole input arc slot's token tuple. */
  | { kind: "tokens"; slot: HirArcSlot }
  /** One token; `baseCode` is a JS expression for its float base offset. */
  | { kind: "token"; baseCode: string; elements: HirTokenElementInfo[] }
  | { kind: "record"; fields: Map<string, Value> }
  | { kind: "array"; items: Value[] };

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
  /** Hoisted `const` statements, in evaluation order. */
  readonly lines: string[] = [];
  readonly names = new NameAllocator(RESERVED_NAMES);

  constructor(private readonly inputSlots: HirArcSlot[]) {}

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

  private tokenOfSlot(slot: HirArcSlot, tokenIndex: number): Value {
    return {
      kind: "token",
      baseCode: `slotBases[${slot.slotStart + tokenIndex}]`,
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
  private readAttribute(
    token: Extract<Value, { kind: "token" }>,
    field: string,
  ): Value {
    const layout = computeTokenSlotLayout(
      token.elements.map((element, index) => ({
        elementId: String(index),
        name: element.name,
        type: element.type,
      })),
    );
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
      case "uuidFrom":
        // Kernel-output-only constructs; kernels don't use this emitter yet.
        throw new BailError();
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
        const index = foldHir(expr.index);
        if (index.kind !== "numberLit" || !Number.isInteger(index.value)) {
          // Dynamic token indices would read unchecked memory — leave those
          // to the object-convention fallback.
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
        return {
          kind: "scalar",
          code: `(${this.scalar(this.eval(expr.left, env))} ${op} ${this.scalar(
            this.eval(expr.right, env),
          )})`,
        };
      }
      case "cond": {
        const condition = this.scalar(this.eval(expr.condition, env));
        const thenValue = this.eval(expr.thenBranch, env);
        const elseValue = this.eval(expr.elseBranch, env);
        if (thenValue.kind === "scalar" && elseValue.kind === "scalar") {
          return {
            kind: "scalar",
            code: `(${condition} ? ${thenValue.code} : ${elseValue.code})`,
          };
        }
        if (thenValue.kind === "dist" && elseValue.kind === "dist") {
          return {
            kind: "dist",
            code: `(${condition} ? ${thenValue.code} : ${elseValue.code})`,
          };
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
 * Emits a buffer-ABI lambda: `(tokenValues, slotBases) => number | boolean`.
 * Reads `__params` for model parameters (bound at instantiation). Returns
 * `null` when the function shape needs the object-convention fallback.
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
      `(f64, u64, u8, slotBases) => {`,
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
 * Buffer-ABI kernels are not emitted yet for the packed token layout
 * (format v2): kernel outputs interleave RNG consumption (distribution
 * sampling, uuid auto-generation) and string interning in element
 * declaration order, which requires an ordinal-tagged deferred-sink design
 * to preserve the engine's RNG stream. Kernels run the object-convention
 * program meanwhile — they execute once per firing (cold) versus the
 * lambda's once per token combination (hot).
 */
export function emitBufferKernelJs(
  _fn: HirFunction,
  _context: HirKernelContext,
): BufferKernelProgram | null {
  return null;
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
 * shape (the object program runs behind the decoding adapter instead).
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
