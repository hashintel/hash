import { describe, expect, it } from "vitest";

import { decodeHistogramFrames, sampledFrameCount } from "./histogram-frames";

describe("decodeHistogramFrames", () => {
  // Two frames × two metrics × 4 bins, frame-major then metric-major.
  const data = Uint32Array.from([
    // frame 0, metric a
    3, 0, 1, 0,
    // frame 0, metric b
    0, 0, 0, 4,
    // frame 1, metric a
    0, 0, 0, 0,
    // frame 1, metric b
    2, 2, 0, 0,
  ]);

  it("labels each non-empty bin by its window position and sums the samples", () => {
    const frames = decodeHistogramFrames({
      data,
      firstFrame: 1,
      frameCount: 2,
      metricIds: ["a", "b"],
      histogramBins: 4,
      windows: [
        { lo: 0, stride: 1 },
        { lo: 10, stride: 1 },
      ],
    });

    expect(frames).toEqual([
      {
        frameNumber: 1,
        metricId: "a",
        bins: [
          [0, 3],
          [2, 1],
        ],
        binExtent: { below: 0.5, above: 0.5 },
        sampleCount: 4,
      },
      {
        frameNumber: 1,
        metricId: "b",
        bins: [[13, 4]],
        binExtent: { below: 0.5, above: 0.5 },
        sampleCount: 4,
      },
      {
        frameNumber: 2,
        metricId: "a",
        bins: [],
        binExtent: { below: 0.5, above: 0.5 },
        sampleCount: 0,
      },
      {
        frameNumber: 2,
        metricId: "b",
        bins: [
          [10, 2],
          [11, 2],
        ],
        binExtent: { below: 0.5, above: 0.5 },
        sampleCount: 4,
      },
    ]);
  });

  it("labels a wide bin by its middle count and reports its reach either side", () => {
    // Stride 4 over lo 8: bin 0 holds counts 8..11 and is labelled 9, reaching
    // 1.5 below (down to 7.5) and 2.5 above (up to 11.5).
    const [frame] = decodeHistogramFrames({
      data: Uint32Array.from([5, 0, 0, 0]),
      firstFrame: 1,
      frameCount: 1,
      metricIds: ["a"],
      histogramBins: 4,
      windows: [{ lo: 8, stride: 4 }],
    });

    expect(frame?.bins).toEqual([[9, 5]]);
    expect(frame?.binExtent).toEqual({ below: 1.5, above: 2.5 });
  });

  it("defaults a missing window to the zero-anchored exact layout", () => {
    const [frame] = decodeHistogramFrames({
      data: Uint32Array.from([0, 7]),
      firstFrame: 3,
      frameCount: 1,
      metricIds: ["a"],
      histogramBins: 2,
      windows: [],
    });

    expect(frame).toEqual({
      frameNumber: 3,
      metricId: "a",
      bins: [[1, 7]],
      binExtent: { below: 0.5, above: 0.5 },
      sampleCount: 7,
    });
  });
});

describe("sampledFrameCount", () => {
  it("stops at the last frame holding any sample", () => {
    // Frames 0 and 1 sampled, frames 2 and 3 empty (all runs finished).
    const data = Uint32Array.from([1, 0, 0, 2, 0, 0, 0, 0]);

    expect(
      sampledFrameCount({
        data,
        frameLimit: 4,
        metricCount: 1,
        histogramBins: 2,
      }),
    ).toBe(2);
  });

  it("is zero when nothing was sampled", () => {
    expect(
      sampledFrameCount({
        data: new Uint32Array(8),
        frameLimit: 4,
        metricCount: 1,
        histogramBins: 2,
      }),
    ).toBe(0);
  });
});
