import { describe, expect, it } from "vitest";

import { probabilisticSatellitesSDCPN } from "../examples/satellites-launcher";
import { sirModel } from "../examples/sir-model";
import { supplyChainWithDisruption } from "../examples/supply-chain-with-disruption";
import { compileHirArtifacts } from "../hir";
import { hirFromArtifacts } from "./hir-from-artifacts";

import type { HirArtifacts } from "../hir-runtime";

const sir = sirModel.petriNetDefinition;

describe("hirFromArtifacts", () => {
  it("reads lambda HIR straight from compiled artifacts", () => {
    // The point of carrying HIR on the artifact: the GPU backend gets it without
    // running the TypeScript frontend, which cannot be bundled for the browser.
    const { artifacts } = compileHirArtifacts(sir, undefined, {
      includeHir: true,
    });
    const result = hirFromArtifacts(sir, artifacts);

    expect([...result.lambdas.keys()].sort()).toStrictEqual([
      "transition__infection",
      "transition__recovery",
    ]);
    expect(result.skipped).toStrictEqual([]);
    // The HIR must be the real tree, not a placeholder.
    expect(result.lambdas.get("transition__infection")?.surface).toBe("lambda");
  });

  it("keys dynamics by place, though artifacts key them by equation", () => {
    const net = supplyChainWithDisruption.petriNetDefinition;
    const { artifacts } = compileHirArtifacts(net, undefined, {
      includeHir: true,
    });
    const result = hirFromArtifacts(net, artifacts);

    expect(result.dynamics.size).toBeGreaterThan(0);
    for (const placeId of result.dynamics.keys()) {
      const place = net.places.find((candidate) => candidate.id === placeId);
      // Every key is a place id, and that place really does have dynamics.
      expect(place?.dynamicsEnabled).toBe(true);
    }
    expect(result.dynamics.get([...result.dynamics.keys()][0]!)?.surface).toBe(
      "dynamics",
    );
  });

  it("reports an artifact carrying no HIR rather than silently omitting it", () => {
    const { artifacts } = compileHirArtifacts(sir, undefined, {
      includeHir: true,
    });
    // Simulate an artifact produced before HIR was carried.
    const stripped: HirArtifacts = {
      ...artifacts,
      lambdas: Object.fromEntries(
        Object.entries(artifacts.lambdas).map(([id, artifact]) => [
          id,
          { source: artifact.source, inputSlotCount: artifact.inputSlotCount },
        ]),
      ),
    };

    const result = hirFromArtifacts(sir, stripped);

    expect(result.lambdas.size).toBe(0);
    expect(result.skipped.map((entry) => entry.itemId).sort()).toStrictEqual([
      "transition__infection",
      "transition__recovery",
    ]);
    expect(result.skipped[0]?.reason).toMatch(/no HIR/i);
  });

  it("skips lambdas when stochasticity is disabled, matching the CPU engine", () => {
    // With stochasticity off the CPU engine installs the always-enabled default
    // instead of compiling lambdas; the GPU path has to agree.
    const { artifacts } = compileHirArtifacts(sir, undefined, {
      includeHir: true,
    });
    const result = hirFromArtifacts(sir, artifacts, {
      colors: true,
      stochasticity: false,
      dynamics: true,
      parameters: true,
      subnets: true,
    });

    expect(result.lambdas.size).toBe(0);
    // Not a problem to report — it is the configured behaviour.
    expect(result.skipped).toStrictEqual([]);
  });

  it("skips dynamics when the dynamics extension is disabled", () => {
    const net = supplyChainWithDisruption.petriNetDefinition;
    const { artifacts } = compileHirArtifacts(net, undefined, {
      includeHir: true,
    });
    const result = hirFromArtifacts(net, artifacts, {
      colors: true,
      stochasticity: true,
      dynamics: false,
      parameters: true,
      subnets: true,
    });

    expect(result.dynamics.size).toBe(0);
    expect(result.skipped).toStrictEqual([]);
  });

  it("ignores a transition whose lambda never compiled", () => {
    // A lambda that fails to compile has no artifact at all. That failure is
    // already reported through the compile-failure path, so it is not repeated
    // here as a GPU-specific warning.
    const { artifacts } = compileHirArtifacts(sir, undefined, {
      includeHir: true,
    });
    const withoutOne: HirArtifacts = {
      ...artifacts,
      lambdas: Object.fromEntries(
        Object.entries(artifacts.lambdas).filter(
          ([id]) => id !== "transition__recovery",
        ),
      ),
    };

    const result = hirFromArtifacts(sir, withoutOne);

    expect([...result.lambdas.keys()]).toStrictEqual(["transition__infection"]);
    expect(result.skipped).toStrictEqual([]);
  });
});

/**
 * Kernels only exist where a transition has a *typed* output place —
 * `isTransitionKernelAvailable` in extensions.ts gates on exactly that — so the
 * uncoloured SIR net has none, and these use a coloured net instead.
 */
describe("hirFromArtifacts kernels", () => {
  const coloured = probabilisticSatellitesSDCPN.petriNetDefinition;

  it("collects kernel HIR keyed by transition", () => {
    const { artifacts } = compileHirArtifacts(coloured, undefined, {
      includeHir: true,
    });
    const result = hirFromArtifacts(coloured, artifacts);

    expect(result.kernels.size).toBeGreaterThan(0);
    for (const [transitionId, hir] of result.kernels) {
      expect(
        coloured.transitions.some(
          (transition) => transition.id === transitionId,
        ),
      ).toBe(true);
      // The real lowered tree, and it knows which surface it came from.
      expect(hir.surface).toBe("kernel");
    }
  });

  it("reports a kernel artifact carrying no HIR", () => {
    const { artifacts } = compileHirArtifacts(coloured, undefined, {
      includeHir: true,
    });
    const stripped: HirArtifacts = {
      ...artifacts,
      kernels: Object.fromEntries(
        Object.entries(artifacts.kernels).map(([id, artifact]) => [
          id,
          {
            source: artifact.source,
            inputSlotCount: artifact.inputSlotCount,
            outputByteCount: artifact.outputByteCount,
          },
        ]),
      ),
    };

    const result = hirFromArtifacts(coloured, stripped);

    expect(result.kernels.size).toBe(0);
    expect(result.skipped.map((entry) => entry.reason)).toContain(
      "its compiled kernel artifact carries no HIR, so it cannot be translated to a shader",
    );
  });

  it("carries kernel HIR only when asked, since it is not free", () => {
    // Artifacts are structured-cloned to every shard worker, so the default must
    // stay lean — the same reason lambdas and dynamics gate on this flag.
    const withoutHir = compileHirArtifacts(coloured).artifacts;

    for (const artifact of Object.values(withoutHir.kernels)) {
      expect(artifact.hir).toBeUndefined();
    }
    expect(Object.keys(withoutHir.kernels).length).toBeGreaterThan(0);
  });
});
