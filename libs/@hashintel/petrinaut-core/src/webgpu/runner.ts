/**
 * Runs a compiled net shader on a WebGPU device.
 *
 * The API is deliberately whole-experiment rather than per-frame. Implementing
 * `MonteCarloSimulator.advanceAll()` — synchronous, one frame at a time — would
 * force a `mapAsync` readback per frame, and "The WebGPU backend" in
 * `libs/@local/petrinaut-arch-docs/content/simulation/performance.mdx`
 * measures that round-trip at hundreds of microseconds against roughly a
 * microsecond of per-frame work. Instead the host dispatches a chunk of frames,
 * and results come back as per-frame histograms accumulated on the device.
 *
 * An experiment larger than the device's buffers or dispatch width runs as
 * sequential tiles: per-run state and summaries are sized for one tile and
 * re-seeded per tile, while every tile's dispatches accumulate into the one
 * histogram buffer — bins are sums, so the merge is free.
 */
import { GPU_WORKGROUP_SIZE } from "./compile-net-shader";
import {
  createPipeline,
  describeAllocationFailure,
  describeBufferOverflow,
  now,
  uniformBufferSize,
} from "./runner/device";
import {
  decodeHistogramFrames,
  sampledFrameCount,
} from "./runner/histogram-frames";
import { fillSeedChunk, seedRunsPerChunk } from "./runner/seeds";
import { dispatchChunkFrames, planTiles, runsPerTile } from "./runner/tiles";

import type { AbortSignalLike } from "../environment";
import type { CompiledNetShader } from "./compile-net-shader";
import type { MetricWindow, ObservedMetricRange } from "./metric-windows";
import type { GpuDeviceHandle } from "./runner/device";
import type { GpuHistogramFrame } from "./runner/histogram-frames";

export { requestGpuDevice } from "./runner/device";
export { GPU_PREVIEW_RUNS } from "./runner/tiles";
export type { GpuDeviceHandle, GpuHistogramFrame };

/**
 * Fixed words in the uniform config block: run_count, base_frame,
 * frame_limit, seed, chunk_frames. Each metric adds two more (its window's
 * lo and stride).
 */
const CONFIG_FIXED_WORDS = 5;

export type GpuRunnerInitialState = {
  /** Initial token count per place, in profile order. */
  placeCounts: readonly number[];
  /**
   * Encoded initial token slots per place, in profile order: `count × stride`
   * u32 words per typed place, empty for uncoloured places. Without these a
   * typed net's runs would start with every attribute zero.
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
   * When the experiment runs in several tiles, later tiles re-deliver
   * earlier frame numbers with *cumulative* bins — the histogram sums across
   * tiles — so a frame's latest delivery supersedes every earlier one.
   */
  onFrames?: (frames: GpuHistogramFrame[]) => void;
  /**
   * Runs in an opening preview tile, so a streamed experiment's first
   * cumulative delivery arrives in a fraction of a full tile's time; null
   * for no preview (a probe, or an experiment nobody watches).
   */
  previewRuns: number | null;
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
  const histWordsPerFrame = shader.histogramBins * metricCount;
  const histBytes = Math.max(1, frameLimit * histWordsPerFrame) * 4;

  const tooLarge = describeBufferOverflow({
    histBytes,
    bytesPerRun,
    limits: device.limits,
  });
  if (tooLarge !== null) {
    return { ok: false, reason: tooLarge };
  }

  const tileRunCapacity = Math.max(
    1,
    Math.min(
      runCount,
      runsPerTile({ bytesPerRun, limits: device.limits }),
      request.maxRunsPerTile ?? Number.MAX_SAFE_INTEGER,
    ),
  );
  const tilePlan = planTiles(runCount, tileRunCapacity, request.previewRuns);

  const stateBytes = shader.stateWordsPerRun * tileRunCapacity * 4;
  const summaryBytes =
    Math.max(1, shader.summaryWordsPerRun * tileRunCapacity) * 4;

  // Dawn reports an out-of-memory `createBuffer` by returning an *error
  // buffer* rather than throwing, so allocation appears to succeed and the
  // first visible symptom is `mapAsync` failing three operations downstream.
  // The real message only exists inside an error scope. Mappable readback is
  // the buffer that runs out: host-visible memory is scarcer than device
  // memory and fails well below `maxBufferSize` (measured on an Apple metal-3
  // adapter: a 1.94 GiB readback allocates, a 2.90 GiB one does not, with
  // `maxBufferSize` reporting 4 GiB), so no limit check can predict it.
  device.pushErrorScope("out-of-memory");

  /* eslint-disable no-bitwise -- GPUBufferUsage flags are a bit field */
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
    size: uniformBufferSize(configWords.byteLength),
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  // Per metric: [observed min, observed max, escapes below, escapes above].
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
  // One chunk's worth of histogram, reused for streaming readbacks.
  const chunkReadback =
    request.onFrames === undefined || metricCount === 0
      ? null
      : device.createBuffer({
          size: Math.max(
            4,
            Math.min(framesPerDispatch, frameLimit) * histWordsPerFrame * 4,
          ),
          usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
        });
  // Per-run parameter draws, sized for one tile and rewritten per tile with
  // that tile's slice. The binding only exists in shaders compiled with
  // per-run parameters.
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
      // Min slots start at the u32 maximum so the shader's atomicMin works.
      const rangeInit = new Uint32Array(metricCount * 4);
      for (let metric = 0; metric < metricCount; metric++) {
        rangeInit[metric * 4] = 0xffffffff;
      }
      device.queue.writeBuffer(rangeBuffer, 0, rangeInit);
    }

    device.pushErrorScope("validation");

    // The staging array is sized for one seeding chunk and reused across every
    // tile.
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
        // Frames already advanced stay in the histogram, and the caller is
        // told the run was cut short.
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
          // Every frame's bins are final once its dispatch retired, so the
          // chunk's range can be read while later dispatches queue. Later
          // tiles re-read ranges earlier tiles already streamed; the
          // re-decoded frames carry every tile's samples so far.
          const chunkFrames = framesDone - baseFrame;
          const chunkBytes = chunkFrames * histWordsPerFrame * 4;
          const copyEncoder = device.createCommandEncoder();
          copyEncoder.copyBufferToBuffer(
            histBuffer,
            baseFrame * histWordsPerFrame * 4,
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
          const live = decoded.filter((frame) => frame.sampleCount > 0);
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
      // absolute run offsets.
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
        // deadlocks has completed, it just stopped early. `deadlockedRuns`
        // stays separate for diagnostics.
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
        // Counts lead the summary in place order.
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
    // immediately. It stays mapped until the decode is done.
    const histogram = new Uint32Array(histReadback.getMappedRange());
    const frames = decodeHistogramFrames({
      data: histogram,
      firstFrame: 1,
      frameCount: sampledFrameCount({
        data: histogram,
        frameLimit,
        metricCount,
        histogramBins: shader.histogramBins,
      }),
      metricIds: shader.metricIds,
      histogramBins: shader.histogramBins,
      windows: metricWindows,
    });
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
