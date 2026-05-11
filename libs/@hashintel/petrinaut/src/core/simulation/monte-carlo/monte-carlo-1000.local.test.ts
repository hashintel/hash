import { describe, it } from "vitest";

import { supplyChainStochasticSDCPN } from "../../../examples/supply-chain-stochastic";
import { createMonteCarloSimulator } from "./monte-carlo-simulator";

describe("local Monte Carlo 1000 runs", () => {
  it("runs 1000 simulations with probabilistic transition kernels", () => {
    const dt = 0.05;
    const maxTime = 30;

    const simulator = createMonteCarloSimulator({
      sdcpn: supplyChainStochasticSDCPN.petriNetDefinition,
      runCount: 1_000,
      seed: 42,
      initialMarking: {
        place__0: 100,
        place__1: 100,
      },
      parameterValues: {
        quality_threshold: "0.2",
      },
      dt,
      maxTime,
    });

    console.time("monte-carlo-1000");
    const result = simulator.runUntilComplete({
      maxBatches: Math.ceil(maxTime / dt) + 1,
    });
    console.timeEnd("monte-carlo-1000");

    console.log(result);
    console.log(simulator.getRunSnapshot(0));
    console.log(simulator.getRunSnapshot(1));
    console.log(simulator.getRunSnapshot(2));
    console.log(simulator.getRunSnapshot(999));
  });
});
