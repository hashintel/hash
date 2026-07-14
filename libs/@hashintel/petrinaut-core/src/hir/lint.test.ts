import { describe, expect, it } from "vitest";

import { lintHirUserCode } from "./lint";

import type {
  HirDynamicsContext,
  HirKernelContext,
  HirLambdaContext,
  HirMetricContext,
} from "./surface-context";

const dynamicsContext: HirDynamicsContext = {
  surface: "dynamics",
  parameters: [{ name: "g", type: "real" }],
  elements: [
    { name: "x", type: "real" },
    { name: "v", type: "real" },
    { name: "count", type: "integer" },
    { name: "alive", type: "boolean" },
  ],
};

const poolBinding = {
  name: "Pool",
  colorId: "color-1",
  elements: [
    { name: "x", type: "real" as const },
    { name: "alive", type: "boolean" as const },
  ],
  tokenCount: 2,
};

const outBinding = {
  name: "Out",
  colorId: "color-2",
  elements: [
    { name: "x", type: "real" as const },
    { name: "count", type: "integer" as const },
  ],
  tokenCount: 1,
};

const lambdaContext: HirLambdaContext = {
  surface: "lambda",
  parameters: [{ name: "rate", type: "real" }],
  inputPlaces: [poolBinding],
  inputSlots: [{ ...poolBinding, slotStart: 0 }],
  lambdaType: "stochastic",
};

const kernelContext: HirKernelContext = {
  surface: "kernel",
  parameters: [{ name: "sigma", type: "real" }],
  inputPlaces: lambdaContext.inputPlaces,
  inputSlots: lambdaContext.inputSlots,
  outputPlaces: [outBinding],
  outputSlots: [{ ...outBinding, slotStart: 0 }],
  stochasticity: true,
};

function codes(code: string, context: Parameters<typeof lintHirUserCode>[1]) {
  return lintHirUserCode(code, context).diagnostics.map((diagnostic) => [
    diagnostic.code,
    diagnostic.severity,
  ]);
}

describe("lintHirUserCode", () => {
  it("returns no diagnostics for the default templates", () => {
    expect(
      codes(
        `export default Dynamics((tokens, parameters) => {
  return tokens.map(({ x, v }) => {
    return { x: 1, v: 1 };
  });
});`,
        dynamicsContext,
      ),
    ).toEqual([]);
    expect(
      codes(
        `export default Lambda((input, parameters) => 1.0);`,
        lambdaContext,
      ),
    ).toEqual([]);
    expect(
      codes(
        `export default TransitionKernel((input, parameters) => ({
  Out: [{ x: 0, count: 0 }],
}));`,
        kernelContext,
      ),
    ).toEqual([]);
  });

  it("reports out-of-subset code as an error by default", () => {
    const result = lintHirUserCode(
      `export default Lambda((input) => { let x = 1; return x; });`,
      lambdaContext,
    );
    expect(result.fn).toBeUndefined();
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]!.severity).toBe("error");
    expect(result.diagnostics[0]!.message).toContain(
      "restricted TypeScript subset",
    );
  });

  it("downgrades out-of-subset code to the configured severity", () => {
    const result = lintHirUserCode(
      `export default Lambda((input) => { let x = 1; return x; });`,
      lambdaContext,
      { subsetSeverity: "info" },
    );
    expect(result.diagnostics[0]!.severity).toBe("info");
  });

  it("keeps real errors (unknown identifier) as errors when lowering fails", () => {
    const result = lintHirUserCode(
      `export default Lambda((input) => nonsense + 1);`,
      lambdaContext,
    );
    expect(result.diagnostics[0]!.code).toBe("hir:unknown-identifier");
    expect(result.diagnostics[0]!.severity).toBe("error");
  });

  describe("typecheck rules", () => {
    it("flags derivatives on discrete attributes with a friendly message", () => {
      const code = `export default Dynamics((tokens, parameters) => {
  return tokens.map(({ x }) => {
    return { x: 1, count: 1 };
  });
});`;
      const result = lintHirUserCode(code, dynamicsContext);
      const diagnostic = result.diagnostics.find(
        (candidate) => candidate.code === "hir:discrete-derivative",
      )!;
      expect(diagnostic.message).toContain("count");
      expect(diagnostic.message).toContain("integer");
      expect(
        code.slice(
          diagnostic.span.start,
          diagnostic.span.start + diagnostic.span.length,
        ),
      ).toBe("count");
    });

    it("flags unknown token attributes at the field span", () => {
      const code = `export default Lambda((input, parameters) => input.Pool[0].missing > 0);`;
      const result = lintHirUserCode(code, lambdaContext);
      const diagnostic = result.diagnostics.find(
        (candidate) => candidate.code === "hir:unknown-field",
      )!;
      expect(
        code.slice(
          diagnostic.span.start,
          diagnostic.span.start + diagnostic.span.length,
        ),
      ).toBe("missing");
    });

    it("flags unknown parameters and places", () => {
      expect(
        codes(
          `export default Lambda((input, parameters) => parameters.nope);`,
          lambdaContext,
        ),
      ).toContainEqual(["hir:unknown-parameter", "error"]);
      expect(
        codes(
          `export default Lambda((input, parameters) => input.Nowhere[0].x);`,
          lambdaContext,
        ),
      ).toContainEqual(["hir:unknown-field", "error"]);
    });

    it("flags out-of-bounds token indices (arc weight)", () => {
      expect(
        codes(
          `export default Lambda((input, parameters) => input.Pool[2].x);`,
          lambdaContext,
        ),
      ).toContainEqual(["hir:index-out-of-bounds", "error"]);
    });

    it("flags Distribution into a discrete attribute (H-6519 rule)", () => {
      expect(
        codes(
          `export default TransitionKernel((input, parameters) => ({
  Out: [{ x: 0, count: Distribution.Gaussian(0, 1) }],
}));`,
          kernelContext,
        ),
      ).toContainEqual(["hir:distribution-discrete-attribute", "error"]);
    });

    it("flags distributions outside kernels", () => {
      expect(
        codes(
          `export default Lambda((input, parameters) => {
  const d = Distribution.Gaussian(0, 1);
  return 1.0;
});`,
          lambdaContext,
        ),
      ).toContainEqual(["hir:distribution-outside-kernel", "error"]);
    });

    it("flags unknown output places and token count mismatches", () => {
      const results = codes(
        `export default TransitionKernel((input, parameters) => ({
  Elsewhere: [{ x: 0 }],
  Out: [{ x: 0, count: 0 }, { x: 1, count: 0 }],
}));`,
        kernelContext,
      );
      expect(results).toContainEqual(["hir:unknown-output-place", "error"]);
      expect(results).toContainEqual(["hir:output-token-count", "error"]);
    });

    it("flags missing attributes in kernel outputs", () => {
      expect(
        codes(
          `export default TransitionKernel((input, parameters) => ({
  Out: [{ x: 0 }],
}));`,
          kernelContext,
        ),
      ).toContainEqual(["hir:missing-attribute", "error"]);
    });

    it("flags predicate/stochastic return type mismatches", () => {
      expect(
        codes(`export default Lambda((input, parameters) => true);`, {
          ...lambdaContext,
          lambdaType: "stochastic",
        }),
      ).toContainEqual(["hir:lambda-return", "error"]);
      expect(
        codes(`export default Lambda((input, parameters) => 1);`, {
          ...lambdaContext,
          lambdaType: "predicate",
        }),
      ).toContainEqual(["hir:lambda-return", "error"]);
    });
  });

  describe("semantic rules", () => {
    it("reports buffer emission failures for every runtime surface", () => {
      expect(
        codes(
          `export default Dynamics((tokens) => [{ x: 1, v: 1 }]);`,
          dynamicsContext,
        ),
      ).toContainEqual(["hir:not-compilable", "error"]);

      const dynamicIndexLambdaContext: HirLambdaContext = {
        ...lambdaContext,
        parameters: [
          ...lambdaContext.parameters,
          { name: "index", type: "integer" },
        ],
      };
      expect(
        codes(
          `export default Lambda((input, parameters) => input.Pool[parameters.index].x);`,
          dynamicIndexLambdaContext,
        ),
      ).toContainEqual(["hir:not-compilable", "error"]);

      expect(
        codes(
          `export default TransitionKernel((input, parameters) => ({
  Out: [{ x: input.Pool[parameters.index].x, count: 0 }],
}));`,
          {
            ...kernelContext,
            parameters: [
              ...kernelContext.parameters,
              { name: "index", type: "integer" },
            ],
          },
        ),
      ).toContainEqual(["hir:not-compilable", "error"]);
    });

    it("warns on Math.random", () => {
      expect(
        codes(
          `export default Lambda((input, parameters) => Math.random());`,
          lambdaContext,
        ),
      ).toContainEqual(["hir:math-random", "warning"]);
    });

    it("warns when a transition can never fire", () => {
      expect(
        codes(
          `export default Lambda((input, parameters) => 2 - 2);`,
          lambdaContext,
        ),
      ).toContainEqual(["hir:transition-never-fires", "warning"]);
      expect(
        codes(`export default Lambda((input, parameters) => false);`, {
          ...lambdaContext,
          lambdaType: "predicate",
        }),
      ).toContainEqual(["hir:transition-never-fires", "warning"]);
    });

    it("informs about shared distribution samples", () => {
      expect(
        codes(
          `export default TransitionKernel((input, parameters) => {
  const d = Distribution.Gaussian(0, 1);
  return { Out: [{ x: d, count: 0 }] };
});`,
          kernelContext,
        ),
      ).toEqual([]);
      expect(
        codes(
          `export default TransitionKernel((input, parameters) => {
  const d = Distribution.Gaussian(0, 1);
  return { Out: [{ x: d, count: 0 }], Out2: [{ x: d }] };
});`,
          {
            ...kernelContext,
            outputPlaces: [
              ...kernelContext.outputPlaces,
              {
                name: "Out2",
                colorId: "color-3",
                elements: [{ name: "x", type: "real" }],
                tokenCount: 1,
              },
            ],
          },
        ),
      ).toContainEqual(["hir:shared-sample", "info"]);
    });

    it("lints metric bodies: return type, unknown places, compilability", () => {
      const metricContext: HirMetricContext = {
        surface: "metric",
        parameters: [],
        places: [
          {
            name: "Pool",
            elements: [{ name: "x", type: "real" }],
          },
          { name: "Bin", elements: [] },
        ],
      };

      // Clean metric: counts, reduce, concat, guard.
      expect(
        codes(
          `const all = state.places.Pool.tokens;
if (all.length === 0) return state.places.Bin.count;
return all.reduce((sum, t) => sum + t.x, 0) / all.length;`,
          metricContext,
        ),
      ).toEqual([]);

      // Non-numeric result.
      expect(codes(`return true;`, metricContext)).toContainEqual([
        "hir:metric-return",
        "error",
      ]);

      // Unknown place.
      expect(
        codes(`return state.places.Missing.count;`, metricContext),
      ).toContainEqual(["hir:unknown-field", "error"]);

      // Typecheck-clean but not buffer-compilable (map over dynamic tokens).
      expect(
        codes(
          `return state.places.Pool.tokens.map((t) => t.x)[0];`,
          metricContext,
        ),
      ).toContainEqual(["hir:not-compilable", "error"]);
    });

    it("hints at unused bindings but ignores underscore names", () => {
      const results = codes(
        `export default Lambda((input, parameters) => {
  const unused = parameters.rate;
  const _ignored = parameters.rate;
  return 1.0;
});`,
        lambdaContext,
      );
      expect(results).toContainEqual(["hir:unused-binding", "hint"]);
      expect(
        results.filter(([code]) => code === "hir:unused-binding"),
      ).toHaveLength(1);
    });
  });
});
