/**
 * Render-cost capture for the scene: Deck's once-per-second stats plus our
 * own per-push `setProps({ layers })` timings, summarised into one report.
 *
 * The layer push is the main-thread cost this component controls (layer
 * construction + Deck diffing + attribute upload scheduling), so its p95 is
 * the number rebuild optimisations are measured against; fps / frame times
 * come from Deck's own metrics. Recording is gated on {@link capturing} so
 * an idle probe costs one branch per push.
 */
import type { DeckProps } from "@deck.gl/core";

/** Deck's per-second stats object (not re-exported from the package root). */
export type DeckMetrics = Parameters<NonNullable<DeckProps["_onMetrics"]>>[0];

export interface LayerPushStats {
  readonly count: number;
  readonly meanMs: number;
  readonly p95Ms: number;
  readonly maxMs: number;
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

export interface RenderCaptureReport {
  readonly durationMs: number;
  readonly layerPush: LayerPushStats;
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
  #pushDurationsMs: number[] = [];
  #deckSamples: DeckMetrics[] = [];

  readonly #clock: () => number;

  constructor(clock: () => number = () => performance.now()) {
    this.#clock = clock;
  }

  get capturing(): boolean {
    return this.#capturing;
  }

  start(): void {
    this.#capturing = true;
    this.#startedAt = this.#clock();
    this.#pushDurationsMs = [];
    this.#deckSamples = [];
  }

  recordLayerPush(elapsedMs: number): void {
    if (this.#capturing) {
      this.#pushDurationsMs.push(elapsedMs);
    }
  }

  sampleDeckMetrics(metrics: DeckMetrics): void {
    if (this.#capturing) {
      // Deck mutates one metrics object in place between callbacks.
      this.#deckSamples.push({ ...metrics });
    }
  }

  stop(): RenderCaptureReport {
    this.#capturing = false;
    const pushes = this.#pushDurationsMs;
    const samples = this.#deckSamples;

    let framesRedrawn = 0;
    for (const sample of samples) {
      framesRedrawn += sample.framesRedrawn;
    }

    return {
      durationMs: this.#clock() - this.#startedAt,
      layerPush: {
        count: pushes.length,
        meanMs: mean(pushes),
        p95Ms: percentile(pushes, 0.95),
        maxMs: pushes.length === 0 ? 0 : Math.max(...pushes),
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
