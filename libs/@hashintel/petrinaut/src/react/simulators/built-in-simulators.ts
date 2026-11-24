import {
  createJsAdaptiveSimulator,
  createJsFixedStepSimulator,
  createWebGpuFixedStepSimulator,
  type JsSimulatorOptions,
  type SimulatorRegistration,
} from "@hashintel/petrinaut-core";

/** The simulators every editor registers, in picker order. */
export const createBuiltInSimulators = (
  workers: JsSimulatorOptions,
): readonly SimulatorRegistration[] => [
  createJsFixedStepSimulator(workers),
  createJsAdaptiveSimulator(workers),
  createWebGpuFixedStepSimulator({
    // Imported here, not at module scope, so a session that never asks for
    // the GPU never loads the shader generator.
    loadBackend: async (options) => {
      const { createWebGpuExperimentBackend } =
        await import("@hashintel/petrinaut-core/webgpu");
      return createWebGpuExperimentBackend(options);
    },
  }),
];
