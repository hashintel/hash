/**
 * Decoding the device's histogram buffer into per-frame metric frames.
 *
 * The buffer holds `frameLimit × metrics × bins` u32 counts, frame-major then
 * metric-major; a bin's value is its window position, `lo + bin × stride`.
 */
import type { MetricWindow } from "../metric-windows";

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
  /**
   * The counts a bin stands for, as a reach below and above its label: a
   * stride-`s` window bin labelled `v` holds the integer counts in
   * `[v - below, v + above)`, half a count either side of its outermost
   * integers.
   */
  binExtent: { below: number; above: number };
  /** Runs that contributed a sample; equals the active run count. */
  sampleCount: number;
};

/**
 * Decodes a contiguous frame range. `data` starts at `firstFrame`'s bins.
 */
export const decodeHistogramFrames = (options: {
  data: Uint32Array;
  /** Frame number of the range's first frame. */
  firstFrame: number;
  frameCount: number;
  metricIds: readonly string[];
  /** Bins per metric per frame — the compiled shader's `histogramBins`. */
  histogramBins: number;
  /** Each metric's window, in `metricIds` order. */
  windows: readonly MetricWindow[];
}): GpuHistogramFrame[] => {
  const { data, firstFrame, frameCount, metricIds, histogramBins, windows } =
    options;
  const metricCount = metricIds.length;
  const frames: GpuHistogramFrame[] = [];
  for (let frame = 0; frame < frameCount; frame++) {
    for (const [metricIndex, metricId] of metricIds.entries()) {
      const window = windows[metricIndex] ?? { lo: 0, stride: 1 };
      // A bin covers `stride` counts; labelling its middle keeps a wide
      // window's means unbiased where the low edge skewed them down by
      // (stride − 1) / 2. Exact (offset 0) at stride 1.
      const binMidpoint = Math.floor((window.stride - 1) / 2);
      const binExtent = {
        below: binMidpoint + 0.5,
        above: window.stride - binMidpoint - 0.5,
      };
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
        binExtent,
        sampleCount,
      });
    }
  }
  return frames;
};

/**
 * How many frames of the buffer carry any sample: frames past the last
 * recorded one are empty (every run finished, or the experiment was
 * cancelled between chunks), and decoding them would append a null-valued
 * tail across the rest of the timeline.
 */
export const sampledFrameCount = (options: {
  data: Uint32Array;
  frameLimit: number;
  metricCount: number;
  histogramBins: number;
}): number => {
  const { data, frameLimit, metricCount, histogramBins } = options;
  const wordsPerFrame = histogramBins * metricCount;
  for (let frame = frameLimit - 1; frame >= 0; frame--) {
    const offset = frame * wordsPerFrame;
    for (let word = 0; word < wordsPerFrame; word++) {
      if ((data[offset + word] ?? 0) > 0) {
        return frame + 1;
      }
    }
  }
  return 0;
};
