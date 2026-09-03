/**
 * Acquiring a device and explaining what it could not do.
 *
 * This package is headless by design and pins `types: []` plus `lib: ["ESNext"]`
 * so it never depends on DOM typings (see `../../environment.ts`). `@webgpu/types`
 * supplies the `GPU*` shapes, but `navigator` and `performance` are DOM globals,
 * so they are read through a narrow structural view instead of widening `lib`.
 */
import { isWebGpuAvailable } from "../support";

const host = globalThis as unknown as {
  navigator?: { gpu?: GPU };
  performance?: { now: () => number };
};

/** Monotonic milliseconds, falling back to 0 where unavailable. */
export const now = (): number => host.performance?.now() ?? 0;

export type GpuDeviceHandle = {
  device: GPUDevice;
  /** Adapter description, for reporting which device ran an experiment. */
  info: string;
};

/**
 * Acquires a WebGPU device, or explains why one is unavailable.
 *
 * Returns a reason rather than throwing so callers can fall back to the CPU and
 * show the user why, which a thrown error at this layer would turn into an
 * opaque failure.
 */
export async function requestGpuDevice(): Promise<
  { ok: true; handle: GpuDeviceHandle } | { ok: false; reason: string }
> {
  if (!isWebGpuAvailable()) {
    return {
      ok: false,
      reason:
        "This browser does not expose WebGPU. Chrome, Edge and Safari 26+ support it; Firefox needs it enabled.",
    };
  }
  try {
    const adapter = await host.navigator!.gpu!.requestAdapter();
    if (!adapter) {
      return {
        ok: false,
        reason:
          "No WebGPU adapter is available — the browser exposes the API but no usable GPU was found.",
      };
    }
    // A device created without `requiredLimits` gets the WebGPU *default*
    // limits, not the adapter's — 128 MiB per storage binding and 256 MiB per
    // buffer, the floor every conformant implementation must support. An Apple
    // metal-3 adapter reports 4096 MiB for both, so the default costs a factor
    // of 32. Asking for exactly what the adapter reports is always valid, and
    // raising a limit allocates nothing on its own.
    const device = await adapter.requestDevice({
      requiredLimits: {
        maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
        maxBufferSize: adapter.limits.maxBufferSize,
      },
    });
    const vendor = adapter.info.vendor || "unknown vendor";
    const architecture = adapter.info.architecture || "unknown architecture";
    return {
      ok: true,
      handle: { device, info: `${vendor} / ${architecture}` },
    };
  } catch (error) {
    return {
      ok: false,
      reason: `Requesting a WebGPU device failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
}

/**
 * Compiles the shader and reports WGSL diagnostics.
 *
 * WebGPU surfaces shader compilation errors as console warnings by default
 * rather than as exceptions, so they are read explicitly and turned into a
 * real error.
 */
export async function createPipeline(
  device: GPUDevice,
  wgsl: string,
): Promise<
  { ok: true; pipeline: GPUComputePipeline } | { ok: false; reason: string }
> {
  const module = device.createShaderModule({ code: wgsl });
  const info = await module.getCompilationInfo();
  const errors = info.messages.filter((message) => message.type === "error");
  if (errors.length > 0) {
    return {
      ok: false,
      reason: `Generated WGSL did not compile: ${errors
        .map((message) => `line ${message.lineNum}: ${message.message}`)
        .join("; ")}`,
    };
  }

  device.pushErrorScope("validation");
  const pipeline = device.createComputePipeline({
    layout: "auto",
    compute: { module, entryPoint: "step_runs" },
  });
  const validationError = await device.popErrorScope();
  if (validationError) {
    return {
      ok: false,
      reason: `Pipeline validation failed: ${validationError.message}`,
    };
  }

  return { ok: true, pipeline };
}

/**
 * Turns a WebGPU allocation failure into something the author can act on.
 *
 * The raw message is a Dawn internal — "Failed to allocate memory for buffer
 * mapping at APICreateErrorBuffer (Device.cpp:1573)" — which says nothing about
 * runs. It is kept, because it distinguishes running out of memory from a
 * validation mistake, but the run arithmetic goes first.
 *
 * The run-state buffer is the one allocation that scales with the tile: what
 * comes back to the host is a compact per-run summary and the histogram, both
 * small beside it. No limit predicts the failure — a device can refuse a
 * buffer well below `maxBufferSize` — so the honest approach is to attempt
 * the allocation and explain the failure rather than to guess a threshold and
 * refuse experiments that would have worked.
 */
export function describeAllocationFailure({
  message,
  stateBytes,
  bytesPerRun,
  runCount,
}: {
  message: string;
  stateBytes: number;
  bytesPerRun: number;
  runCount: number;
}): string {
  const gib = (bytes: number) => (bytes / 1024 ** 3).toFixed(2);
  return `The GPU could not allocate memory for a tile of ${runCount} runs: ${bytesPerRun} bytes per run is ${gib(
    stateBytes,
  )} GiB of run state in one device buffer. Try fewer runs, or lower the token capacities that set the per-run size. (${message.trim()})`;
}

/**
 * Bytes to allocate for a uniform buffer carrying `byteLength` bytes of data.
 *
 * A struct in the uniform address space is sized to a multiple of 16, and a
 * binding smaller than the struct is rejected at bind-group creation, so the
 * bare word count — odd for the config block, whatever the metric count —
 * is never enough on its own.
 */
export const uniformBufferSize = (byteLength: number): number =>
  Math.ceil(byteLength / 16) * 16;

/**
 * Why this experiment cannot fit on this device even one tile at a time, or
 * `null` when it can.
 *
 * Tiling removes the run count from the equation, so only two shapes remain
 * unschedulable: a single run whose state exceeds the buffer ceiling, and a
 * histogram (frames × bins × metrics, run-count-independent) that does.
 */
export function describeBufferOverflow({
  histBytes,
  bytesPerRun,
  limits,
}: {
  histBytes: number;
  bytesPerRun: number;
  limits: Pick<
    GPUSupportedLimits,
    "maxStorageBufferBindingSize" | "maxBufferSize"
  >;
}): string | null {
  const ceiling = Math.min(
    limits.maxStorageBufferBindingSize,
    limits.maxBufferSize,
  );
  const mb = (bytes: number) => Math.round(bytes / 1e6);

  if (bytesPerRun > ceiling) {
    return `One run's state needs ${mb(bytesPerRun)} MB but this device caps a buffer at ${mb(
      ceiling,
    )} MB. Lower the token capacities that set the per-run size.`;
  }
  if (histBytes > ceiling) {
    return `Metric histograms need ${mb(histBytes)} MB but this device caps a buffer at ${mb(
      ceiling,
    )} MB. Use fewer frames or fewer metrics.`;
  }
  return null;
}
