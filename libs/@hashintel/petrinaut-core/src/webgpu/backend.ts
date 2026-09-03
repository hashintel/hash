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
import {
  assessGpuEligibility,
  derivedSlabCeiling,
  formatGpuIneligibility,
} from "./eligibility";
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
import type { MetricWindow } from "./metric-windows";
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
   * Initial marking, keyed by place id. Keyed rather than ordered because
   * the caller cannot know `profile.places` order until this call returns.
   * Optional, so callers that only want a shader need not supply it.
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
  /** The compiled profile: derived-capacity places carry their probe slabs. */
  profile: GpuNetProfile;
  /**
   * The probe slab per derived-capacity place; empty when every typed place
   * declares its own. The handle probes at these, then recompiles at what
   * the probe observed.
   */
  derivedCapacities: ReadonlyMap<string, number>;
  /** Recompiles the shader at different derived slabs; capacities are baked. */
  recompile: (
    capacities: ReadonlyMap<string, number>,
  ) => ReturnType<typeof compileNetShader>;
  /**
   * Calibration learned by this backend's experiments, keyed by
   * `calibrationKey` (initial marking + metric set). A sweep instantiates a
   * batch per ladder rung; without this every batch re-ran the capacity and
   * window probes the first batch already paid for. Entries update whenever
   * a batch learns more (growth, window replan), and a stale entry heals
   * through the same escape/overflow re-runs that calibrate from scratch.
   */
  calibration: Map<string, GpuCalibration>;
  framesPerDispatch: number;
  /** Notes that did not prevent use, e.g. user code that fell back to a default. */
  warnings: string[];
};

/** One learned calibration: see `GpuBackend.calibration`. */
export type GpuCalibration = {
  windows: readonly MetricWindow[];
  capacities: ReadonlyMap<string, number>;
  /** The shader compiled at `capacities`, reusable on this backend's device. */
  shader: CompiledNetShader;
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

  // A derived-capacity place starts at a generous probe slab: room for four
  // times its initial tokens, so the probe observes real maxima rather than
  // overflowing immediately. The handle grows it from there when the probe
  // still overflows, and shrinks it to the observed maximum for the full
  // run — see `gpu-experiment-handle.ts`.
  const probeCapacities = new Map<string, number>();
  for (const place of eligibility.profile.places) {
    if (place.capacitySource !== "derived" || !place.colored) {
      continue;
    }
    const marking = request.initialMarking?.[place.id];
    const initialCount = Array.isArray(marking) ? marking.length : 0;
    probeCapacities.set(
      place.id,
      Math.min(Math.max(64, 4 * initialCount + 16), derivedSlabCeiling(place)),
    );
  }

  /** The profile with concrete slabs for every derived-capacity place. */
  const profileWith = (
    capacities: ReadonlyMap<string, number>,
  ): GpuNetProfile => ({
    ...eligibility.profile,
    places: eligibility.profile.places.map((place) =>
      place.capacitySource === "derived" && place.colored
        ? { ...place, capacity: capacities.get(place.id) ?? 64 }
        : place,
    ),
  });

  const compileWith = (capacities: ReadonlyMap<string, number>) =>
    compileNetShader({
      sdcpn,
      profile: profileWith(capacities),
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

  const compiled = compileWith(probeCapacities);
  if (!compiled.ok) {
    return {
      supported: false,
      cause: "shader-generation",
      reason: `This net's user code cannot be compiled to a GPU shader: ${compiled.reason}`,
    };
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
    profile: profileWith(probeCapacities),
    derivedCapacities: probeCapacities,
    recompile: compileWith,
    calibration: new Map(),
    framesPerDispatch,
    warnings,
  };
}
