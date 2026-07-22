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
  supplyChainProfit,
} from "../examples/index";
import {
  DEFAULT_PETRINAUT_EXTENSIONS,
  getTransitionLogicAvailability,
} from "../extensions";
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
  ["supply-chain-profit", supplyChainProfit.petriNetDefinition],
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
    "compiles every lambda, kernel and dynamics of %s to the buffer ABI",
    (_name, sdcpn) => {
      const { artifacts, failures } = compileHirArtifacts(sdcpn);
      expect(failures).toEqual([]);
      expect(artifacts.version).toBe(4);
      expect(artifacts.fingerprint).toMatch(/^[0-9a-f]{16}$/);

      const colorById = new Map(
        [
          ...sdcpn.types,
          ...(sdcpn.subnets ?? []).flatMap((subnet) => subnet.types),
        ].map((color) => [color.id, color]),
      );

      const missing: string[] = [];
      const nets = [
        { net: sdcpn, subnet: null },
        ...(sdcpn.subnets ?? []).map((subnet) => ({ net: subnet, subnet })),
      ];
      for (const { net, subnet } of nets) {
        const differentialEquations = subnet
          ? subnet.differentialEquations
          : sdcpn.differentialEquations;
        const transitions = subnet ? subnet.transitions : sdcpn.transitions;

        for (const de of differentialEquations) {
          const color = de.colorId ? colorById.get(de.colorId) : undefined;
          if (
            color?.elements.some((element) => element.type === "real") &&
            !artifacts.dynamics[de.id]
          ) {
            missing.push(`dynamics:${de.id}`);
          }
        }
        for (const transition of transitions) {
          const availability = getTransitionLogicAvailability(
            transition,
            sdcpn,
            DEFAULT_PETRINAUT_EXTENSIONS,
            net,
          );
          if (
            availability.lambda &&
            transition.lambdaCode.trim() !== "" &&
            !artifacts.lambdas[transition.id]
          ) {
            missing.push(`lambda:${transition.id}`);
          }
          if (
            availability.transitionKernel &&
            !artifacts.kernels[transition.id]
          ) {
            missing.push(`kernel:${transition.id}`);
          }
        }
      }
      // Every declared metric (they use reduce/concat/guard ifs) must
      // compile to a buffer metric program — there is no other metric path.
      for (const metric of sdcpn.metrics ?? []) {
        if (!artifacts.metrics[metric.id]) {
          missing.push(`metric:${metric.id}`);
        }
      }
      expect(missing).toEqual([]);

      // Artifacts carry the buffer-ABI metadata the engine validates against.
      for (const artifact of Object.values(artifacts.lambdas)) {
        expect(typeof artifact.source).toBe("string");
        expect(typeof artifact.inputSlotCount).toBe("number");
      }
      for (const artifact of Object.values(artifacts.kernels)) {
        expect(typeof artifact.source).toBe("string");
        expect(typeof artifact.inputSlotCount).toBe("number");
        expect(typeof artifact.outputByteCount).toBe("number");
      }
      for (const artifact of Object.values(artifacts.dynamics)) {
        expect(typeof artifact.source).toBe("string");
      }
      for (const artifact of Object.values(artifacts.metrics)) {
        expect(typeof artifact.source).toBe("string");
        expect(Array.isArray(artifact.placeNames)).toBe(true);
      }
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
