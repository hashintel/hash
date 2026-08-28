/**
 * The WebGPU experiment backend, behind the shared `ExperimentBackend` contract.
 *
 * Lives in the `webgpu/` subtree, and is reached through the `./webgpu` entry
 * point, so registering it does not pull the shader generator into a bundle that
 * never runs a GPU experiment. `selectExperimentBackend` loads a registration
 * only when it reaches it.
 *
 * Assessment here is genuinely cheap relative to a run and deliberately
 * device-free: `createGpuMonteCarloExperiment` sequences eligibility, HIR
 * lowering, shader generation and only then device acquisition, so everything
 * about the *net* is settled before any scarce resource is touched. This adapter
 * currently performs both phases inside `instantiate`, because that function is
 * the seam that exists today; splitting it so `assess` stops before
 * `requestGpuDevice` is a further step, and worth taking only if a caller needs
 * to assess without acquiring.
 */
import { createGpuMonteCarloExperiment } from "./gpu-experiment-handle";
import { isWebGpuAvailable } from "./support";

import type {
  ExperimentAssessment,
  ExperimentBlockerOrigin,
  ExperimentBlockers,
  ExperimentNote,
} from "../experiments/experiment-assessment";
import type { ExperimentBackend } from "../experiments/experiment-backend";
import type { ExperimentRequest } from "../experiments/experiment-request";
import type { GpuOdeMethod } from "./compile-net-shader";
import type { CreateGpuMonteCarloExperimentResult } from "./gpu-experiment-handle";

export const WEBGPU_BACKEND_ID = "webgpu";

export type WebGpuExperimentBackendOptions = {
  /**
   * Integration method for continuous dynamics.
   *
   * Bound at construction rather than carried on the request: it is a property of
   * how this backend computes, and no other backend has an opinion about it.
   * Defaults to RK4 — see `backend.ts` for why that is not Euler.
   */
  odeMethod?: GpuOdeMethod;
};

/**
 * Maps a refusal to who can act on it.
 *
 * `shader-generation` counts as `model` rather than `environment`: the emitter
 * failed on *this net's* expressions, so editing the net is what changes the
 * answer. `no-device` is the only one the author cannot do anything about.
 */
function originFor(
  cause: Extract<
    CreateGpuMonteCarloExperimentResult,
    { supported: false }
  >["cause"],
): ExperimentBlockerOrigin {
  switch (cause) {
    case "no-device":
      return "environment";
    case "metrics-unsupported":
      return "configuration";
    case "net-unsupported":
    case "shader-generation":
      return "model";
  }
}

function assess(
  request: ExperimentRequest,
  options: WebGpuExperimentBackendOptions,
): ExperimentAssessment {
  if (request.runs !== undefined) {
    const blockers: ExperimentBlockers = [
      {
        code: "per-run-parameters",
        message:
          "The GPU backend bakes parameter values into its shader, so it cannot run an experiment whose runs carry their own parameter values (a sweep over a parameter range). It runs on the CPU instead.",
        origin: "configuration",
      },
    ];
    return { eligible: false, blockers };
  }
  if (request.hirArtifacts === undefined) {
    const blockers: ExperimentBlockers = [
      {
        code: "missing-hir-trees",
        message:
          "The GPU backend generates a shader from the net's lowered code, which was not supplied. Compile with `includeHir` to run on the GPU.",
        origin: "configuration",
      },
    ];
    return { eligible: false, blockers };
  }
  const hirArtifacts = request.hirArtifacts;

  return {
    eligible: true,
    // Assembled by `createGpuMonteCarloExperiment`, so they are not known until
    // instantiation; anything discovered then is delivered through `onNote`.
    notes: [],
    instantiate: async (instantiateOptions) => {
      const created = await createGpuMonteCarloExperiment({
        sdcpn: request.sdcpn,
        hirArtifacts,
        ...(request.extensions === undefined
          ? {}
          : { extensions: request.extensions }),
        initialMarking: request.initialMarking,
        parameterValues: { ...request.parameterValues },
        seed: request.seed,
        dt: request.dt,
        maxTime: request.maxTime,
        runCount: request.runCount,
        metricSpecs: request.metricSpecs,
        ...(options.odeMethod === undefined
          ? {}
          : { odeMethod: options.odeMethod }),
        ...(instantiateOptions?.onNote === undefined
          ? {}
          : {
              onWarning: (warning: string) => {
                instantiateOptions.onNote?.({
                  code: "gpu-runtime-warning",
                  message: warning,
                });
              },
            }),
      });

      if (!created.supported) {
        const blockers: ExperimentBlockers = [
          {
            code: created.cause,
            message: created.reason,
            origin: originFor(created.cause),
          },
        ];
        return { ok: false, blockers };
      }

      for (const warning of created.warnings) {
        const note: ExperimentNote = {
          code: "gpu-setup-warning",
          message: warning,
        };
        instantiateOptions?.onNote?.(note);
      }

      return {
        ok: true,
        handle: created.handle,
        runtimeInfo: created.deviceInfo,
      };
    },
  };
}

export function createWebGpuExperimentBackend(
  options: WebGpuExperimentBackendOptions = {},
): ExperimentBackend {
  return {
    id: WEBGPU_BACKEND_ID,
    label: "GPU (WebGPU)",
    // The shader is generated from the HIR trees, and this backend cannot lower
    // the net itself: that needs the TypeScript frontend, which must not reach a
    // browser bundle.
    needsHirTrees: true,
    isAvailable: isWebGpuAvailable,
    assess: (request) => Promise.resolve(assess(request, options)),
  };
}
