/**
 * Coverage gate: every example model must compile fully through the HIR —
 * there is no fallback compiler anymore, so any lowering failure here means
 * a shipped model cannot simulate.
 */
import { describe, expect, it } from "vitest";

import {
  deploymentPipelineSDCPN,
  probabilisticSatellitesSDCPN,
  productionMachines,
  sirModel,
  supplyChainWithDisruption,
} from "../examples/index";
import { buildSimulation } from "../simulation/engine/build-simulation";
import { compileHirArtifacts } from "./compile";

import type { SDCPN } from "../types/sdcpn";

const EXAMPLES: [string, SDCPN][] = [
  ["production-with-machine-failure", productionMachines.petriNetDefinition],
  ["deployment-pipeline", deploymentPipelineSDCPN.petriNetDefinition],
  ["satellites-launcher", probabilisticSatellitesSDCPN.petriNetDefinition],
  ["sir-model", sirModel.petriNetDefinition],
  [
    "supply-chain-with-disruption",
    supplyChainWithDisruption.petriNetDefinition,
  ],
];

describe("compileHirArtifacts on example models", () => {
  it.each(EXAMPLES)("compiles every item of %s", (_name, sdcpn) => {
    const { failures } = compileHirArtifacts(sdcpn);
    expect(
      failures.map((failure) => ({
        item: `${failure.itemType}:${failure.itemId}`,
        message: failure.diagnostics[0]?.message,
      })),
    ).toEqual([]);
  });

  it.each(EXAMPLES)(
    "compiles every lambda and kernel of %s to the buffer ABI",
    (_name, sdcpn) => {
      const { artifacts } = compileHirArtifacts(sdcpn);
      const withoutBuffer = [
        ...Object.entries(artifacts.lambdas)
          .filter(([, artifact]) => !artifact.buffer)
          .map(([id]) => `lambda:${id}`),
        ...Object.entries(artifacts.kernels)
          .filter(([, artifact]) => !artifact.buffer)
          .map(([id]) => `kernel:${id}`),
        ...Object.entries(artifacts.dynamics)
          .filter(([, artifact]) => !artifact.buffer)
          .map(([id]) => `dynamics:${id}`),
      ];
      expect(withoutBuffer).toEqual([]);
    },
  );

  it.each(EXAMPLES)("builds a runnable simulation for %s", (_name, sdcpn) => {
    const { artifacts } = compileHirArtifacts(sdcpn);
    const simulation = buildSimulation({
      sdcpn,
      initialMarking: {},
      parameterValues: {},
      seed: 1,
      dt: 0.1,
      maxTime: 1,
      hirArtifacts: artifacts,
    });
    expect(simulation.compiledTransitions.size).toBeGreaterThan(0);
  });
});
