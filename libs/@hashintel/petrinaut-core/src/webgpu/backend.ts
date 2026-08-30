/**
 * One call that answers "can this net run on the GPU, and if so how".
 *
 * Consumers should not have to sequence eligibility, HIR lowering, shader
 * generation and device acquisition themselves, nor decide which failures are
 * fatal. Everything here degrades to a `supported: false` with a reason, so the
 * caller's only job is to fall back to the CPU and show the reason.
 *
 * @layerRoot core.webgpu
 * @role Generates a WGSL compute shader from a net's HIR and runs its experiment runs on the GPU
 */
import { resolveNetParameterValues } from "../parameter-values";
import { compileNetShader } from "./compile-net-shader";
import { assessGpuEligibility, formatGpuIneligibility } from "./eligibility";
import { hirFromArtifacts } from "./hir-from-artifacts";
import { requestGpuDevice } from "./runner";

import type { PetrinautExtensionSettings } from "../extensions";
import type { HirArtifacts } from "../hir-runtime";
import type { InitialMarking } from "../simulation/api";
import type { SDCPN } from "../types/sdcpn";
import type {
  CompiledNetShader,
  GpuMetricSpec,
  GpuOdeMethod,
} from "./compile-net-shader";
import type { GpuNetProfile } from "./eligibility";
import type { GpuDeviceHandle } from "./runner";

/**
 * Frames advanced per dispatch.
 *
 * Long dispatches risk the platform's GPU watchdog resetting the device, and a
 * chunk boundary is also the only place progress can be reported. 300 frames
 * measured well under any watchdog threshold while keeping dispatch overhead
 * (~0.2 ms) negligible against the work.
 */
export const DEFAULT_GPU_FRAMES_PER_DISPATCH = 300;

export type GpuBackendRequest = {
  sdcpn: SDCPN;
  /**
   * Compiled artifacts for this net, carrying the HIR the shader is generated
   * from.
   *
   * Required rather than lowered here: lowering runs the TypeScript frontend,
   * and this module is imported by browser code, where that would drag the
   * compiler and its Node builtins into the bundle. The artifacts are produced in
   * the language worker, which already has the compiler.
   */
  hirArtifacts: HirArtifacts;
  extensions?: PetrinautExtensionSettings;
  parameterValues?: Record<string, string>;
  dt: number;
  metrics: readonly GpuMetricSpec[];
  /**
   * Initial marking, keyed by place id.
   *
   * Used to refuse a net whose sampled places already exceed the histogram's
   * range. Keyed rather than ordered because the caller cannot know
   * `profile.places` order until this call returns. Optional, so callers that only
   * want a shader need not supply it.
   */
  initialMarking?: InitialMarking;
  /**
   * Integrator for continuous dynamics.
   *
   * Defaults to RK4. A token's derivative depends only on that token, so all
   * four stages fit in one invocation with no extra dispatch — measured at 2.5x
   * Euler's cost for roughly four orders of magnitude less truncation error, so
   * Euler is rarely the right choice here even though it is what the CPU uses.
   */
  odeMethod?: GpuOdeMethod;
  framesPerDispatch?: number;
  /**
   * Parameters whose value varies per run; the shader reads them from a
   * per-run buffer instead of baking a literal. See `CompileNetShaderInput`.
   */
  runParameters?: readonly string[];
};

export type GpuBackend = {
  supported: true;
  handle: GpuDeviceHandle;
  shader: CompiledNetShader;
  profile: GpuNetProfile;
  framesPerDispatch: number;
  /** Notes that did not prevent use, e.g. user code that fell back to a default. */
  warnings: string[];
};

export type GpuBackendUnavailable = {
  supported: false;
  /** Why the GPU path cannot be used, phrased for a user. */
  reason: string;
  /** Whether the net itself is the problem, as opposed to the environment. */
  cause: "no-device" | "net-unsupported" | "shader-generation";
};

/**
 * Prepares the GPU backend for one net, or explains why it is unavailable.
 */
/**
 * Token count a place's initial marking represents: uncoloured places carry a
 * plain number, typed places an array of token records.
 */
function initialTokenCount(
  marking: InitialMarking[string] | undefined,
): number {
  if (typeof marking === "number") {
    return marking;
  }
  return Array.isArray(marking) ? marking.length : 0;
}

export async function requestGpuExperimentBackend(
  request: GpuBackendRequest,
): Promise<GpuBackend | GpuBackendUnavailable> {
  const {
    sdcpn,
    hirArtifacts,
    extensions,
    parameterValues = {},
    dt,
    metrics,
    odeMethod = "rk4",
    framesPerDispatch = DEFAULT_GPU_FRAMES_PER_DISPATCH,
    runParameters,
  } = request;

  // Net eligibility is checked before touching the GPU: it is the most likely
  // failure and the cheapest to determine.
  const eligibility = assessGpuEligibility(sdcpn);
  if (!eligibility.eligible) {
    return {
      supported: false,
      cause: "net-unsupported",
      reason: formatGpuIneligibility(eligibility.reasons),
    };
  }

  const lowered = hirFromArtifacts(sdcpn, hirArtifacts, extensions);
  const resolvedParameters = resolveNetParameterValues(
    sdcpn.parameters,
    parameterValues,
    extensions?.parameters ?? true,
  );

  const compiled = compileNetShader({
    sdcpn,
    profile: eligibility.profile,
    parameterValues: resolvedParameters,
    lambdaHir: lowered.lambdas,
    dynamicsHir: lowered.dynamics,
    kernelHir: lowered.kernels,
    dt,
    framesPerDispatch,
    metrics,
    odeMethod,
    extensions,
    ...(runParameters === undefined ? {} : { runParameters }),
  });
  if (!compiled.ok) {
    return {
      supported: false,
      cause: "shader-generation",
      reason: `This net's user code cannot be compiled to a GPU shader: ${compiled.reason}`,
    };
  }

  // Metrics are reduced on the device into a histogram with one bin per integer
  // token count, and the shader clamps that index to the top bin. A sampled place
  // that already starts at or above the ceiling reports the ceiling from frame 0 —
  // a flat line rather than a trajectory — so refuse instead of producing it.
  // Counts that climb past the ceiling mid-run cannot be caught here;
  // `saturatedSamples` reports those after the run.
  if (request.initialMarking !== undefined) {
    for (const metric of metrics) {
      const initialCount = initialTokenCount(
        request.initialMarking[metric.placeId],
      );
      if (initialCount >= compiled.shader.histogramBins) {
        const placeName =
          eligibility.profile.places.find(
            (place) => place.id === metric.placeId,
          )?.name ?? metric.placeId;
        return {
          supported: false,
          cause: "net-unsupported",
          reason: `Place \`${placeName}\` starts with ${initialCount} tokens, and the GPU backend reduces metrics into a histogram of ${compiled.shader.histogramBins} bins — one per token count — so counts of ${compiled.shader.histogramBins} or more cannot be told apart.`,
        };
      }
    }
  }

  const device = await requestGpuDevice();
  if (!device.ok) {
    return { supported: false, cause: "no-device", reason: device.reason };
  }

  const warnings = lowered.skipped.map(
    (entry) =>
      `\`${entry.itemId}\` could not be lowered (${entry.reason}); it will use the always-enabled default.`,
  );

  return {
    supported: true,
    handle: device.handle,
    shader: compiled.shader,
    profile: eligibility.profile,
    framesPerDispatch,
    warnings,
  };
}
