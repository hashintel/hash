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
 *
 * For attribution, the report also lists the worst hitches WITH their
 * capture-relative timestamps, alongside the browser's `longtask` entries
 * over the same timeline. A hitch that coincides with a long task is
 * main-thread JS (GC, attribute regeneration, a slow pack); a hitch with no
 * long task under it points off-thread (GPU/compositor back-pressure).
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

/** How many of the worst hitches / long tasks the report lists individually. */
const WORST_SPAN_LIMIT = 5;

/** One attributable stall: when it happened (capture-relative) and how long. */
export interface TimedSpan {
  readonly atMs: number;
  readonly durationMs: number;
}

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
  /**
   * The worst hitches (up to {@link WORST_SPAN_LIMIT}, longest first).
   * `atMs` is when the long frame ENDED, relative to capture start --
   * line these up with `longTasks.worst` to attribute them.
   */
  readonly worst: readonly TimedSpan[];
}

/**
 * Browser `longtask` performance entries observed during the capture:
 * main-thread tasks over 50 ms. Chromium-only — Firefox and Safari have
 * never shipped the Long Tasks API, so `available` distinguishes "the API
 * is missing" from the meaningful "supported, and zero long tasks fired".
 */
export interface LongTaskStats {
  /** False = the Long Tasks API does not exist here; counts are vacuous. */
  readonly available: boolean;
  readonly count: number;
  readonly totalMs: number;
  readonly maxMs: number;
  /** Worst tasks (up to {@link WORST_SPAN_LIMIT}, longest first); `atMs` is the task START. */
  readonly worst: readonly TimedSpan[];
}

/**
 * Per-frame GPU draw time from `EXT_disjoint_timer_query_webgl2` (see
 * `gpu-frame-timer.ts`): the GPU-side execution time of each Deck redraw,
 * excluding compositing/present. `atMs` on `worst` entries is the frame's
 * SUBMIT time, so they line up with `frames.worst` / `longTasks.worst`.
 */
export interface GpuStats {
  /** False = the timer extension is unavailable (or nothing drew). */
  readonly available: boolean;
  /** Completed timer queries (the last 1-2 frames' results never arrive). */
  readonly samples: number;
  /** GPU resets/context churn that discarded in-flight queries. */
  readonly disjointCount: number;
  readonly meanMs: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly maxMs: number;
  readonly worst: readonly TimedSpan[];
}

/**
 * Injectable `longtask` observation so tests can emit entries manually.
 * `observe` starts delivery and returns the disconnect function.
 */
export interface LongTaskSource {
  readonly observe: (
    onEntry: (startTimeMs: number, durationMs: number) => void,
  ) => () => void;
}

function defaultLongTaskSource(): LongTaskSource | null {
  if (
    typeof PerformanceObserver === "undefined" ||
    !PerformanceObserver.supportedEntryTypes.includes("longtask")
  ) {
    return null;
  }
  return {
    observe: (onEntry) => {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          onEntry(entry.startTime, entry.duration);
        }
      });
      observer.observe({ type: "longtask", buffered: false });
      return () => {
        observer.disconnect();
      };
    },
  };
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
  readonly longTasks: LongTaskStats;
  readonly gpu: GpuStats;
  readonly rebuild: RebuildStats;
  readonly deck: DeckStatsSummary;
}

/** Everything the probe touches outside its own state, injectable for tests. */
export interface ProbeDependencies {
  readonly clock?: () => number;
  readonly frameLoop?: FrameLoop | null;
  readonly longTaskSource?: LongTaskSource | null;
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

/** The longest spans first, capped at {@link WORST_SPAN_LIMIT}. */
function worstSpans(spans: readonly TimedSpan[]): TimedSpan[] {
  return [...spans]
    .sort((left, right) => right.durationMs - left.durationMs)
    .slice(0, WORST_SPAN_LIMIT);
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
  /** Parallel to {@link #frameIntervalsMs}: the rAF timestamp ending each interval. */
  #frameEndsMs: number[] = [];
  #frameHandle: number | null = null;
  #lastFrameAt: number | null = null;
  #longTaskSpans: TimedSpan[] = [];
  #disconnectLongTasks: (() => void) | null = null;
  #gpuSpans: TimedSpan[] = [];
  #gpuDisjointCount = 0;
  #gpuAvailable = false;

  readonly #clock: () => number;
  readonly #frameLoop: FrameLoop | null;
  readonly #longTaskSource: LongTaskSource | null;

  constructor(dependencies: ProbeDependencies = {}) {
    this.#clock = dependencies.clock ?? (() => performance.now());
    this.#frameLoop =
      dependencies.frameLoop === undefined
        ? defaultFrameLoop()
        : dependencies.frameLoop;
    this.#longTaskSource =
      dependencies.longTaskSource === undefined
        ? defaultLongTaskSource()
        : dependencies.longTaskSource;
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
    this.#frameEndsMs = [];
    this.#lastFrameAt = null;
    this.#longTaskSpans = [];
    this.#gpuSpans = [];
    this.#gpuDisjointCount = 0;
    this.#gpuAvailable = false;
    this.#scheduleFrameProbe();
    this.#observeLongTasks();
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
        this.#frameEndsMs.push(timestampMs);
      }
      this.#lastFrameAt = timestampMs;
      this.#scheduleFrameProbe();
    });
  }

  #observeLongTasks(): void {
    if (this.#longTaskSource === null) {
      return;
    }
    // Long-task entries and rAF timestamps share the performance timeline,
    // so both are made capture-relative against the same start instant.
    this.#disconnectLongTasks = this.#longTaskSource.observe(
      (startTimeMs, durationMs) => {
        if (this.#capturing) {
          this.#longTaskSpans.push({
            atMs: startTimeMs - this.#startedAt,
            durationMs,
          });
        }
      },
    );
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

  /** Whether the GPU timer extension answered on this device (see gpu-frame-timer.ts). */
  noteGpuAvailability(available: boolean): void {
    if (this.#capturing) {
      this.#gpuAvailable = available;
    }
  }

  /**
   * One completed GPU frame query. `submittedAtMs` is the shared-timeline
   * instant the frame was SUBMITTED (results arrive frames later; the
   * sample must line up with the frame that produced it). Queries submitted
   * BEFORE the capture started are dropped: a query left in flight when the
   * previous capture ended can sit unresolved across an idle gap and only
   * be delivered on this capture's first poll, and it describes a frame
   * from outside this window.
   */
  recordGpuFrame(submittedAtMs: number, durationMs: number): void {
    if (this.#capturing && submittedAtMs >= this.#startedAt) {
      this.#gpuSpans.push({
        atMs: submittedAtMs - this.#startedAt,
        durationMs,
      });
    }
  }

  /** A disjoint event discarded the in-flight GPU queries. */
  recordGpuDisjoint(): void {
    if (this.#capturing) {
      this.#gpuDisjointCount += 1;
    }
  }

  stop(finalZoom: number): RenderCaptureReport {
    this.recordZoom(finalZoom);
    this.#capturing = false;
    if (this.#frameHandle !== null) {
      this.#frameLoop?.cancel(this.#frameHandle);
      this.#frameHandle = null;
    }

    if (this.#disconnectLongTasks !== null) {
      this.#disconnectLongTasks();
      this.#disconnectLongTasks = null;
    }

    const rebuilds = this.#rebuildDurationsMs;
    const samples = this.#deckSamples;
    const intervals = this.#frameIntervalsMs;
    const longTasks = this.#longTaskSpans;

    let framesRedrawn = 0;
    for (const sample of samples) {
      framesRedrawn += sample.framesRedrawn;
    }

    const hitches: TimedSpan[] = [];
    for (const [index, interval] of intervals.entries()) {
      if (interval > HITCH_THRESHOLD_MS) {
        hitches.push({
          atMs: this.#frameEndsMs[index]! - this.#startedAt,
          durationMs: interval,
        });
      }
    }

    let longTaskTotalMs = 0;
    let longTaskMaxMs = 0;
    for (const task of longTasks) {
      longTaskTotalMs += task.durationMs;
      longTaskMaxMs = Math.max(longTaskMaxMs, task.durationMs);
    }

    const gpuDurations = this.#gpuSpans.map((span) => span.durationMs);

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
        hitchCount: hitches.length,
        worst: worstSpans(hitches),
      },
      longTasks: {
        available: this.#longTaskSource !== null,
        count: longTasks.length,
        totalMs: longTaskTotalMs,
        maxMs: longTaskMaxMs,
        worst: worstSpans(longTasks),
      },
      gpu: {
        available: this.#gpuAvailable,
        samples: gpuDurations.length,
        disjointCount: this.#gpuDisjointCount,
        meanMs: mean(gpuDurations),
        p50Ms: percentile(gpuDurations, 0.5),
        p95Ms: percentile(gpuDurations, 0.95),
        maxMs: gpuDurations.length === 0 ? 0 : Math.max(...gpuDurations),
        worst: worstSpans(this.#gpuSpans),
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
