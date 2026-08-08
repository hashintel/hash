import { describe, expect, it } from "vitest";

import { probabilisticSatellitesSDCPN } from "../examples/satellites-launcher";
import { compileHirArtifacts } from "../hir";
import { lowerTypeScriptToHir } from "../hir/lower-typescript";
import { tryTranslateKernel } from "./try-translate-kernel";

import type { HirFunction } from "../hir/hir";

const sdcpn = probabilisticSatellitesSDCPN.petriNetDefinition;
/** Any transition with a typed output place, so a kernel context can be built. */
const transition = sdcpn.transitions.find(
  (candidate) => candidate.name === "LaunchSatellite",
)!;

function lowerKernel(code: string): HirFunction {
  const result = lowerTypeScriptToHir(code, "kernel");
  if (!result.ok) {
    throw new Error(
      `test kernel did not lower: ${result.diagnostics
        .map((diagnostic) => diagnostic.message)
        .join("; ")}`,
    );
  }
  return result.fn;
}

describe("tryTranslateKernel", () => {
  it("accepts the example's own kernels, distributions included", () => {
    // Through the artifact, which is the path the report uses: lowering the raw
    // source without a kernel context yields different HIR, because parameter
    // references are only resolved to `paramRef` when the context supplies them.
    const { artifacts } = compileHirArtifacts(sdcpn, undefined, {
      includeHir: true,
    });

    let checked = 0;
    for (const candidate of sdcpn.transitions) {
      const hir = artifacts.kernels[candidate.id]?.hir;
      if (!hir) {
        continue;
      }
      checked += 1;
      expect(
        tryTranslateKernel({ sdcpn, transition: candidate, hir }),
      ).toStrictEqual({ translatable: true });
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("accepts a kernel that samples every distribution family", () => {
    // These are the nodes the emitter refused until the samplers were wired up,
    // and they are what kernels use most.
    const hir = lowerKernel(`
      export default TransitionKernel(() => {
        const a = Distribution.Gaussian(0, 1);
        const b = Distribution.Uniform(0, 1);
        const c = Distribution.Lognormal(0, 1);
        return a.map((v) => v) + b.map((v) => v) + c.map((v) => v);
      })
    `);

    expect(tryTranslateKernel({ sdcpn, transition, hir }).translatable).toBe(
      true,
    );
  });

  it("refuses a kernel that generates a uuid, and says why", () => {
    // 128 bits, which WGSL cannot represent — a limit of the code, not of the
    // backend's missing slot support, and the report needs to tell them apart.
    const hir = lowerKernel(
      "export default TransitionKernel(() => Uuid.generate())",
    );
    const result = tryTranslateKernel({ sdcpn, transition, hir });

    expect(result.translatable).toBe(false);
    expect(result.translatable ? "" : result.reason).toMatch(/uuid/i);
  });

  it("refuses a kernel that builds a string", () => {
    const hir = lowerKernel(
      'export default TransitionKernel(() => "launched")',
    );
    const result = tryTranslateKernel({ sdcpn, transition, hir });

    expect(result.translatable).toBe(false);
    expect(result.translatable ? "" : result.reason).toMatch(/string/i);
  });
});
