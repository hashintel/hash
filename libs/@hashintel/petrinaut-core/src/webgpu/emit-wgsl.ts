/**
 * HIR → WGSL expression emitter.
 *
 * A second backend for the same HIR the JavaScript emitter consumes
 * (`../hir/emit-buffer-js.ts`), targeting WebGPU compute shaders. The HIR was
 * built for this: it is pure, has no recursion and no unbounded loops, and its
 * `arrayMap` lengths are statically known — all of which a shader requires.
 *
 * Two differences from the JS backend drive most of the design:
 *
 * **Everything is f32.** WGSL has no `f64` (the proposal is open but unshipped:
 * gpuweb/gpuweb#2805). HIR `real` and `integer` both live in f64 lanes on the
 * CPU, so numbers narrow here. For `real` this is usually invisible — measured
 * on logistic growth, f32 Euler tracks f64 Euler to three significant figures,
 * because integrator truncation error dwarfs rounding error. For `integer` it
 * imposes a hard exactness ceiling of 2^24 (16,777,216), above which counting
 * silently loses precision.
 *
 * **No 64-bit integers.** WGSL integers are 32-bit, so HIR `string` (a u64
 * string-pool id) and `uuid` (128-bit) have no representation. Programs touching
 * them are rejected rather than approximated.
 *
 * Unsupported shapes bail by returning `null`, matching the JS emitter's
 * contract, so the caller falls back to the CPU backend instead of failing.
 */
import { HIR_MATH_FNS } from "../hir/hir";
import { mangleWgslIdentifier } from "./wgsl-identifiers";

import type { HirExpr, HirMathFn, HirType } from "../hir/hir";

/** Thrown internally when a program cannot be expressed in WGSL. */
export class WgslBailError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "WgslBailError";
  }
}

/**
 * A WGSL value produced by emitting one HIR node.
 *
 * Mirrors the JS emitter's `Value` union, minus the cases WGSL cannot hold.
 * `record` and `array` are compile-time-only groupings that never become WGSL
 * values — they are destructured before use, exactly as the JS emitter does.
 */
export type WgslValue =
  | { kind: "f32"; code: string }
  | { kind: "bool"; code: string }
  | { kind: "record"; fields: Map<string, WgslValue> }
  | { kind: "array"; elements: WgslValue[] }
  /** One token's field accessors, resolved lazily on field access. */
  | { kind: "token"; read: (fieldName: string) => WgslValue };

/**
 * How each HIR math builtin reaches WGSL.
 *
 * Most are WGSL builtins outright. The rest are expressed exactly rather than
 * approximated, except `random`, which needs generator state and so is handled
 * by the caller.
 */
const MATH_FN_WGSL: Record<
  HirMathFn,
  | { kind: "builtin" }
  | { kind: "expr"; emit: (args: string[]) => string }
  | { kind: "rng" }
> = {
  abs: { kind: "builtin" },
  acos: { kind: "builtin" },
  asin: { kind: "builtin" },
  atan: { kind: "builtin" },
  atan2: { kind: "builtin" },
  ceil: { kind: "builtin" },
  cos: { kind: "builtin" },
  cosh: { kind: "builtin" },
  exp: { kind: "builtin" },
  floor: { kind: "builtin" },
  log: { kind: "builtin" },
  log2: { kind: "builtin" },
  max: { kind: "builtin" },
  min: { kind: "builtin" },
  pow: { kind: "builtin" },
  sign: { kind: "builtin" },
  sin: { kind: "builtin" },
  sinh: { kind: "builtin" },
  sqrt: { kind: "builtin" },
  tan: { kind: "builtin" },
  tanh: { kind: "builtin" },
  trunc: { kind: "builtin" },
  // WGSL has no cbrt. Sign is carried out of the power so negative inputs work,
  // which `pow` alone would return NaN for.
  cbrt: {
    kind: "expr",
    emit: ([x]) => `(sign(${x}) * pow(abs(${x}), 0.33333333333333331))`,
  },
  // WGSL has no hypot; vector length is the same computation with the same
  // overflow characteristics as a naive sqrt(x*x + y*y + ...).
  //
  // Every arity the typechecker allows (`hypot: { min: 1, max: Infinity }`) has
  // to be handled. Destructuring two arguments was wrong in both directions: one
  // argument left the second as JavaScript `undefined` and emitted the text
  // `undefined` into the shader, and three or more silently dropped the rest,
  // computing a 2-D distance where the CPU computed a 3-D one.
  hypot: {
    kind: "expr",
    emit: (args) => {
      const [first] = args;
      if (first === undefined) {
        throw new WgslBailError("`Math.hypot` needs at least one argument");
      }
      if (args.length === 1) {
        return `abs(${first})`;
      }
      if (args.length <= 4) {
        return `length(vec${args.length}<f32>(${args.join(", ")}))`;
      }
      // WGSL vectors stop at four components, so wider calls fold. hypot is
      // associative, and combining a running length with the next component
      // keeps the overflow behaviour of the narrow case rather than summing
      // squares directly.
      return args.reduce(
        (accumulated, argument) =>
          `length(vec2<f32>(${accumulated}, ${argument}))`,
      );
    },
  },
  // WGSL has log and log2 but not log10.
  log10: { kind: "expr", emit: ([x]) => `(log(${x}) * 0.43429448190325176)` },
  // WGSL's `round` breaks ties to even; JavaScript's Math.round rounds half
  // upward. Emitting floor(x + 0.5) keeps the JS semantics the HIR documents.
  round: { kind: "expr", emit: ([x]) => `floor(${x} + 0.5)` },
  random: { kind: "rng" },
};

/**
 * Formats an f32 literal that WGSL will parse as floating point.
 *
 * @throws WgslBailError when the value has no f32 literal form, which sends the
 *   net to the CPU rather than emitting a shader that cannot be created.
 */
export function emitF32Literal(value: number): string {
  if (!Number.isFinite(value)) {
    // This used to construct the value arithmetically — `(0.0 / 0.0)` for NaN,
    // `(1.0 / 0.0)` for an infinity. Both are shader-creation errors: the
    // operands are AbstractFloat literals, so the quotient is a const-expression
    // that must be evaluated at creation time, and AbstractFloat's value set
    // excludes NaN and the infinities. WGSL has no literal for either, and it
    // separately permits implementations to assume they never arise, so there is
    // nothing to emit here that would mean what the author wrote.
    throw new WgslBailError(
      `\`${value}\` has no WGSL representation, so this expression can only run on the CPU`,
    );
  }
  // f32 has ~9 significant decimal digits; round-tripping through Math.fround
  // makes the emitted literal exactly the value the GPU will hold.
  const narrowed = Math.fround(value);
  if (!Number.isFinite(narrowed)) {
    // Checked after narrowing as well as before: `Math.fround` overflows anything
    // beyond ~3.4e38 to an infinity, and `String(Infinity)` is the JavaScript
    // spelling `Infinity`, which WGSL would read as an undeclared identifier.
    throw new WgslBailError(
      `\`${value}\` overflows f32, the widest float WGSL has`,
    );
  }
  return Number.isInteger(narrowed) && Math.abs(narrowed) < 1e21
    ? `${narrowed}.0`
    : String(narrowed);
}

export type WgslEmitterOptions = {
  /**
   * Model parameter values, inlined as literals.
   *
   * Parameters are fixed for a run, so binding them as uniforms would cost a
   * buffer read per access for no flexibility.
   */
  parameterValues: Readonly<Record<string, number | boolean>>;
  /**
   * WGSL expression yielding the next uniform random f32 in [0, 1).
   *
   * Supplied by the caller because generator state lives in the shader's
   * stepping loop, not in the expression tree.
   */
  randomCall?: string;
  /**
   * Name of the in-scope `var<function> u32` holding the generator state, e.g.
   * `"rng_state"`.
   *
   * Supplied only when emitting a transition kernel: `typecheck.ts` reports
   * `hir:distribution-outside-kernel` anywhere else, so without this the emitter
   * keeps refusing distributions rather than silently sampling somewhere the CPU
   * would not.
   */
  rngStateVar?: string;
  /**
   * Prefix for hoisted identifiers, distinguishing this emitter's temporaries
   * from another's.
   *
   * Required when two emitters' statements are spliced into one WGSL scope,
   * because each counts its temporaries from zero and would otherwise name them
   * identically — a redeclaration the generated shader only fails on at
   * `createShaderModule`. The RK stages of a dynamics loop are the case that
   * needs it.
   */
  identifierScope?: string;
};

/**
 * Emits WGSL expressions for HIR nodes.
 *
 * Statement-shaped HIR (`let`) becomes hoisted `let` declarations in
 * `statements`, which the caller splices above the expression that uses them.
 */
export class WgslEmitter {
  readonly statements: string[] = [];
  #temporaries = 0;

  constructor(private readonly options: WgslEmitterOptions) {}

  /** Emits `value` into a named temporary so it is evaluated exactly once. */
  hoist(name: string, value: WgslValue): WgslValue {
    if (
      value.kind === "record" ||
      value.kind === "array" ||
      value.kind === "token"
    ) {
      // Compile-time groupings need no temporary; they are destructured later.
      return value;
    }
    const identifier = mangleWgslIdentifier(
      name,
      this.#temporaries++,
      this.options.identifierScope,
    );
    const type = value.kind === "bool" ? "bool" : "f32";
    this.statements.push(`let ${identifier}: ${type} = ${value.code};`);
    return { kind: value.kind, code: identifier };
  }

  /** Narrows a value to a numeric WGSL expression, or bails. */
  f32(value: WgslValue): string {
    if (value.kind === "f32") {
      return value.code;
    }
    if (value.kind === "bool") {
      return `select(0.0, 1.0, ${value.code})`;
    }
    throw new WgslBailError(
      `expected a numeric value but got a ${value.kind}, which has no WGSL representation`,
    );
  }

  /** Narrows a value to a boolean WGSL expression, or bails. */
  bool(value: WgslValue): string {
    if (value.kind === "bool") {
      return value.code;
    }
    if (value.kind === "f32") {
      return `(${value.code} != 0.0)`;
    }
    throw new WgslBailError(`expected a boolean value but got a ${value.kind}`);
  }

  /**
   * Emits one HIR node.
   *
   * @throws WgslBailError when the node has no WGSL representation.
   */
  emit(expr: HirExpr, env: ReadonlyMap<string, WgslValue>): WgslValue {
    const kind = expr.kind;
    switch (expr.kind) {
      case "numberLit":
        return { kind: "f32", code: emitF32Literal(expr.value) };

      case "boolLit":
        return { kind: "bool", code: expr.value ? "true" : "false" };

      case "constant":
        switch (expr.name) {
          case "PI":
            return { kind: "f32", code: emitF32Literal(Math.PI) };
          case "E":
            return { kind: "f32", code: emitF32Literal(Math.E) };
          case "Infinity":
            return { kind: "f32", code: "(1.0 / 0.0)" };
          case "NaN":
            return { kind: "f32", code: "(0.0 / 0.0)" };
        }
        break;

      case "localRef": {
        const bound = env.get(expr.name);
        if (!bound) {
          throw new WgslBailError(`unbound local \`${expr.name}\``);
        }
        return bound;
      }

      case "paramRef": {
        const value = this.options.parameterValues[expr.name];
        if (value === undefined) {
          throw new WgslBailError(`unknown parameter \`${expr.name}\``);
        }
        return typeof value === "boolean"
          ? { kind: "bool", code: value ? "true" : "false" }
          : { kind: "f32", code: emitF32Literal(value) };
      }

      case "fieldAccess": {
        const target = this.emit(expr.target, env);
        if (target.kind === "token") {
          return target.read(expr.field);
        }
        if (target.kind === "record") {
          const field = target.fields.get(expr.field);
          if (!field) {
            throw new WgslBailError(`unknown field \`${expr.field}\``);
          }
          return field;
        }
        throw new WgslBailError(
          `field access on a ${target.kind}, which has no fields`,
        );
      }

      case "indexAccess": {
        const target = this.emit(expr.target, env);
        if (target.kind !== "array") {
          throw new WgslBailError("index access on a non-array");
        }
        // Only statically-known indices work: a shader cannot index a
        // compile-time tuple dynamically.
        const index = this.#constantIndex(expr.index, env);
        const element = target.elements[index];
        if (!element) {
          throw new WgslBailError(`array index ${index} out of range`);
        }
        return element;
      }

      case "length": {
        const target = this.emit(expr.target, env);
        if (target.kind !== "array") {
          throw new WgslBailError("`.length` on a non-array");
        }
        return { kind: "f32", code: emitF32Literal(target.elements.length) };
      }

      case "unary": {
        const operand = this.emit(expr.operand, env);
        switch (expr.op) {
          case "-":
            return { kind: "f32", code: `(-${this.f32(operand)})` };
          case "+":
            return { kind: "f32", code: this.f32(operand) };
          case "!":
            return { kind: "bool", code: `(!${this.bool(operand)})` };
        }
        break;
      }

      case "binary":
        return this.#emitBinary(expr, env);

      case "cond": {
        const condition = this.bool(this.emit(expr.condition, env));
        const thenValue = this.emit(expr.thenBranch, env);
        const elseValue = this.emit(expr.elseBranch, env);
        // WGSL `select` evaluates both arms, which is safe because the HIR is
        // pure — no side effects, and the only divergence risk is arithmetic
        // that would produce NaN/Inf in the untaken branch and then be
        // discarded, which `select` handles correctly.
        if (thenValue.kind === "bool" && elseValue.kind === "bool") {
          return {
            kind: "bool",
            code: `select(${elseValue.code}, ${thenValue.code}, ${condition})`,
          };
        }
        return {
          kind: "f32",
          code: `select(${this.f32(elseValue)}, ${this.f32(thenValue)}, ${condition})`,
        };
      }

      case "let": {
        const scope = new Map(env);
        for (const binding of expr.bindings) {
          scope.set(
            binding.name,
            this.hoist(binding.name, this.emit(binding.value, scope)),
          );
        }
        return this.emit(expr.body, scope);
      }

      case "mathCall":
        return this.#emitMathCall(expr, env);

      case "recordLit": {
        const fields = new Map<string, WgslValue>();
        for (const entry of expr.entries) {
          fields.set(entry.key, this.emit(entry.value, env));
        }
        return { kind: "record", fields };
      }

      case "arrayLit":
        return {
          kind: "array",
          elements: expr.elements.map((element) => this.emit(element, env)),
        };

      case "arrayMap": {
        const target = this.emit(expr.target, env);
        if (target.kind !== "array") {
          throw new WgslBailError(
            "`.map` over a value with no statically-known length",
          );
        }
        // Unrolled, exactly as the JS buffer emitter does for token tuples.
        return {
          kind: "array",
          elements: target.elements.map((element, index) => {
            const scope = new Map(env);
            scope.set(expr.param.name, element);
            if (expr.indexParam) {
              scope.set(expr.indexParam.name, {
                kind: "f32",
                code: emitF32Literal(index),
              });
            }
            return this.emit(expr.body, scope);
          }),
        };
      }

      case "arrayConcat": {
        const left = this.emit(expr.left, env);
        const right = this.emit(expr.right, env);
        if (left.kind !== "array" || right.kind !== "array") {
          throw new WgslBailError("`.concat` on a non-array");
        }
        return {
          kind: "array",
          elements: [...left.elements, ...right.elements],
        };
      }

      case "arrayReduce": {
        const target = this.emit(expr.target, env);
        if (target.kind !== "array") {
          // Metric reduces run over runtime token counts, which cannot be
          // unrolled. Those stay on the CPU.
          throw new WgslBailError(
            "`.reduce` over a value with no statically-known length",
          );
        }
        let accumulator = this.emit(expr.initial, env);
        for (const [index, element] of target.elements.entries()) {
          const scope = new Map(env);
          scope.set(expr.accParam.name, accumulator);
          scope.set(expr.param.name, element);
          if (expr.indexParam) {
            scope.set(expr.indexParam.name, {
              kind: "f32",
              code: emitF32Literal(index),
            });
          }
          accumulator = this.hoist("acc", this.emit(expr.body, scope));
        }
        return accumulator;
      }

      case "stringLit":
      case "stringCall":
        throw new WgslBailError(
          "string values need a 64-bit string-pool id, and WGSL integers are 32-bit",
        );

      case "uuidGenerate":
      case "uuidFrom":
        throw new WgslBailError(
          "uuid values are 128-bit, which WGSL cannot represent",
        );

      case "distribution": {
        const rngStateVar = this.options.rngStateVar;
        if (rngStateVar === undefined) {
          throw new WgslBailError(
            "probability distributions are only supported in transition kernels",
          );
        }
        if (expr.args.length !== 2) {
          // Typecheck already reports arity, so this only guards malformed HIR.
          throw new WgslBailError(
            `${expr.dist} needs exactly two arguments, got ${expr.args.length}`,
          );
        }
        const args = expr.args.map((argument) =>
          this.f32(this.emit(argument, env)),
        );
        // Hoisted, not inlined: the CPU caches a distribution's draw on the
        // object so sibling `.map()` calls over the same distribution see one
        // coherent sample. A `let` gives the same sharing, because a `let`-bound
        // distribution resolves to this same name at every use.
        return this.hoist(`dist_${expr.dist}`, {
          kind: "f32",
          code: `sample_${expr.dist}(&${rngStateVar}, ${args.join(", ")})`,
        });
      }
      case "distributionMap": {
        // `.map` is eager here where the CPU is lazy, so a distribution built and
        // never used still advances the generator. The two backends' streams
        // already differ by design, and the sampled *distribution* is unchanged.
        const base = this.emit(expr.base, env);
        const inner = new Map(env);
        inner.set(expr.param.name, base);
        return this.emit(expr.body, inner);
      }
    }

    // Reached only when an inner switch falls through (`constant`, `unary`),
    // which the outer switch's exhaustiveness hides from narrowing.
    throw new WgslBailError(`unsupported HIR node \`${kind}\``);
  }

  #emitBinary(
    expr: Extract<HirExpr, { kind: "binary" }>,
    env: ReadonlyMap<string, WgslValue>,
  ): WgslValue {
    const left = this.emit(expr.left, env);
    const right = this.emit(expr.right, env);

    switch (expr.op) {
      case "+":
      case "-":
      case "*":
        return {
          kind: "f32",
          code: `(${this.f32(left)} ${expr.op} ${this.f32(right)})`,
        };
      case "/":
        // WGSL division by zero is implementation-defined rather than the
        // Infinity JavaScript produces, so it is not special-cased here; models
        // relying on division by zero are outside what this backend reproduces.
        return {
          kind: "f32",
          code: `(${this.f32(left)} / ${this.f32(right)})`,
        };
      case "%":
        // JS `%` keeps the sign of the dividend, and so does WGSL's `%` on
        // floats, so this maps directly.
        return {
          kind: "f32",
          code: `(${this.f32(left)} % ${this.f32(right)})`,
        };
      case "**":
        return {
          kind: "f32",
          code: `pow(${this.f32(left)}, ${this.f32(right)})`,
        };
      case "<":
      case "<=":
      case ">":
      case ">=":
        return {
          kind: "bool",
          code: `(${this.f32(left)} ${expr.op} ${this.f32(right)})`,
        };
      case "==":
      case "!=": {
        const operator = expr.op === "==" ? "==" : "!=";
        if (left.kind === "bool" && right.kind === "bool") {
          return {
            kind: "bool",
            code: `(${left.code} ${operator} ${right.code})`,
          };
        }
        return {
          kind: "bool",
          code: `(${this.f32(left)} ${operator} ${this.f32(right)})`,
        };
      }
      case "&&":
        return {
          kind: "bool",
          code: `(${this.bool(left)} && ${this.bool(right)})`,
        };
      case "||":
        return {
          kind: "bool",
          code: `(${this.bool(left)} || ${this.bool(right)})`,
        };
    }
  }

  #emitMathCall(
    expr: Extract<HirExpr, { kind: "mathCall" }>,
    env: ReadonlyMap<string, WgslValue>,
  ): WgslValue {
    const mapping = MATH_FN_WGSL[expr.fn];

    if (mapping.kind === "rng") {
      if (!this.options.randomCall) {
        throw new WgslBailError(
          "`Math.random` is not available in this shader surface",
        );
      }
      return { kind: "f32", code: this.options.randomCall };
    }

    const args = expr.args.map((argument) =>
      this.f32(this.emit(argument, env)),
    );

    if (mapping.kind === "builtin") {
      // `min`/`max` are variadic in JavaScript but binary in WGSL, so they are
      // folded left-to-right.
      if ((expr.fn === "min" || expr.fn === "max") && args.length !== 2) {
        if (args.length === 0) {
          // Math.min() is Infinity, Math.max() is -Infinity.
          return {
            kind: "f32",
            code: expr.fn === "min" ? "(1.0 / 0.0)" : "(-1.0 / 0.0)",
          };
        }
        return {
          kind: "f32",
          code: args.reduce(
            (accumulator, argument) =>
              `${expr.fn}(${accumulator}, ${argument})`,
          ),
        };
      }
      return { kind: "f32", code: `${expr.fn}(${args.join(", ")})` };
    }

    return { kind: "f32", code: mapping.emit(args) };
  }

  /** Resolves a statically-known array index, or bails. */
  #constantIndex(expr: HirExpr, env: ReadonlyMap<string, WgslValue>): number {
    if (expr.kind === "numberLit") {
      return expr.value;
    }
    // The JS emitter folds constants before emitting; anything still dynamic
    // here cannot index a compile-time tuple.
    const value = this.emit(expr, env);
    const literal = /^-?\d+(?:\.0)?$/u.exec(
      value.kind === "f32" ? value.code : "",
    );
    if (literal) {
      return Number.parseFloat(literal[0]);
    }
    throw new WgslBailError(
      "dynamic index into transition input tokens is not supported",
    );
  }
}

/** Every HIR math builtin, with how it reaches WGSL. Exposed for tests/docs. */
export function describeMathFnSupport(): {
  fn: HirMathFn;
  support: "builtin" | "polyfill" | "rng";
}[] {
  return HIR_MATH_FNS.map((fn) => {
    const mapping = MATH_FN_WGSL[fn];
    return {
      fn,
      support:
        mapping.kind === "builtin"
          ? "builtin"
          : mapping.kind === "rng"
            ? "rng"
            : "polyfill",
    };
  });
}

/** HIR types this backend can represent. */
export function isWgslRepresentableType(type: HirType): boolean {
  switch (type.kind) {
    case "real":
    case "int":
    case "bool":
      return true;
    case "record":
      return type.fields.every((field) => isWgslRepresentableType(field.type));
    case "array":
      return type.length !== undefined && isWgslRepresentableType(type.element);
    case "string":
    case "uuid":
    case "distribution":
    case "unknown":
      return false;
  }
}
