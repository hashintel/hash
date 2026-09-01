/**
 * Runs a compiled net shader on a WebGPU device.
 *
 * The API is deliberately whole-experiment rather than per-frame. Implementing
 * `MonteCarloSimulator.advanceAll()` — synchronous, one frame at a time — would
 * force a `mapAsync` readback per frame, and "The WebGPU backend" in
 * `libs/@local/petrinaut-arch-docs/content/simulation/performance.mdx`
 * measures that round-trip at hundreds of microseconds against roughly a
 * microsecond of per-frame work. A
 * GPU path shaped like the CPU interface would therefore be slower than the CPU.
 *
 * Instead the host dispatches a chunk of frames, and results come back as
 * per-frame histograms accumulated on the device.
 */
import { GPU_WORKGROUP_SIZE } from "./compile-net-shader";
import { isWebGpuAvailable } from "./support";

import type { AbortSignalLike } from "../environment";
import type { CompiledNetShader } from "./compile-net-shader";
import type { MetricWindow, ObservedMetricRange } from "./metric-windows";

/**
 * Fixed words in the uniform config block: run_count, base_frame,
 * frame_limit, seed, chunk_frames. Each metric adds two more (its window's
 * lo and stride).
 */
const CONFIG_FIXED_WORDS = 5;

/**
 * Words of run state staged on the host per `writeBuffer` call, 4 MiB worth.
 *
 * Large enough that the per-call overhead is irrelevant next to the copy, small
 * enough to allocate on any device. The seeding array used to be the whole run
 * state at once, which is where a million-run experiment died.
 */
const SEED_CHUNK_WORDS = 1024 * 1024;

/**
 * Host globals this module needs, reached structurally.
 *
 * This package is headless by design and pins `types: []` plus `lib: ["ESNext"]`
 * so it never depends on DOM typings (see `../environment.ts`). `@webgpu/types`
 * supplies the `GPU*` shapes, but `navigator` and `performance` are DOM globals,
 * so they are read through a narrow structural view instead of widening `lib`.
 */
const host = globalThis as unknown as {
  navigator?: { gpu?: GPU };
  performance?: { now: () => number };
};

/** Monotonic milliseconds, falling back to 0 where unavailable. */
function now(): number {
  return host.performance?.now() ?? 0;
}

export type GpuRunnerInitialState = {
  /** Initial token count per place, in profile order. */
  placeCounts: readonly number[];
  /**
   * Encoded initial token slots per place, in profile order: `count × stride`
   * u32 words per typed place (reals bitcast from f32, then discretes),
   * empty for uncoloured places. Without these a typed net's runs would
   * start with every attribute zero.
   */
  placeTokenWords?: readonly Uint32Array[];
};

export type GpuExperimentRequest = {
  runCount: number;
  /** Total frames to advance, across however many dispatches that takes. */
  frameLimit: number;
  /** Frames per dispatch. Smaller chunks keep the GPU watchdog satisfied. */
  framesPerDispatch: number;
  seed: number;
  initial: GpuRunnerInitialState;
  /**
   * Per-run parameter draws, run-major, `shader.runParameterIds.length` f32
   * values per run. Required exactly when the shader declares per-run
   * parameters; its length must be `runCount × runParameterIds.length`.
   */
  runParameterValues?: Float32Array;
  /** Invoked after each chunk so callers can report progress. */
  onChunk?: (progress: {
    /** Frames the current tile has advanced. Restarts per tile. */
    framesDone: number;
    frameLimit: number;
    /** Runs whose tiles have fully finished; 0 until the first tile ends. */
    runsCompleted: number;
    /** Runs the currently executing tile holds. */
    runsInTile: number;
    runCount: number;
  }) => void;
  /**
   * Invoked after each chunk with that chunk's decoded histogram frames, so
   * callers can stream metrics while the experiment runs. Frames whose
   * every metric sampled zero runs are skipped (all runs had finished).
   * The frames handed to the final result remain authoritative — replace,
   * do not append, when both are consumed.
   *
   * When the experiment runs in several tiles (see `runsPerTile`), later
   * tiles re-deliver earlier frame numbers with *cumulative* bins — the
   * histogram sums across tiles — so a frame's latest delivery supersedes
   * every earlier one.
   */
  onFrames?: (frames: GpuHistogramFrame[]) => void;
  /**
   * Each metric's histogram window, in `shader.metricIds` order. Defaults to
   * `{lo: 0, stride: 1}` per metric — the zero-anchored exact layout.
   */
  metricWindows?: readonly MetricWindow[];
  /**
   * Caps how many runs execute per tile, below what the device allows.
   * For tests and benchmarks; production callers let the device decide.
   */
  maxRunsPerTile?: number;
  /**
   * Stops the run at the next chunk boundary.
   *
   * A dispatch cannot be interrupted once submitted, so cancellation is only
   * observed between chunks — which is also why `framesPerDispatch` is bounded
   * rather than running the whole experiment in one dispatch.
   */
  signal?: AbortSignalLike;
};

export type GpuHistogramFrame = {
  /**
   * CPU-aligned frame number: frame 0 is the initial state (built by the
   * host — the device never samples it), and the histogram's bin `f` holds
   * the state after step `f`, published as frame `f + 1`.
   */
  frameNumber: number;
  metricId: string;
  /** `[value, frequency]` pairs, ascending, zero bins omitted. */
  bins: [number, number][];
  /** Runs that contributed a sample; equals the active run count. */
  sampleCount: number;
};

export type GpuExperimentResult = {
  /** True when the run stopped early because the signal aborted. */
  cancelled: boolean;
  frames: GpuHistogramFrame[];
  /** Final token counts per run per place, for inspection and tests. */
  finalPlaceCounts: Uint32Array;
  /** Runs that ended deadlocked (status 1) and completed (status 2). */
  deadlockedRuns: number;
  completedRuns: number;
  /**
   * Runs that overflowed a derived-capacity slab (status 3). Any overflow
   * invalidates the attempt: the caller grows the slab and re-runs.
   */
  overflowRuns: number;
  /**
   * Per derived-capacity place (in `shader.derivedCapacityPlaceIndices`
   * order): the largest per-run maximum count, and the mean of the per-run
   * maxima — the inputs to the capacity decision.
   */
  derivedPlaceMaxes: { max: number; meanRunMax: number }[];
  /** Wall-clock time spent inside dispatches, excluding setup. */
  dispatchMs: number;
  /**
   * Per metric, what the device observed: the sampled min/max count and how
   * many samples escaped the window (clamped into an edge bin). Any escape
   * means the frames are an intermediate picture and the caller should
   * recalibrate the windows and re-run.
   */
  metricRanges: ObservedMetricRange[];
};

/**
 * Derives a per-run RNG seed on the host.
 *
 * Kept in TypeScript rather than the shader so it is unit-testable and so the
 * same derivation can be reused if the CPU backend ever adopts this generator.
 * One PCG advance after mixing decorrelates adjacent run indices, which plain
 * sequential seeding leaves visibly correlated in the first few draws.
 */
/* eslint-disable no-bitwise -- a 32-bit PRNG is bit manipulation by definition */
export function deriveGpuRunSeed(
  baseSeed: number,
  globalRunIndex: number,
): number {
  const mixed = (baseSeed ^ Math.imul(globalRunIndex, 2654435761)) >>> 0;
  return (Math.imul(mixed, 747796405) + 2891336453) >>> 0;
}
/* eslint-enable no-bitwise */

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
    // buffer, the floor every conformant implementation must support. That is
    // unrelated to what the hardware can do: an Apple metal-3 adapter reports
    // 4096 MiB for both, so the default costs a factor of 32 and refused run
    // counts the GPU could hold comfortably.
    //
    // Asking for exactly what the adapter reports is always valid — the spec
    // only rejects asking for more — and raising a limit allocates nothing on
    // its own, so there is no cost to requesting the ceiling and then sizing
    // buffers to what the experiment actually needs.
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
 * Shader compilation errors are the failure mode a generated-code backend hits
 * most, and WebGPU surfaces them as console warnings by default rather than as
 * exceptions — so they are read explicitly here and turned into a real error.
 */
async function createPipeline(
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
 * No limit predicts this: host-visible memory for mappable readback is scarcer
 * than device memory and gives out well below `maxBufferSize`, so the honest
 * approach is to attempt the allocation and explain the failure rather than to
 * guess a threshold and refuse experiments that would have worked.
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
  // Readback doubles it: the state lives on the device and again in a mappable
  // buffer, and the mappable one is what runs out.
  return `The GPU could not allocate memory for a tile of ${runCount} runs: ${bytesPerRun} bytes per run is ${gib(
    stateBytes,
  )} GiB of run state, and reading it back needs that much again in host-visible memory. Lower the token capacities that set the per-run size. (${message.trim()})`;
}

/** How many runs to stage per `writeBuffer`, at least one however large a run is. */
export function seedRunsPerChunk(
  stateWordsPerRun: number,
  runCount: number,
): number {
  return Math.max(
    1,
    Math.min(runCount, Math.floor(SEED_CHUNK_WORDS / stateWordsPerRun)),
  );
}

/**
 * Writes one chunk of initial run state into a reused staging array.
 *
 * Separate and pure because the index arithmetic is the part that silently
 * corrupts: a run's RNG seed comes from its **absolute** index, so chunking must
 * not renumber it, and the staging array carries the previous chunk's contents
 * and has to be cleared before it is filled again.
 */
/* eslint-disable no-param-reassign -- filling the caller's reusable staging
   array is this function's purpose; returning a fresh one per chunk would
   reintroduce the allocation the chunking exists to avoid */
export function fillSeedChunk(
  staging: Uint32Array,
  {
    firstRun,
    runsInChunk,
    stateWordsPerRun,
    placeCountOffsets,
    placeTokenOffsets,
    rngOffset,
    placeCounts,
    placeTokenWords,
    seed,
  }: {
    firstRun: number;
    runsInChunk: number;
    stateWordsPerRun: number;
    placeCountOffsets: readonly number[];
    placeTokenOffsets?: readonly number[];
    rngOffset: number;
    placeCounts: readonly number[];
    placeTokenWords?: readonly Uint32Array[];
    seed: number;
  },
): void {
  // Defensive, and deliberately not load-bearing: every word this writes, it
  // writes for every run at the same offsets, and words it never writes are
  // zero from allocation — so reuse cannot leak a previous chunk today, and no
  // test can observe this line. It stays because the moment any field becomes
  // conditional, stale run state would be uploaded to the GPU silently.
  staging.fill(0, 0, runsInChunk * stateWordsPerRun);
  for (let run = 0; run < runsInChunk; run++) {
    const base = run * stateWordsPerRun;
    for (const [placeIndex, offset] of placeCountOffsets.entries()) {
      staging[base + offset] = placeCounts[placeIndex] ?? 0;
    }
    if (placeTokenWords !== undefined && placeTokenOffsets !== undefined) {
      for (const [placeIndex, words] of placeTokenWords.entries()) {
        const tokenBase = base + (placeTokenOffsets[placeIndex] ?? 0);
        for (let word = 0; word < words.length; word++) {
          staging[tokenBase + word] = words[word]!;
        }
      }
    }
    // The RNG word sits immediately before the status word, which is last in
    // the fixed header the shader lays out.
    staging[base + rngOffset] = deriveGpuRunSeed(seed, firstRun + run);
  }
}
/* eslint-enable no-param-reassign */

/**
 * How many runs one tile can hold on this device.
 *
 * Run state is one buffer of `bytesPerRun × runs`, so the buffer ceiling —
 * the smaller of `maxStorageBufferBindingSize` (per binding) and
 * `maxBufferSize` (per allocation, and the defaults are 128 MiB and 256 MiB,
 * so checking only the first moves the wall instead of finding it) — bounds
 * the runs per tile. So does the dispatch width: one invocation per run,
 * `maxComputeWorkgroupsPerDimension × GPU_WORKGROUP_SIZE` invocations per
 * dispatch. An experiment larger than a tile runs as several sequential
 * tiles over the same histogram buffer (see `runGpuExperiment`).
 *
 * Pure, and separate from `runGpuExperiment`, because the arithmetic is the
 * part users actually hit and a real `GPUDevice` cannot be had in a unit test.
 */
export function runsPerTile({
  bytesPerRun,
  limits,
}: {
  bytesPerRun: number;
  limits: Pick<
    GPUSupportedLimits,
    | "maxStorageBufferBindingSize"
    | "maxBufferSize"
    | "maxComputeWorkgroupsPerDimension"
  >;
}): number {
  const ceiling = Math.min(
    limits.maxStorageBufferBindingSize,
    limits.maxBufferSize,
  );
  const byMemory =
    bytesPerRun > 0
      ? Math.floor(ceiling / bytesPerRun)
      : Number.MAX_SAFE_INTEGER;
  const byDispatch =
    limits.maxComputeWorkgroupsPerDimension * GPU_WORKGROUP_SIZE;
  return Math.min(byMemory, byDispatch);
}

/**
 * Runs in the preview tile that opens a streamed experiment. Small enough
 * to finish in a fraction of a full tile's time, large enough that its
 * distributions have a usable shape — the same trade the window probe and
 * the CPU ladder's first rung make.
 */
export const GPU_PREVIEW_TILE_RUNS = 128;

/**
 * The run ranges of each tile. Uniform tiles of `tileRunCapacity`, except
 * that a streamed experiment opens with a small PREVIEW tile: every tile
 * re-delivers the whole time axis cumulatively, so a fast first tile puts a
 * statistically usable picture on screen while the bulk still computes —
 * the GPU's version of the ladder's first rung. Seeds derive from absolute
 * run indices, so the split changes nothing about the results.
 *
 * No preview when nobody streams (`previewRuns` null) or when the run count
 * is small enough that the preview would only add a tile boundary.
 */
export function planTiles(
  runCount: number,
  tileRunCapacity: number,
  previewRuns: number | null,
): { firstRun: number; runCount: number }[] {
  const tiles: { firstRun: number; runCount: number }[] = [];
  let firstRun = 0;
  if (
    previewRuns !== null &&
    previewRuns < tileRunCapacity &&
    runCount > previewRuns * 2
  ) {
    tiles.push({ firstRun: 0, runCount: previewRuns });
    firstRun = previewRuns;
  }
  while (firstRun < runCount) {
    const tileRuns = Math.min(tileRunCapacity, runCount - firstRun);
    tiles.push({ firstRun, runCount: tileRuns });
    firstRun += tileRuns;
  }
  return tiles;
}

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

/**
 * The frame counts of each dispatch chunk: a short ramp (32, 64, 128, ...)
 * up to `framesPerDispatch`, then steady.
 *
 * The first streamed frames should reach the charts in milliseconds even
 * when the whole run takes seconds; a fixed 300-frame chunk made the first
 * paint wait for half a typical run. The ramp costs at most three extra
 * dispatch round-trips per run.
 */
export function dispatchChunkFrames(
  frameLimit: number,
  framesPerDispatch: number,
): number[] {
  const chunks: number[] = [];
  let next = Math.min(32, framesPerDispatch);
  let done = 0;
  while (done < frameLimit) {
    const chunk = Math.min(next, framesPerDispatch, frameLimit - done);
    chunks.push(chunk);
    done += chunk;
    next *= 2;
  }
  return chunks;
}

/**
 * Decodes a contiguous frame range of the histogram buffer into sparse
 * per-metric frames. `data` starts at `firstFrame`'s bins; a bin's value is
 * its window position, `lo + bin × stride`.
 */
function decodeHistogramFrames(options: {
  data: Uint32Array;
  firstFrame: number;
  frameCount: number;
  metricIds: readonly string[];
  /** Bins per metric per frame — the compiled shader's `histogramBins`. */
  histogramBins: number;
  /** Each metric's window, in `metricIds` order. */
  windows: readonly MetricWindow[];
}): { frames: GpuHistogramFrame[] } {
  const { data, firstFrame, frameCount, metricIds, histogramBins, windows } =
    options;
  const metricCount = metricIds.length;
  const frames: GpuHistogramFrame[] = [];
  for (let frame = 0; frame < frameCount; frame++) {
    for (const [metricIndex, metricId] of metricIds.entries()) {
      const window = windows[metricIndex] ?? { lo: 0, stride: 1 };
      // A bin covers `stride` counts; reporting its middle keeps a wide
      // window's means unbiased where the low edge skewed them down by
      // (stride − 1) / 2. Exact (offset 0) at stride 1.
      const binMidpoint = Math.floor((window.stride - 1) / 2);
      const offset =
        frame * histogramBins * metricCount + metricIndex * histogramBins;
      const bins: [number, number][] = [];
      let sampleCount = 0;
      for (let bin = 0; bin < histogramBins; bin++) {
        const frequency = data[offset + bin] ?? 0;
        if (frequency > 0) {
          bins.push([window.lo + bin * window.stride + binMidpoint, frequency]);
          sampleCount += frequency;
        }
      }
      frames.push({
        frameNumber: firstFrame + frame,
        metricId,
        bins,
        sampleCount,
      });
    }
  }
  return { frames };
}

export async function runGpuExperiment(
  handle: GpuDeviceHandle,
  shader: CompiledNetShader,
  request: GpuExperimentRequest,
): Promise<
  { ok: true; result: GpuExperimentResult } | { ok: false; reason: string }
> {
  const { device } = handle;
  const {
    runCount,
    frameLimit,
    framesPerDispatch,
    seed,
    initial,
    runParameterValues,
  } = request;
  const metricCount = shader.metricIds.length;

  const runParameterCount = shader.runParameterIds.length;
  const expectedRunParameterValues = runParameterCount * runCount;
  if ((runParameterValues?.length ?? 0) !== expectedRunParameterValues) {
    return {
      ok: false,
      reason: `The shader expects ${expectedRunParameterValues} per-run parameter values (${runParameterCount} per run) but ${runParameterValues?.length ?? 0} were supplied.`,
    };
  }

  const compiled = await createPipeline(device, shader.wgsl);
  if (!compiled.ok) {
    return compiled;
  }

  const metricWindows: MetricWindow[] = shader.metricIds.map(
    (_, index) => request.metricWindows?.[index] ?? { lo: 0, stride: 1 },
  );
  const configWords = new Uint32Array(CONFIG_FIXED_WORDS + 2 * metricCount);
  for (const [index, window] of metricWindows.entries()) {
    configWords[CONFIG_FIXED_WORDS + 2 * index] = window.lo;
    configWords[CONFIG_FIXED_WORDS + 2 * index + 1] = Math.max(
      1,
      window.stride,
    );
  }

  const bytesPerRun = shader.stateWordsPerRun * 4;
  const histWords = Math.max(
    1,
    frameLimit * shader.histogramBins * metricCount,
  );
  const histBytes = histWords * 4;

  const tooLarge = describeBufferOverflow({
    histBytes,
    bytesPerRun,
    limits: device.limits,
  });
  if (tooLarge !== null) {
    return { ok: false, reason: tooLarge };
  }

  // An experiment larger than the device's buffers or dispatch width runs as
  // sequential tiles: per-run state and summaries are sized for one tile and
  // re-seeded per tile, while every tile's dispatches accumulate into the one
  // histogram buffer — bins are sums, so the merge is free. Within a tile a
  // run's seed comes from its absolute index, so a tiled experiment draws the
  // same per-run streams as an untiled one.
  const tileRunCapacity = Math.max(
    1,
    Math.min(
      runCount,
      runsPerTile({ bytesPerRun, limits: device.limits }),
      request.maxRunsPerTile ?? Number.MAX_SAFE_INTEGER,
    ),
  );
  const tilePlan = planTiles(
    runCount,
    tileRunCapacity,
    request.onFrames !== undefined && metricCount > 0
      ? GPU_PREVIEW_TILE_RUNS
      : null,
  );

  const stateBytes = shader.stateWordsPerRun * tileRunCapacity * 4;
  const summaryWords = Math.max(1, shader.summaryWordsPerRun * tileRunCapacity);
  const summaryBytes = summaryWords * 4;

  // Buffer allocation is the failure nobody was told about. Dawn reports an
  // out-of-memory `createBuffer` by returning an *error buffer* rather than
  // throwing, so allocation appears to succeed and the first visible symptom is
  // three operations downstream — "[Invalid Buffer] is invalid due to a previous
  // error" from `mapAsync`, long after the dispatch has run. The real message
  // ("Failed to allocate memory for buffer mapping") only exists inside an error
  // scope, and none was pushed here.
  //
  // Mappable readback is the buffer that actually runs out: host-visible memory
  // is scarcer than device memory, and it fails well below `maxBufferSize`, so
  // no limit check can predict it. Measured on an Apple metal-3 adapter, a
  // 1.94 GiB readback allocates and a 2.90 GiB one does not, with
  // `maxBufferSize` reporting 4 GiB in both cases.
  device.pushErrorScope("out-of-memory");

  /* eslint-disable no-bitwise -- GPUBufferUsage flags are a bit field */
  // No COPY_SRC: run state never leaves the device now.
  const stateBuffer = device.createBuffer({
    size: stateBytes,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  const summaryBuffer = device.createBuffer({
    size: summaryBytes,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  });
  const histBuffer = device.createBuffer({
    size: histBytes,
    usage:
      GPUBufferUsage.STORAGE |
      GPUBufferUsage.COPY_SRC |
      GPUBufferUsage.COPY_DST,
  });
  const configBuffer = device.createBuffer({
    size: configWords.byteLength,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  // Per metric: [observed min, observed max, escapes below, escapes above].
  // Min slots start at the u32 maximum so the shader's atomicMin works.
  const rangeBuffer =
    metricCount === 0
      ? null
      : device.createBuffer({
          size: metricCount * 4 * 4,
          usage:
            GPUBufferUsage.STORAGE |
            GPUBufferUsage.COPY_SRC |
            GPUBufferUsage.COPY_DST,
        });
  const rangeReadback =
    metricCount === 0
      ? null
      : device.createBuffer({
          size: metricCount * 4 * 4,
          usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
        });
  // One chunk's worth of histogram, re-used for streaming readbacks. Only
  // allocated when the caller wants frames streamed.
  const chunkFrameCapacity = Math.min(framesPerDispatch, frameLimit);
  const chunkHistBytes =
    chunkFrameCapacity * shader.histogramBins * metricCount * 4;
  const chunkReadback =
    request.onFrames === undefined || metricCount === 0
      ? null
      : device.createBuffer({
          size: Math.max(4, chunkHistBytes),
          usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
        });
  // Per-run parameter draws; a placeholder is never created — the binding
  // only exists in shaders compiled with per-run parameters. Sized for one
  // tile and rewritten per tile with that tile's slice.
  const runParamsBuffer =
    runParameterValues === undefined || runParameterCount === 0
      ? null
      : device.createBuffer({
          size: tileRunCapacity * runParameterCount * 4,
          usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });
  const summaryReadback = device.createBuffer({
    size: summaryBytes,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });
  const histReadback = device.createBuffer({
    size: histBytes,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });
  /* eslint-enable no-bitwise */

  const destroyAll = () => {
    for (const buffer of [
      stateBuffer,
      summaryBuffer,
      histBuffer,
      configBuffer,
      summaryReadback,
      histReadback,
    ]) {
      buffer.destroy();
    }
    runParamsBuffer?.destroy();
    chunkReadback?.destroy();
    rangeBuffer?.destroy();
    rangeReadback?.destroy();
  };

  const allocationError = await device.popErrorScope();
  if (allocationError) {
    destroyAll();
    return {
      ok: false,
      reason: describeAllocationFailure({
        message: allocationError.message,
        stateBytes,
        bytesPerRun,
        runCount: tileRunCapacity,
      }),
    };
  }

  try {
    const placeCount = shader.placeCountOffsets.length;
    const finalPlaceCounts = new Uint32Array(runCount * placeCount);
    const derivedCount = shader.derivedCapacityPlaceIndices.length;
    const derivedMax = new Array<number>(derivedCount).fill(0);
    const derivedSum = new Array<number>(derivedCount).fill(0);
    let derivedRuns = 0;
    let deadlockedRuns = 0;
    let completedRuns = 0;
    let overflowRuns = 0;
    let cancelled = false;
    let dispatchMs = 0;

    const bindGroup = device.createBindGroup({
      layout: compiled.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: stateBuffer } },
        { binding: 1, resource: { buffer: histBuffer } },
        { binding: 2, resource: { buffer: configBuffer } },
        { binding: 3, resource: { buffer: summaryBuffer } },
        ...(runParamsBuffer === null
          ? []
          : [{ binding: 4, resource: { buffer: runParamsBuffer } }]),
        ...(rangeBuffer === null
          ? []
          : [{ binding: 5, resource: { buffer: rangeBuffer } }]),
      ],
    });

    if (rangeBuffer !== null) {
      const rangeInit = new Uint32Array(metricCount * 4);
      for (let metric = 0; metric < metricCount; metric++) {
        rangeInit[metric * 4] = 0xffffffff;
      }
      device.queue.writeBuffer(rangeBuffer, 0, rangeInit);
    }

    device.pushErrorScope("validation");

    // The staging array is sized for one seeding chunk and reused across
    // every tile. Written in chunks rather than as one array: a single
    // `Uint32Array` of a tile's state is the largest allocation the host
    // makes — at 2 KB per run, a million runs is ~2 GiB in one contiguous
    // ArrayBuffer, which the browser refuses with "Array buffer allocation
    // failed" before a single frame runs.
    const runsPerChunk = seedRunsPerChunk(
      shader.stateWordsPerRun,
      tileRunCapacity,
    );
    const staging = new Uint32Array(runsPerChunk * shader.stateWordsPerRun);

    for (const tile of tilePlan) {
      const tileFirstRun = tile.firstRun;
      const runsInTile = tile.runCount;
      if (cancelled) {
        break;
      }

      // Seed the tile's initial state on the host: counts from the initial
      // marking, a per-run RNG stream, everything else zero. A run's seed
      // comes from its absolute index, so the chunking and the tiling must
      // not renumber it.
      for (let firstRun = 0; firstRun < runsInTile; firstRun += runsPerChunk) {
        const runsInChunk = Math.min(runsPerChunk, runsInTile - firstRun);
        fillSeedChunk(staging, {
          firstRun: tileFirstRun + firstRun,
          runsInChunk,
          stateWordsPerRun: shader.stateWordsPerRun,
          placeCountOffsets: shader.placeCountOffsets,
          placeTokenOffsets: shader.placeTokenOffsets,
          rngOffset: shader.rngOffset,
          placeCounts: initial.placeCounts,
          ...(initial.placeTokenWords === undefined
            ? {}
            : { placeTokenWords: initial.placeTokenWords }),
          seed,
        });
        device.queue.writeBuffer(
          stateBuffer,
          firstRun * shader.stateWordsPerRun * 4,
          staging,
          0,
          runsInChunk * shader.stateWordsPerRun,
        );
      }

      if (runParamsBuffer !== null && runParameterValues !== undefined) {
        device.queue.writeBuffer(
          runParamsBuffer,
          0,
          runParameterValues,
          tileFirstRun * runParameterCount,
          runsInTile * runParameterCount,
        );
      }

      const workgroups = Math.ceil(runsInTile / GPU_WORKGROUP_SIZE);
      const start = now();

      let baseFrame = 0;
      for (const chunkFrameCount of dispatchChunkFrames(
        frameLimit,
        framesPerDispatch,
      )) {
        // A submitted dispatch cannot be interrupted, so cancellation is
        // observed between chunks. Frames already advanced stay in the
        // histogram, and the caller is told the run was cut short.
        if (request.signal?.aborted) {
          cancelled = true;
          break;
        }
        configWords[0] = runsInTile;
        configWords[1] = baseFrame;
        configWords[2] = frameLimit;
        configWords[3] = seed;
        configWords[4] = chunkFrameCount;
        device.queue.writeBuffer(configBuffer, 0, configWords);
        const encoder = device.createCommandEncoder();
        const pass = encoder.beginComputePass();
        pass.setPipeline(compiled.pipeline);
        pass.setBindGroup(0, bindGroup);
        pass.dispatchWorkgroups(workgroups);
        pass.end();
        device.queue.submit([encoder.finish()]);
        // Awaiting per chunk (not per frame) keeps the browser responsive and
        // bounds how far ahead the queue runs, at negligible cost.
        await device.queue.onSubmittedWorkDone();
        const framesDone = Math.min(baseFrame + chunkFrameCount, frameLimit);
        if (chunkReadback !== null) {
          // The histogram is cumulative and every frame's bins are final once
          // its dispatch retired, so the chunk's range can be read while later
          // dispatches queue. Later tiles re-read ranges earlier tiles already
          // streamed; the re-decoded frames carry every tile's samples so far,
          // and the caller replaces by frame number.
          const chunkFrames = framesDone - baseFrame;
          const chunkBytes =
            chunkFrames * shader.histogramBins * metricCount * 4;
          const copyEncoder = device.createCommandEncoder();
          copyEncoder.copyBufferToBuffer(
            histBuffer,
            baseFrame * shader.histogramBins * metricCount * 4,
            chunkReadback,
            0,
            chunkBytes,
          );
          device.queue.submit([copyEncoder.finish()]);
          await chunkReadback.mapAsync(GPUMapMode.READ, 0, chunkBytes);
          const decoded = decodeHistogramFrames({
            data: new Uint32Array(chunkReadback.getMappedRange(0, chunkBytes)),
            firstFrame: baseFrame + 1,
            frameCount: chunkFrames,
            metricIds: shader.metricIds,
            histogramBins: shader.histogramBins,
            windows: metricWindows,
          });
          chunkReadback.unmap();
          const live = decoded.frames.filter((frame) => frame.sampleCount > 0);
          if (live.length > 0) {
            request.onFrames?.(live);
          }
        }
        request.onChunk?.({
          framesDone,
          frameLimit,
          runsCompleted: tileFirstRun,
          runsInTile,
          runCount,
        });
        baseFrame = framesDone;
      }

      dispatchMs += now() - start;

      if (baseFrame === 0) {
        // Cancelled before this tile dispatched anything: the summary buffer
        // still holds the previous tile's runs, and decoding it here would
        // credit those results to this tile's run indices.
        break;
      }

      // The summary buffer holds one tile and the next tile overwrites it, so
      // it is decoded here, into the experiment-wide arrays at the tile's
      // absolute run offsets. The shader gathered a few words per run, so this
      // walks those rather than the whole run state.
      const tileSummaryBytes = runsInTile * shader.summaryWordsPerRun * 4;
      const encoder = device.createCommandEncoder();
      encoder.copyBufferToBuffer(
        summaryBuffer,
        0,
        summaryReadback,
        0,
        tileSummaryBytes,
      );
      device.queue.submit([encoder.finish()]);
      await summaryReadback.mapAsync(GPUMapMode.READ, 0, tileSummaryBytes);
      const summary = new Uint32Array(
        summaryReadback.getMappedRange(0, tileSummaryBytes),
      );
      for (let run = 0; run < runsInTile; run++) {
        const base = run * shader.summaryWordsPerRun;
        const status = summary[base + shader.summaryStatusOffset] ?? 0;
        // Both 1 (deadlocked) and 2 (reached the frame limit) are finished
        // runs, and the CPU engine reports either as `complete` — a run that
        // deadlocks has completed, it just stopped early. Counting only 2 made
        // a net where every run deadlocks report "0 complete" while its status
        // said Complete. `deadlockedRuns` stays separate for diagnostics.
        if (status === 1) {
          deadlockedRuns++;
          completedRuns++;
        } else if (status === 2) {
          completedRuns++;
        } else if (status === 3) {
          overflowRuns++;
        }
        for (let slot = 0; slot < derivedCount; slot++) {
          const runMax = summary[base + placeCount + 1 + slot] ?? 0;
          derivedMax[slot] = Math.max(derivedMax[slot]!, runMax);
          derivedSum[slot] = derivedSum[slot]! + runMax;
        }
        derivedRuns++;
        // Counts lead the summary in place order, so the place index is the
        // offset.
        for (let placeIndex = 0; placeIndex < placeCount; placeIndex++) {
          finalPlaceCounts[(tileFirstRun + run) * placeCount + placeIndex] =
            summary[base + placeIndex] ?? 0;
        }
      }
      summaryReadback.unmap();
    }

    const dispatchError = await device.popErrorScope();
    if (dispatchError) {
      return {
        ok: false,
        reason: `GPU dispatch failed: ${dispatchError.message}`,
      };
    }

    const histEncoder = device.createCommandEncoder();
    histEncoder.copyBufferToBuffer(histBuffer, 0, histReadback, 0, histBytes);
    if (rangeBuffer !== null && rangeReadback !== null) {
      histEncoder.copyBufferToBuffer(
        rangeBuffer,
        0,
        rangeReadback,
        0,
        metricCount * 4 * 4,
      );
    }
    device.queue.submit([histEncoder.finish()]);

    const metricRanges: ObservedMetricRange[] = [];
    if (rangeReadback !== null) {
      await rangeReadback.mapAsync(GPUMapMode.READ);
      const rangeWords = new Uint32Array(rangeReadback.getMappedRange());
      for (let metric = 0; metric < metricCount; metric++) {
        metricRanges.push({
          min: rangeWords[metric * 4]!,
          max: rangeWords[metric * 4 + 1]!,
          below: rangeWords[metric * 4 + 2]!,
          above: rangeWords[metric * 4 + 3]!,
        });
      }
      rangeReadback.unmap();
    }

    await histReadback.mapAsync(GPUMapMode.READ);
    // Read through the mapped range rather than copying it: `.slice(0)`
    // doubled the host cost of every experiment for a copy thrown away
    // immediately. It stays mapped until the decode loops below are done.
    const histogram = new Uint32Array(histReadback.getMappedRange());

    // Frames past the last recorded sample carry no data: every run had
    // finished (all deadlocked, say) or the experiment was cancelled between
    // chunks. The CPU path stops emitting frames at that point, so decoding
    // them here would append a null-valued tail across the rest of the
    // timeline — cancel a 1M-frame experiment after one chunk and the chart
    // would carry 999k empty points.
    let decodedFrameLimit = 0;
    outer: for (let frame = frameLimit - 1; frame >= 0; frame--) {
      for (let metricIndex = 0; metricIndex < metricCount; metricIndex++) {
        const offset =
          frame * shader.histogramBins * metricCount +
          metricIndex * shader.histogramBins;
        for (let bin = 0; bin < shader.histogramBins; bin++) {
          if ((histogram[offset + bin] ?? 0) > 0) {
            decodedFrameLimit = frame + 1;
            break outer;
          }
        }
      }
    }

    const { frames } = decodeHistogramFrames({
      data: histogram,
      firstFrame: 1,
      frameCount: decodedFrameLimit,
      metricIds: shader.metricIds,
      histogramBins: shader.histogramBins,
      windows: metricWindows,
    });

    // Last use of the view; everything returned below is host-owned.
    histReadback.unmap();

    return {
      ok: true,
      result: {
        cancelled,
        frames,
        finalPlaceCounts,
        deadlockedRuns,
        completedRuns,
        overflowRuns,
        derivedPlaceMaxes: derivedMax.map((max, slot) => ({
          max,
          meanRunMax: derivedRuns === 0 ? 0 : derivedSum[slot]! / derivedRuns,
        })),
        dispatchMs,
        metricRanges,
      },
    };
  } finally {
    destroyAll();
  }
}
