import { describe, expect, it } from "vitest";

import { HIR_MATH_FNS } from "../hir/hir";
import { lowerTypeScriptToHir } from "../hir/lower-typescript";
import {
  describeMathFnSupport,
  emitF32Literal,
  isWgslRepresentableType,
  WgslBailError,
  WgslEmitter,
} from "./emit-wgsl";

import type { HirFunction } from "../hir/hir";
import type { WgslValue } from "./emit-wgsl";

/** Lowers a lambda body so tests exercise real HIR rather than hand-built trees. */
function lowerLambda(code: string): HirFunction {
  const result = lowerTypeScriptToHir(code, "lambda");
  if (!result.ok) {
    throw new Error(
      `test lambda did not lower: ${result.diagnostics.map((d) => d.message).join("; ")}`,
    );
  }
  return result.fn;
}

function emit(
  code: string,
  {
    parameterValues = {},
    tokens = [],
  }: {
    parameterValues?: Record<string, number | boolean>;
    tokens?: WgslValue[];
  } = {},
): { statements: string[]; code: string } {
  const fn = lowerLambda(code);
  const emitter = new WgslEmitter({
    parameterValues,
    randomCall: "rng_next_f32(&rng)",
  });
  const env = new Map<string, WgslValue>();
  const tokensParam = fn.params[0];
  if (tokensParam) {
    env.set(tokensParam.name, { kind: "array", elements: tokens });
  }
  const value = emitter.emit(fn.body, env);
  return { statements: emitter.statements, code: emitter.f32(value) };
}

describe("emitF32Literal", () => {
  it("always emits something WGSL parses as floating point", () => {
    expect(emitF32Literal(1)).toBe("1.0");
    expect(emitF32Literal(0)).toBe("0.0");
    expect(emitF32Literal(-3)).toBe("-3.0");
    expect(emitF32Literal(0.5)).toBe("0.5");
  });

  it("narrows to the value the GPU will actually hold", () => {
    // 0.1 is not representable in f32; the literal must be the f32 neighbour so
    // host and device agree on the constant.
    expect(emitF32Literal(0.1)).toBe("0.10000000149011612");
  });

  it("refuses non-finite values rather than dividing by zero to build them", () => {
    // This used to emit `(0.0 / 0.0)` and `(±1.0 / 0.0)`. Both are
    // shader-creation errors, not values: the operands are AbstractFloat
    // literals, so the quotient is a const-expression WGSL must evaluate when
    // the module is created, and AbstractFloat cannot hold NaN or an infinity.
    // `Infinity` is the spelling the product's own AI guidance suggests for a
    // rate that always fires, so this was reachable from ordinary authoring.
    for (const value of [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    ]) {
      expect(() => emitF32Literal(value)).toThrow(/no WGSL representation/);
    }
  });

  it("refuses a finite value that overflows f32 instead of emitting `Infinity`", () => {
    // The non-finite guard runs on the input, but `Math.fround` overflows
    // anything past ~3.4e38 to an infinity, and `String(Infinity)` is the
    // JavaScript spelling — which WGSL reads as an undeclared identifier. So the
    // check has to happen after narrowing too.
    expect(() => emitF32Literal(1e300)).toThrow(/overflows f32/);
    expect(() => emitF32Literal(-3.5e38)).toThrow(/overflows f32/);
    // Just inside the range still emits a literal.
    // Narrowed to its f32 neighbour, as every in-range literal is.
    expect(emitF32Literal(3.4e38)).toBe("3.3999999521443642e+38");
  });
});

describe("WgslEmitter", () => {
  it("inlines parameters as literals rather than buffer reads", () => {
    const result = emit(
      "export default Lambda((tokens, parameters) => parameters.rate);",
      {
        parameterValues: { rate: 2.5 },
      },
    );

    expect(result.code).toBe("2.5");
  });

  it("emits arithmetic and comparison operators", () => {
    const result = emit(
      "export default Lambda((tokens, parameters) => parameters.a * 2 + parameters.b / 4);",
      { parameterValues: { a: 3, b: 8 } },
    );

    expect(result.code).toBe("((3.0 * 2.0) + (8.0 / 4.0))");
  });

  it("maps `**` to pow, which WGSL has no operator for", () => {
    const result = emit(
      "export default Lambda((tokens, parameters) => parameters.a ** 3);",
      { parameterValues: { a: 2 } },
    );

    expect(result.code).toBe("pow(2.0, 3.0)");
  });

  it("emits conditionals as `select`, which is branchless", () => {
    const result = emit(
      "export default Lambda((tokens, parameters) => parameters.a > 1 ? 10 : 20);",
      { parameterValues: { a: 2 } },
    );

    expect(result.code).toBe("select(20.0, 10.0, (2.0 > 1.0))");
  });

  it("hoists `const` bindings so each is evaluated once", () => {
    const result = emit(
      `export default Lambda((tokens, parameters) => {
         const base = parameters.a * 2;
         return base + base;
       });`,
      { parameterValues: { a: 4 } },
    );

    expect(result.statements).toHaveLength(1);
    expect(result.statements[0]).toMatch(
      /^let u_0_base: f32 = \(4\.0 \* 2\.0\);$/,
    );
    // Both uses reference the temporary, not a duplicated expression.
    expect(result.code).toBe("(u_0_base + u_0_base)");
  });

  it("routes `Math.random` through the caller's generator", () => {
    const result = emit(
      "export default Lambda((tokens, parameters) => Math.random() * parameters.a);",
      { parameterValues: { a: 1 } },
    );

    expect(result.code).toContain("rng_next_f32(&rng)");
  });

  it("polyfills the math builtins WGSL lacks, exactly", () => {
    expect(
      emit(
        "export default Lambda((tokens, parameters) => Math.log10(parameters.a));",
        {
          parameterValues: { a: 100 },
        },
      ).code,
    ).toBe("(log(100.0) * 0.43429448190325176)");

    // JS Math.round rounds half up; WGSL's `round` breaks ties to even.
    expect(
      emit(
        "export default Lambda((tokens, parameters) => Math.round(parameters.a));",
        {
          parameterValues: { a: 1.5 },
        },
      ).code,
    ).toBe("floor(1.5 + 0.5)");

    // pow() alone returns NaN for a negative base, so the sign is carried out.
    expect(
      emit(
        "export default Lambda((tokens, parameters) => Math.cbrt(parameters.a));",
        {
          parameterValues: { a: -8 },
        },
      ).code,
    ).toContain("sign(-8.0)");
  });

  it("folds variadic min/max into WGSL's binary form", () => {
    const result = emit(
      "export default Lambda((tokens, parameters) => Math.max(parameters.a, parameters.b, 7));",
      { parameterValues: { a: 1, b: 2 } },
    );

    expect(result.code).toBe("max(max(1.0, 2.0), 7.0)");
  });

  it("refuses string values, which need a 64-bit pool id", () => {
    expect(() =>
      emit(
        'export default Lambda((tokens, parameters) => "x" === "y" ? 1 : 0);',
      ),
    ).toThrow(WgslBailError);
  });

  it("refuses a distribution outside a kernel", () => {
    expect(() =>
      emit(
        "export default Lambda((tokens, parameters) => Distribution.Gaussian(0, 1));",
      ),
    ).toThrow(WgslBailError);
  });

  it("covers every HIR math builtin with a stated strategy", () => {
    const support = describeMathFnSupport();

    expect(support).toHaveLength(HIR_MATH_FNS.length);
    expect(
      support.filter((entry) => entry.support === "builtin").length,
    ).toBeGreaterThan(15);
    // `random` is the only one needing generator state.
    expect(support.filter((entry) => entry.support === "rng")).toStrictEqual([
      { fn: "random", support: "rng" },
    ]);
  });
});

describe("isWgslRepresentableType", () => {
  it("accepts the numeric and boolean types", () => {
    expect(isWgslRepresentableType({ kind: "real" })).toBe(true);
    expect(isWgslRepresentableType({ kind: "int" })).toBe(true);
    expect(isWgslRepresentableType({ kind: "bool" })).toBe(true);
  });

  it("rejects what 32-bit WGSL cannot hold", () => {
    expect(isWgslRepresentableType({ kind: "string" })).toBe(false);
    expect(isWgslRepresentableType({ kind: "uuid" })).toBe(false);
    expect(isWgslRepresentableType({ kind: "distribution" })).toBe(false);
    expect(isWgslRepresentableType({ kind: "unknown" })).toBe(false);
  });

  it("rejects an array with no statically-known length", () => {
    expect(
      isWgslRepresentableType({ kind: "array", element: { kind: "real" } }),
    ).toBe(false);
    expect(
      isWgslRepresentableType({
        kind: "array",
        element: { kind: "real" },
        length: 3,
      }),
    ).toBe(true);
  });
});

/**
 * Distributions are kernel-only — `typecheck.ts` reports
 * `hir:distribution-outside-kernel` anywhere else — so these lower a kernel and
 * pass `rngStateVar`, which is what tells the emitter it is in a kernel.
 */
describe("WgslEmitter distributions", () => {
  function emitKernel(
    code: string,
    { rngStateVar = "rng_state" }: { rngStateVar?: string } = {},
  ): { statements: string[]; code: string } {
    const result = lowerTypeScriptToHir(code, "kernel");
    if (!result.ok) {
      throw new Error(
        `test kernel did not lower: ${result.diagnostics
          .map((diagnostic) => diagnostic.message)
          .join("; ")}`,
      );
    }
    const emitter = new WgslEmitter({ parameterValues: {}, rngStateVar });
    const value = emitter.emit(result.fn.body, new Map<string, WgslValue>());
    return { statements: emitter.statements, code: emitter.f32(value) };
  }

  it("samples each family through the prelude's helpers", () => {
    for (const [source, expected] of [
      ["Distribution.Gaussian(1, 2)", "sample_gaussian(&rng_state, 1.0, 2.0)"],
      ["Distribution.Uniform(0, 10)", "sample_uniform(&rng_state, 0.0, 10.0)"],
      [
        "Distribution.Lognormal(0, 1)",
        "sample_lognormal(&rng_state, 0.0, 1.0)",
      ],
    ] as const) {
      const { statements } = emitKernel(
        `export default TransitionKernel(() => ${source}.map((v) => v))`,
      );
      expect(statements.join("\n")).toContain(expected);
    }
  });

  it("draws once per distribution, so sibling maps stay coherent", () => {
    // The CPU caches the draw on the distribution object precisely so that two
    // `.map()`s over the same distribution see one sample.
    //
    // What guarantees it here is the `let` binding, which the emitter already
    // hoists — a distribution can only be reached twice by being bound, since two
    // inline `Distribution.Gaussian(...)` calls are two HIR nodes and should draw
    // twice. Hoisting the sample as well is belt-and-braces, and keeps one named
    // `let` per draw in the generated WGSL.
    const { statements, code } = emitKernel(`
      export default TransitionKernel(() => {
        const shared = Distribution.Gaussian(0, 1);
        return shared.map((v) => v) + shared.map((v) => v * 2);
      })
    `);

    const draws = statements.filter((statement) =>
      statement.includes("sample_gaussian("),
    );
    expect(draws).toHaveLength(1);
    // Both uses read the hoisted name rather than re-sampling.
    expect(code).not.toContain("sample_gaussian(");
  });

  it("applies the map body to the sampled value", () => {
    const { code, statements } = emitKernel(
      "export default TransitionKernel(() => Distribution.Uniform(0, 1).map((v) => v * 100))",
    );

    expect(statements.join("\n")).toContain("sample_uniform(&rng_state");
    expect(code).toMatch(/\* 100\.0/);
  });

  it("still refuses distributions when no generator is in scope", () => {
    // Which is every surface except a kernel — matching where the CPU allows
    // them. Built directly rather than through the helper, whose default would
    // put `rngStateVar` back.
    const lowered = lowerTypeScriptToHir(
      "export default TransitionKernel(() => Distribution.Gaussian(0, 1).map((v) => v))",
      "kernel",
    );
    if (!lowered.ok) {
      throw new Error("test kernel did not lower");
    }
    const emitter = new WgslEmitter({ parameterValues: {} });

    expect(() =>
      emitter.emit(lowered.fn.body, new Map<string, WgslValue>()),
    ).toThrow(WgslBailError);
  });
});

describe("Math.hypot arity", () => {
  const hypotOf = (expression: string) =>
    emit(`export default Lambda((tokens, parameters) => ${expression});`, {
      parameterValues: { rate: 0.5 },
    }).code;

  it("emits the absolute value for one argument", () => {
    // `hypot: { min: 1, max: Infinity }` in the typechecker, but the emitter
    // destructured exactly two arguments — so one argument left the second as
    // JavaScript `undefined` and emitted the text `undefined` into the shader.
    expect(hypotOf("Math.hypot(parameters.rate)")).toBe("abs(0.5)");
  });

  it("widens the vector rather than dropping arguments past the second", () => {
    // Three arguments used to compute a 2-D distance while the CPU computed a
    // 3-D one: valid WGSL, no error, and agreement with the CPU on nothing.
    // `Math.hypot(dx, dy, dz)` is the natural spelling in the orbital models
    // this backend exists for.
    expect(hypotOf("Math.hypot(parameters.rate, parameters.rate, 3)")).toBe(
      "length(vec3<f32>(0.5, 0.5, 3.0))",
    );
    expect(
      hypotOf("Math.hypot(parameters.rate, 1, 2, 3)"),
    ).toBe("length(vec4<f32>(0.5, 1.0, 2.0, 3.0))");
  });

  it("folds past four arguments, since WGSL vectors stop at four components", () => {
    // `vec5<f32>` does not exist. hypot is associative, so a running length
    // gives the same answer with the same overflow behaviour.
    expect(hypotOf("Math.hypot(parameters.rate, 1, 2, 3, 4)")).toBe(
      "length(vec2<f32>(length(vec2<f32>(length(vec2<f32>(length(vec2<f32>(0.5, 1.0)), 2.0)), 3.0)), 4.0))",
    );
  });

  it("still emits the plain two-argument form", () => {
    expect(hypotOf("Math.hypot(parameters.rate, 1)")).toBe(
      "length(vec2<f32>(0.5, 1.0))",
    );
  });
});
