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
import { GPU_HISTOGRAM_BINS, GPU_WORKGROUP_SIZE } from "./compile-net-shader";
import { isWebGpuAvailable } from "./support";

import type { AbortSignalLike } from "../environment";
import type { CompiledNetShader } from "./compile-net-shader";

/** Words in the uniform config block: run_count, base_frame, frame_limit, seed. */
const CONFIG_WORDS = 5;

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
  onChunk?: (progress: { framesDone: number; frameLimit: number }) => void;
  /**
   * Invoked after each chunk with that chunk's decoded histogram frames, so
   * callers can stream metrics while the experiment runs. Frames whose
   * every metric sampled zero runs are skipped (all runs had finished).
   * The frames handed to the final result remain authoritative — replace,
   * do not append, when both are consumed.
   */
  onFrames?: (frames: GpuHistogramFrame[]) => void;
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
  /** Wall-clock time spent inside dispatches, excluding setup. */
  dispatchMs: number;
  /**
   * Values that landed in the histogram's final bin.
   *
   * The top bin is saturating, so a non-zero count here means some samples were
   * clamped and the distribution's tail is not trustworthy.
   */
  saturatedSamples: number;
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
  return `The GPU could not allocate memory for ${runCount} runs: ${bytesPerRun} bytes per run is ${gib(
    stateBytes,
  )} GiB of run state, and reading it back needs that much again in host-visible memory. Try fewer runs, or lower the token capacities that set the per-run size. (${message.trim()})`;
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
 * Why this experiment's buffers will not fit on this device, or `null` if they
 * will.
 *
 * Pure, and separate from `runGpuExperiment`, because the arithmetic is the part
 * users actually hit and a real `GPUDevice` cannot be had in a unit test.
 *
 * Two device limits bind independently. `maxStorageBufferBindingSize` caps a
 * single binding and `maxBufferSize` caps the allocation; the defaults are
 * 128 MiB and 256 MiB, so checking only the first moves the wall instead of
 * finding it and the allocation fails later as a raw WebGPU validation error.
 * Neither default reflects the hardware — see `requestGpuDevice`, which now asks
 * for the adapter's own limits.
 */
export function describeBufferOverflow({
  stateBytes,
  histBytes,
  bytesPerRun,
  runCount,
  limits,
}: {
  stateBytes: number;
  histBytes: number;
  bytesPerRun: number;
  runCount: number;
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

  if (stateBytes > ceiling) {
    // Say what would fit rather than "use fewer runs", which left the author to
    // bisect. Run state is exactly linear in the run count, so the number is
    // both computable and correct.
    const runsThatFit = bytesPerRun > 0 ? Math.floor(ceiling / bytesPerRun) : 0;
    return `Run state needs ${mb(stateBytes)} MB but this device caps a buffer at ${mb(
      ceiling,
    )} MB. At ${bytesPerRun} bytes per run that is ${runsThatFit} runs; this experiment asked for ${runCount}.`;
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
 * per-metric frames. `data` starts at `firstFrame`'s bins; saturated counts
 * are the top bin's, summed across everything decoded.
 */
function decodeHistogramFrames(options: {
  data: Uint32Array;
  firstFrame: number;
  frameCount: number;
  metricIds: readonly string[];
}): { frames: GpuHistogramFrame[]; saturatedSamples: number } {
  const { data, firstFrame, frameCount, metricIds } = options;
  const metricCount = metricIds.length;
  const frames: GpuHistogramFrame[] = [];
  let saturatedSamples = 0;
  for (let frame = 0; frame < frameCount; frame++) {
    for (const [metricIndex, metricId] of metricIds.entries()) {
      const offset =
        frame * GPU_HISTOGRAM_BINS * metricCount +
        metricIndex * GPU_HISTOGRAM_BINS;
      const bins: [number, number][] = [];
      let sampleCount = 0;
      for (let bin = 0; bin < GPU_HISTOGRAM_BINS; bin++) {
        const frequency = data[offset + bin] ?? 0;
        if (frequency > 0) {
          bins.push([bin, frequency]);
          sampleCount += frequency;
        }
      }
      saturatedSamples += data[offset + GPU_HISTOGRAM_BINS - 1] ?? 0;
      frames.push({
        frameNumber: firstFrame + frame,
        metricId,
        bins,
        sampleCount,
      });
    }
  }
  return { frames, saturatedSamples };
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

  const stateWords = shader.stateWordsPerRun * runCount;
  const stateBytes = stateWords * 4;
  const histWords = Math.max(1, frameLimit * GPU_HISTOGRAM_BINS * metricCount);
  const histBytes = histWords * 4;
  const summaryWords = Math.max(1, shader.summaryWordsPerRun * runCount);
  const summaryBytes = summaryWords * 4;

  const tooLarge = describeBufferOverflow({
    stateBytes,
    histBytes,
    bytesPerRun: shader.stateWordsPerRun * 4,
    runCount,
    limits: device.limits,
  });
  if (tooLarge !== null) {
    return { ok: false, reason: tooLarge };
  }

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
    size: CONFIG_WORDS * 4,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  // One chunk's worth of histogram, re-used for streaming readbacks. Only
  // allocated when the caller wants frames streamed.
  const chunkFrameCapacity = Math.min(framesPerDispatch, frameLimit);
  const chunkHistBytes =
    chunkFrameCapacity * GPU_HISTOGRAM_BINS * metricCount * 4;
  const chunkReadback =
    request.onFrames === undefined || metricCount === 0
      ? null
      : device.createBuffer({
          size: Math.max(4, chunkHistBytes),
          usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
        });
  // Per-run parameter draws; a placeholder is never created — the binding
  // only exists in shaders compiled with per-run parameters.
  const runParamsBuffer =
    runParameterValues === undefined || runParameterCount === 0
      ? null
      : device.createBuffer({
          size: runParameterValues.byteLength,
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
  };

  const allocationError = await device.popErrorScope();
  if (allocationError) {
    destroyAll();
    return {
      ok: false,
      reason: describeAllocationFailure({
        message: allocationError.message,
        stateBytes,
        bytesPerRun: shader.stateWordsPerRun * 4,
        runCount,
      }),
    };
  }

  try {
    // Seed initial state on the host: counts from the initial marking, a
    // per-run RNG stream, everything else zero.
    //
    // Written in chunks rather than as one array. A single `Uint32Array` of the
    // whole state is the largest allocation the host makes — at 2 KB per run,
    // a million runs is ~2 GiB in one contiguous ArrayBuffer, which the browser
    // refuses with "Array buffer allocation failed" before a single frame runs.
    // The GPU itself is fine with that size; only the host mirror was the
    // problem. Runs are independent and laid out contiguously, so the staging
    // array can be small and reused.
    const runsPerChunk = seedRunsPerChunk(shader.stateWordsPerRun, runCount);
    const staging = new Uint32Array(runsPerChunk * shader.stateWordsPerRun);
    for (let firstRun = 0; firstRun < runCount; firstRun += runsPerChunk) {
      const runsInChunk = Math.min(runsPerChunk, runCount - firstRun);
      fillSeedChunk(staging, {
        firstRun,
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
      device.queue.writeBuffer(runParamsBuffer, 0, runParameterValues);
    }

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
      ],
    });

    const workgroups = Math.ceil(runCount / GPU_WORKGROUP_SIZE);
    if (workgroups > device.limits.maxComputeWorkgroupsPerDimension) {
      return {
        ok: false,
        reason: `${runCount} runs needs ${workgroups} workgroups, above this device's per-dispatch limit of ${device.limits.maxComputeWorkgroupsPerDimension}.`,
      };
    }

    const start = now();
    device.pushErrorScope("validation");

    let cancelled = false;
    let baseFrame = 0;
    for (const chunkFrameCount of dispatchChunkFrames(
      frameLimit,
      framesPerDispatch,
    )) {
      // A submitted dispatch cannot be interrupted, so cancellation is observed
      // between chunks. Frames already advanced stay in the histogram, and the
      // caller is told the run was cut short.
      if (request.signal?.aborted) {
        cancelled = true;
        break;
      }
      device.queue.writeBuffer(
        configBuffer,
        0,
        new Uint32Array([
          runCount,
          baseFrame,
          frameLimit,
          seed,
          chunkFrameCount,
        ]),
      );
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
        // dispatches queue.
        const chunkFrames = framesDone - baseFrame;
        const chunkBytes = chunkFrames * GPU_HISTOGRAM_BINS * metricCount * 4;
        const copyEncoder = device.createCommandEncoder();
        copyEncoder.copyBufferToBuffer(
          histBuffer,
          baseFrame * GPU_HISTOGRAM_BINS * metricCount * 4,
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
      });
      baseFrame = framesDone;
    }

    const dispatchError = await device.popErrorScope();
    if (dispatchError) {
      return {
        ok: false,
        reason: `GPU dispatch failed: ${dispatchError.message}`,
      };
    }
    const dispatchMs = now() - start;

    const encoder = device.createCommandEncoder();
    encoder.copyBufferToBuffer(
      summaryBuffer,
      0,
      summaryReadback,
      0,
      summaryBytes,
    );
    encoder.copyBufferToBuffer(histBuffer, 0, histReadback, 0, histBytes);
    device.queue.submit([encoder.finish()]);

    await Promise.all([
      summaryReadback.mapAsync(GPUMapMode.READ),
      histReadback.mapAsync(GPUMapMode.READ),
    ]);
    // Read through the mapped ranges rather than copying them: `.slice(0)`
    // doubled the host cost of every experiment for a copy thrown away
    // immediately. Both stay mapped until the decode loops below are done.
    const summary = new Uint32Array(summaryReadback.getMappedRange());
    const histogram = new Uint32Array(histReadback.getMappedRange());

    // Decode: per-run status, per-run final counts, per-frame histograms. The
    // shader gathered the first two into `summary`, so this walks a few words per
    // run rather than the whole run state.
    let deadlockedRuns = 0;
    let completedRuns = 0;
    const placeCount = shader.placeCountOffsets.length;
    const finalPlaceCounts = new Uint32Array(runCount * placeCount);
    for (let run = 0; run < runCount; run++) {
      const base = run * shader.summaryWordsPerRun;
      const status = summary[base + shader.summaryStatusOffset] ?? 0;
      // Both 1 (deadlocked) and 2 (reached the frame limit) are finished runs,
      // and the CPU engine reports either as `complete` — a run that deadlocks
      // has completed, it just stopped early. Counting only 2 made a net where
      // every run deadlocks report "0 complete" while its status said Complete.
      // `deadlockedRuns` stays separate for diagnostics.
      if (status === 1) {
        deadlockedRuns++;
        completedRuns++;
      } else if (status === 2) {
        completedRuns++;
      }
      // Counts lead the summary in place order, so the place index is the offset.
      for (let placeIndex = 0; placeIndex < placeCount; placeIndex++) {
        finalPlaceCounts[run * placeCount + placeIndex] =
          summary[base + placeIndex] ?? 0;
      }
    }

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
          frame * GPU_HISTOGRAM_BINS * metricCount +
          metricIndex * GPU_HISTOGRAM_BINS;
        for (let bin = 0; bin < GPU_HISTOGRAM_BINS; bin++) {
          if ((histogram[offset + bin] ?? 0) > 0) {
            decodedFrameLimit = frame + 1;
            break outer;
          }
        }
      }
    }

    const { frames, saturatedSamples } = decodeHistogramFrames({
      data: histogram,
      firstFrame: 1,
      frameCount: decodedFrameLimit,
      metricIds: shader.metricIds,
    });

    // Last use of both views; everything returned below is host-owned.
    summaryReadback.unmap();
    histReadback.unmap();

    return {
      ok: true,
      result: {
        cancelled,
        frames,
        finalPlaceCounts,
        deadlockedRuns,
        completedRuns,
        dispatchMs,
        saturatedSamples,
      },
    };
  } finally {
    destroyAll();
  }
}
