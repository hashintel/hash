/**
 * Render-cost capture for the scene: Deck's once-per-second stats plus our
 * own timing of each layer rebuild span, summarised into one report.
 *
 * A rebuild span covers everything the scene does synchronously to refresh
 * the layer set: layer construction, label rebuild, and the `setProps` call.
 * It deliberately does not stop at `setProps` -- that call only stores props
 * and schedules a redraw (measured at ~microseconds), while Deck performs
 * the deferred diffing and attribute regeneration inside its next draw,
 * which surfaces in `updateAttributesTime` / `cpuTimePerFrame` here.
 * Recording is gated on {@link capturing} so an idle probe costs one branch
 * per rebuild.
 *
 * While capturing, the probe also runs its own `requestAnimationFrame` loop
 * and records the interval between consecutive callbacks. A mean fps over
 * the whole window hides exactly the thing a user feels -- isolated long
 * frames -- so the report carries the interval distribution (p50/p95/p99/max)
 * and a count of hitches (intervals above {@link HITCH_THRESHOLD_MS}).
 */
import type { DeckProps } from "@deck.gl/core";

/** Deck's per-second stats object (not re-exported from the package root). */
export type DeckMetrics = Parameters<NonNullable<DeckProps["_onMetrics"]>>[0];

export interface RebuildStats {
  readonly count: number;
  readonly meanMs: number;
  readonly p95Ms: number;
  readonly maxMs: number;
}

/**
 * A frame interval at least this long (two 60 Hz vsync periods, i.e. at
 * least one whole missed frame) reads as a felt hitch.
 */
export const HITCH_THRESHOLD_MS = 33.4;

/** Main-thread frame cadence over the capture (rAF inter-frame intervals). */
export interface FrameStats {
  /** Intervals observed (one fewer than rAF callbacks delivered). */
  readonly count: number;
  readonly meanMs: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly p99Ms: number;
  readonly maxMs: number;
  /** Intervals above {@link HITCH_THRESHOLD_MS} -- the "felt" stalls. */
  readonly hitchCount: number;
}

/** Injectable `requestAnimationFrame` pair so tests can drive frames manually. */
export interface FrameLoop {
  readonly schedule: (callback: (timestampMs: number) => void) => number;
  readonly cancel: (handle: number) => void;
}

function defaultFrameLoop(): FrameLoop | null {
  // Non-browser environments (unit tests) simply report zero frame stats.
  if (typeof requestAnimationFrame !== "function") {
    return null;
  }
  return {
    schedule: (callback) => requestAnimationFrame(callback),
    cancel: (handle) => {
      cancelAnimationFrame(handle);
    },
  };
}

/** Deck's per-second samples, aggregated over the capture window. */
export interface DeckStatsSummary {
  readonly samples: number;
  /** Mean frames per second across samples. */
  readonly fps: number;
  /** Mean CPU time per rendered frame (ms). */
  readonly cpuTimePerFrame: number;
  /** Mean GPU time per rendered frame (ms; 0 where the GPU timer is unavailable). */
  readonly gpuTimePerFrame: number;
  /** Mean time spent in Deck.setProps per sample-second (ms). */
  readonly setPropsTime: number;
  /** Mean time spent updating layer attributes per sample-second (ms). */
  readonly updateAttributesTime: number;
  /** Total frames actually redrawn during the capture. */
  readonly framesRedrawn: number;
}

/**
 * Camera zoom over the capture (deck log2 units), so runs are comparable:
 * fps at a zoomed-in viewport (fill-rate bound) and at fit-to-content are
 * different benchmarks.
 */
export interface CameraStats {
  readonly initialZoom: number;
  readonly finalZoom: number;
  readonly minZoom: number;
  readonly maxZoom: number;
}

export interface RenderCaptureReport {
  readonly durationMs: number;
  readonly camera: CameraStats;
  readonly frames: FrameStats;
  readonly rebuild: RebuildStats;
  readonly deck: DeckStatsSummary;
}

function mean(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  let sum = 0;
  for (const value of values) {
    sum += value;
  }
  return sum / values.length;
}

/** Nearest-rank percentile; `fraction` in (0, 1]. */
function percentile(values: readonly number[], fraction: number): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const rank = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(fraction * sorted.length) - 1),
  );
  return sorted[rank]!;
}

export class RenderMetricsProbe {
  #capturing = false;
  #startedAt = 0;
  #rebuildDurationsMs: number[] = [];
  #deckSamples: DeckMetrics[] = [];
  #initialZoom = 0;
  #minZoom = 0;
  #maxZoom = 0;
  #frameIntervalsMs: number[] = [];
  #frameHandle: number | null = null;
  #lastFrameAt: number | null = null;

  readonly #clock: () => number;
  readonly #frameLoop: FrameLoop | null;

  constructor(
    clock: () => number = () => performance.now(),
    frameLoop: FrameLoop | null = defaultFrameLoop(),
  ) {
    this.#clock = clock;
    this.#frameLoop = frameLoop;
  }

  get capturing(): boolean {
    return this.#capturing;
  }

  start(initialZoom: number): void {
    this.#capturing = true;
    this.#startedAt = this.#clock();
    this.#rebuildDurationsMs = [];
    this.#deckSamples = [];
    this.#initialZoom = initialZoom;
    this.#minZoom = initialZoom;
    this.#maxZoom = initialZoom;
    this.#frameIntervalsMs = [];
    this.#lastFrameAt = null;
    this.#scheduleFrameProbe();
  }

  #scheduleFrameProbe(): void {
    if (this.#frameLoop === null) {
      return;
    }
    this.#frameHandle = this.#frameLoop.schedule((timestampMs) => {
      if (!this.#capturing) {
        return;
      }
      if (this.#lastFrameAt !== null) {
        this.#frameIntervalsMs.push(timestampMs - this.#lastFrameAt);
      }
      this.#lastFrameAt = timestampMs;
      this.#scheduleFrameProbe();
    });
  }

  recordRebuild(elapsedMs: number): void {
    if (this.#capturing) {
      this.#rebuildDurationsMs.push(elapsedMs);
    }
  }

  /** Fold a zoom observation into the capture's min/max envelope. */
  recordZoom(zoom: number): void {
    if (this.#capturing) {
      this.#minZoom = Math.min(this.#minZoom, zoom);
      this.#maxZoom = Math.max(this.#maxZoom, zoom);
    }
  }

  sampleDeckMetrics(metrics: DeckMetrics): void {
    if (this.#capturing) {
      // Deck mutates one metrics object in place between callbacks.
      this.#deckSamples.push({ ...metrics });
    }
  }

  stop(finalZoom: number): RenderCaptureReport {
    this.recordZoom(finalZoom);
    this.#capturing = false;
    if (this.#frameHandle !== null) {
      this.#frameLoop?.cancel(this.#frameHandle);
      this.#frameHandle = null;
    }
    const rebuilds = this.#rebuildDurationsMs;
    const samples = this.#deckSamples;
    const intervals = this.#frameIntervalsMs;

    let framesRedrawn = 0;
    for (const sample of samples) {
      framesRedrawn += sample.framesRedrawn;
    }

    let hitchCount = 0;
    for (const interval of intervals) {
      if (interval > HITCH_THRESHOLD_MS) {
        hitchCount += 1;
      }
    }

    return {
      durationMs: this.#clock() - this.#startedAt,
      camera: {
        initialZoom: this.#initialZoom,
        finalZoom,
        minZoom: this.#minZoom,
        maxZoom: this.#maxZoom,
      },
      frames: {
        count: intervals.length,
        meanMs: mean(intervals),
        p50Ms: percentile(intervals, 0.5),
        p95Ms: percentile(intervals, 0.95),
        p99Ms: percentile(intervals, 0.99),
        maxMs: intervals.length === 0 ? 0 : Math.max(...intervals),
        hitchCount,
      },
      rebuild: {
        count: rebuilds.length,
        meanMs: mean(rebuilds),
        p95Ms: percentile(rebuilds, 0.95),
        maxMs: rebuilds.length === 0 ? 0 : Math.max(...rebuilds),
      },
      deck: {
        samples: samples.length,
        fps: mean(samples.map((sample) => sample.fps)),
        cpuTimePerFrame: mean(samples.map((sample) => sample.cpuTimePerFrame)),
        gpuTimePerFrame: mean(samples.map((sample) => sample.gpuTimePerFrame)),
        setPropsTime: mean(samples.map((sample) => sample.setPropsTime)),
        updateAttributesTime: mean(
          samples.map((sample) => sample.updateAttributesTime),
        ),
        framesRedrawn,
      },
    };
  }
}
