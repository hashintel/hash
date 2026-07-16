import { describe, expect, it } from "vitest";

import { analyzeHir, foldHir } from "./analyze";
import { lowerTypeScriptToHir } from "./lower-typescript";

import type { HirFunction, HirSurfaceKind } from "./hir";

function lower(code: string, surface: HirSurfaceKind): HirFunction {
  const result = lowerTypeScriptToHir(code, surface);
  if (!result.ok) {
    throw new Error(result.diagnostics[0]?.message);
  }
  return result.fn;
}

describe("analyzeHir", () => {
  describe("dependencies", () => {
    it("collects parameter reads", () => {
      const analysis = analyzeHir(
        lower(
          `export default Lambda((input, parameters) => parameters.beta * parameters.alpha + parameters.beta);`,
          "lambda",
        ),
      );
      expect(analysis.dependencies.parameters).toEqual(["alpha", "beta"]);
      expect(analysis.dependencies.isDeterministic).toBe(true);
    });

    it("reports a lambda that depends on no parameters", () => {
      const analysis = analyzeHir(
        lower(`export default Lambda((input, parameters) => 1.5);`, "lambda"),
      );
      expect(analysis.dependencies.parameters).toEqual([]);
      expect(analysis.dependencies.tokenReads).toEqual([]);
    });

    it("attributes token reads to places for lambdas", () => {
      const analysis = analyzeHir(
        lower(
          `export default Lambda((input, parameters) => input.Pool[0].x + input["Other Place"][1].y);`,
          "lambda",
        ),
      );
      expect(analysis.dependencies.tokenReads).toEqual([
        { place: "Pool", field: "x" },
        { place: "Other Place", field: "y" },
      ]);
    });

    it("attributes token reads through .map callbacks (dynamics)", () => {
      const analysis = analyzeHir(
        lower(
          `export default Dynamics((tokens, parameters) => tokens.map(({ x, y }) => ({ x: y * parameters.g, y: x })));`,
          "dynamics",
        ),
      );
      expect(analysis.dependencies.tokenReads).toEqual([
        { place: "self", field: "y" },
        { place: "self", field: "x" },
      ]);
      expect(analysis.dependencies.parameters).toEqual(["g"]);
    });

    it("tracks token count reads and Math.random", () => {
      const analysis = analyzeHir(
        lower(
          `export default Lambda((input) => input.Pool.length * Math.random());`,
          "lambda",
        ),
      );
      expect(analysis.dependencies.readsTokenCounts).toBe(true);
      expect(analysis.dependencies.usesMathRandom).toBe(true);
      expect(analysis.dependencies.isDeterministic).toBe(false);
    });
  });

  describe("distribution DAG", () => {
    it("extracts nodes, edges and kernel output sinks", () => {
      const analysis = analyzeHir(
        lower(
          `export default TransitionKernel((input, parameters) => {
  const base = Distribution.Gaussian(0, parameters.sigma);
  const scaled = base.map((value) => value * 10);
  return { Out: [{ x: scaled, y: 1 }] };
});`,
          "kernel",
        ),
      );
      const { nodes, edges, sinks } = analysis.distributionDag;
      expect(nodes).toHaveLength(2);

      const gaussian = nodes.find((node) => node.kind === "gaussian")!;
      const mapped = nodes.find((node) => node.kind === "mapped")!;
      expect(gaussian.bindingName).toBe("base");
      expect(gaussian.dependsOnParameters).toEqual(["sigma"]);
      expect(mapped.bindingName).toBe("scaled");
      expect(edges).toEqual([{ from: gaussian.nodeId, to: mapped.nodeId }]);
      expect(sinks).toEqual([
        { nodeId: mapped.nodeId, place: "Out", tokenIndex: 0, field: "x" },
      ]);
    });

    it("records constant arguments", () => {
      const analysis = analyzeHir(
        lower(
          `export default TransitionKernel((input) => ({
  Out: [{ x: Distribution.Uniform(0, 2 * 5) }],
}));`,
          "kernel",
        ),
      );
      expect(analysis.distributionDag.nodes[0]!.constantArgs).toEqual([0, 10]);
    });

    it("flags shared samples feeding several output slots", () => {
      const analysis = analyzeHir(
        lower(
          `export default TransitionKernel((input) => {
  const d = Distribution.Gaussian(0, 1);
  return { Out: [{ x: d, y: d }] };
});`,
          "kernel",
        ),
      );
      const nodeId = analysis.distributionDag.nodes[0]!.nodeId;
      expect(analysis.distributionDag.sinks).toHaveLength(2);
      expect(analysis.distributionDag.sharedSampleNodeIds).toEqual([nodeId]);
    });

    it("marks per-iteration distributions and dynamic sinks", () => {
      const analysis = analyzeHir(
        lower(
          `export default TransitionKernel((input) => ({
  Out: input.In.map((token) => ({ x: Distribution.Gaussian(token.x, 1) })),
}));`,
          "kernel",
        ),
      );
      const node = analysis.distributionDag.nodes[0]!;
      expect(node.perIteration).toBe(true);
      expect(node.dependsOnTokens).toEqual([{ place: "In", field: "x" }]);
      expect(analysis.distributionDag.sinks).toEqual([
        {
          nodeId: node.nodeId,
          place: "Out",
          tokenIndex: "dynamic",
          field: "x",
        },
      ]);
      expect(analysis.distributionDag.sharedSampleNodeIds).toEqual([]);
    });

    it("tracks distributions through conditionals", () => {
      const analysis = analyzeHir(
        lower(
          `export default TransitionKernel((input, parameters) => {
  const a = Distribution.Gaussian(0, 1);
  const b = Distribution.Uniform(0, 1);
  return { Out: [{ x: parameters.flag ? a : b }] };
});`,
          "kernel",
        ),
      );
      expect(analysis.distributionDag.sinks).toHaveLength(2);
    });
  });

  describe("bindings", () => {
    it("counts references and finds unused bindings", () => {
      const analysis = analyzeHir(
        lower(
          `export default Lambda((input, parameters) => {
  const used = parameters.a;
  const unused = parameters.b;
  return used * 2;
});`,
          "lambda",
        ),
      );
      const used = analysis.bindings.find(
        (binding) => binding.name === "used",
      )!;
      const unused = analysis.bindings.find(
        (binding) => binding.name === "unused",
      )!;
      expect(used.referenceCount).toBe(1);
      expect(unused.referenceCount).toBe(0);
    });
  });
});

describe("foldHir", () => {
  it("folds constant arithmetic, conditionals and Math calls", () => {
    const fn = lower(
      `export default Lambda((input) => 1 + 2 * 3 > 5 ? Math.sqrt(16) : 0);`,
      "lambda",
    );
    const folded = foldHir(fn.body);
    expect(folded).toMatchObject({ kind: "numberLit", value: 4 });
  });

  it("keeps non-constant parts intact", () => {
    const fn = lower(
      `export default Lambda((input, parameters) => parameters.rate * (2 + 3));`,
      "lambda",
    );
    const folded = foldHir(fn.body);
    expect(folded).toMatchObject({
      kind: "binary",
      op: "*",
      left: { kind: "paramRef" },
      right: { kind: "numberLit", value: 5 },
    });
  });

  it("never folds Math.random", () => {
    const fn = lower(
      `export default Lambda((input) => Math.random());`,
      "lambda",
    );
    expect(foldHir(fn.body).kind).toBe("mathCall");
  });
});
