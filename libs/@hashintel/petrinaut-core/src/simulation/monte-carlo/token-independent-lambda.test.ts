/**
 * End-to-end check that the token-independent fast path changes nothing an
 * experiment can observe: the same net, seed and artifacts produce identical
 * runs whether the compiled artifact carries `readsNoInputTokens` (skip
 * enumeration, take the first combination) or has it stripped (enumerate,
 * as artifacts compiled before the flag existed do).
 */
import { describe, expect, it } from "vitest";

import { compileHirArtifacts } from "../../hir";
import { createMonteCarloSimulator } from "./monte-carlo-simulator";

import type { HirArtifacts } from "../../hir";
import type { SDCPN } from "../../types/sdcpn";

const sdcpn: SDCPN = {
  types: [
    {
      id: "item",
      name: "Item",
      iconSlug: "circle",
      displayColor: "#00FF00",
      elements: [{ elementId: "v", name: "v", type: "real" }],
    },
  ],
  places: [
    {
      id: "pool",
      name: "Pool",
      colorId: "item",
      dynamicsEnabled: false,
      differentialEquationId: null,
      x: 0,
      y: 0,
    },
    {
      id: "sink",
      name: "Sink",
      colorId: "item",
      dynamicsEnabled: false,
      differentialEquationId: null,
      x: 100,
      y: 0,
    },
  ],
  transitions: [
    {
      id: "pair",
      name: "Pair",
      inputArcs: [{ placeId: "pool", weight: 2, type: "standard" }],
      outputArcs: [{ placeId: "sink", weight: 1 }],
      lambdaType: "stochastic",
      // Reads a parameter but no tokens, so the compiler marks it
      // token-independent. The mid-range rate makes runs mix firing and
      // non-firing frames.
      lambdaCode:
        "export default Lambda((input, parameters) => parameters.rate);",
      // The output token encodes which tokens were consumed, so a different
      // combination choice would change the observable state.
      transitionKernelCode: `export default TransitionKernel((input) => ({
  Sink: [{ v: input.Pool[0].v * 1000 + input.Pool[1].v }],
}));`,
      x: 50,
      y: 0,
    },
  ],
  differentialEquations: [],
  parameters: [
    {
      id: "rate",
      name: "Rate",
      variableName: "rate",
      type: "real",
      defaultValue: "2",
    },
  ],
};

function runToCompletion(artifacts: HirArtifacts) {
  const simulator = createMonteCarloSimulator({
    sdcpn,
    initialMarking: {
      pool: [{ v: 10 }, { v: 20 }, { v: 30 }, { v: 40 }, { v: 50 }, { v: 60 }],
      sink: [],
    },
    parameterValues: { rate: "2" },
    seed: 7,
    dt: 0.1,
    maxTime: 5,
    runCount: 8,
    hirArtifacts: artifacts,
  });
  simulator.runUntilComplete();
  return {
    summaries: simulator.getSummaries(),
    snapshots: Array.from({ length: 8 }, (_, index) =>
      simulator.getRunSnapshot(index),
    ),
  };
}

describe("token-independent lambda fast path", () => {
  it("is marked on the compiled artifact", () => {
    const { artifacts, failures } = compileHirArtifacts(sdcpn);
    expect(failures).toEqual([]);
    expect(artifacts.lambdas.pair!.readsNoInputTokens).toBe(true);
  });

  it("produces runs identical to the enumerating path", () => {
    const { artifacts } = compileHirArtifacts(sdcpn);
    const stripped = JSON.parse(JSON.stringify(artifacts)) as HirArtifacts;
    delete stripped.lambdas.pair!.readsNoInputTokens;

    const fast = runToCompletion(artifacts);
    const enumerating = runToCompletion(stripped);

    expect(fast.summaries).toEqual(enumerating.summaries);
    expect(fast.snapshots).toEqual(enumerating.snapshots);
    // The runs actually fired: an all-idle run would make the comparison
    // vacuous.
    expect(
      fast.snapshots.some(
        (snapshot) => (snapshot.placeTokenCounts.sink ?? 0) > 0,
      ),
    ).toBe(true);
  });
});
