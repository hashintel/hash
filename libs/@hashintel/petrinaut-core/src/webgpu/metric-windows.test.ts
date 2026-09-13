import { describe, expect, it } from "vitest";

import {
  anyEscapes,
  calibrationKey,
  decodeF32OrderKey,
  f32OrderKey,
  planInitialWindows,
  windowsFromObserved,
} from "./metric-windows";
import { decodeHistogramFrames } from "./runner/histogram-frames";

describe("planInitialWindows", () => {
  it("is exact for a ceiling that fits the bins", () => {
    expect(planInitialWindows([{ integer: true, ceiling: 16 }], 1024)).toEqual([
      { lo: 0, stride: 1, integer: true },
    ]);
  });

  it("strides a ceiling wider than the bins", () => {
    // 0..4095 over 1024 bins: 4 counts per bin.
    expect(
      planInitialWindows([{ integer: true, ceiling: 4095 }], 1024),
    ).toEqual([{ lo: 0, stride: 4, integer: true }]);
  });

  it("plans a blind unit window for a metric without a ceiling, in its domain", () => {
    // The handle always probes a blind window, and range tracking is
    // independent of the window, so the probe observes the exact range
    // whatever the blind window clamps.
    expect(
      planInitialWindows(
        [
          { integer: true, ceiling: null },
          { integer: false, ceiling: null },
        ],
        1024,
      ),
    ).toEqual([
      { lo: 0, stride: 1, integer: true },
      { lo: 0, stride: 1, integer: false },
    ]);
  });
});

describe("windowsFromObserved", () => {
  it("fits an integer range with margin", () => {
    const [window] = windowsFromObserved(
      [{ min: 1000, max: 1200, below: 0, above: 5 }],
      [{ lo: 0, stride: 4, integer: true }],
      1024,
      0.25,
    );
    // Margin: ceil(201 × 0.25) = 51 → [949, 1251], span 303 ≤ 1024 → exact.
    expect(window).toEqual({ lo: 949, stride: 1, integer: true });
  });

  it("keeps the previous window for a metric with no samples", () => {
    expect(
      windowsFromObserved(
        [
          {
            min: Number.POSITIVE_INFINITY,
            max: Number.NEGATIVE_INFINITY,
            below: 0,
            above: 0,
          },
        ],
        [{ lo: 7, stride: 3, integer: true }],
        1024,
        0.25,
      ),
    ).toEqual([{ lo: 7, stride: 3, integer: true }]);
  });

  it("reserves no bins below zero unless a negative value was observed", () => {
    // A count never goes negative, so its margin is clamped at zero; a
    // signed metric keeps its margin on both sides.
    const [counts] = windowsFromObserved(
      [{ min: 1, max: 4, below: 0, above: 0 }],
      [{ lo: 0, stride: 1, integer: true }],
      1024,
      0.25,
    );
    expect(counts!.lo).toBe(0);

    const [signed] = windowsFromObserved(
      [{ min: -40, max: 10, below: 0, above: 0 }],
      [{ lo: 0, stride: 1, integer: true }],
      1024,
      0.25,
    );
    expect(signed!.lo).toBeLessThan(-40);
    expect(signed!.integer).toBe(true);
  });

  it("fits a real range with margin and labels bin centres inside the span", () => {
    const [window] = windowsFromObserved(
      [{ min: 0, max: 1, below: 0, above: 0 }],
      [{ lo: 0, stride: 1, integer: false }],
      1024,
      0.25,
    );
    if (window === undefined) {
      throw new Error("no window");
    }

    expect(window.lo).toBe(0);
    expect(window.integer).toBe(false);
    expect(window.stride).toBeCloseTo(1.25 / 1024, 9);
    // The first and last bin centres sit within the padded span.
    expect(window.lo + 0.5 * window.stride).toBeGreaterThan(0);
    expect(window.lo + 1023.5 * window.stride).toBeLessThan(1.25);
    expect(window.lo + 1023.5 * window.stride).toBeGreaterThan(1);
  });

  it("gives a constant real metric one bin centred on its value", () => {
    const observed = Math.fround(0.3);
    const [window] = windowsFromObserved(
      [{ min: observed, max: observed, below: 0, above: 0 }],
      [{ lo: 0, stride: 1, integer: false }],
      1024,
      0.25,
    );
    if (window === undefined) {
      throw new Error("no window");
    }

    // `observed - 0.5` is exact in f32 for any f32 in [0.25, 1), so the
    // single bin's centre `lo + 0.5` is the constant itself.
    expect(window).toEqual({
      lo: Math.fround(observed - 0.5),
      stride: 1,
      integer: false,
    });
    const [frame] = decodeHistogramFrames({
      data: Uint32Array.from([9, 0]),
      firstFrame: 0,
      frameCount: 1,
      metricIds: ["m"],
      histogramBins: 2,
      windows: [window],
    });
    expect(frame?.bins).toEqual([[observed, 9]]);
  });
});

describe("anyEscapes", () => {
  it("flags either edge", () => {
    expect(anyEscapes([{ min: 0, max: 9, below: 0, above: 0 }])).toBe(false);
    expect(anyEscapes([{ min: 0, max: 9, below: 1, above: 0 }])).toBe(true);
    expect(anyEscapes([{ min: 0, max: 9, below: 0, above: 2 }])).toBe(true);
  });
});

describe("f32OrderKey", () => {
  const sorted = [-3.4e38, -1, -1e-30, 0, 1e-30, 1, 3.4e38];

  it("orders keys as the floats they encode", () => {
    const keys = sorted.map(f32OrderKey);
    for (let index = 1; index < keys.length; index++) {
      expect(keys[index]!).toBeGreaterThan(keys[index - 1]!);
    }
    // Every key is a u32, as the device's atomics hold it.
    for (const key of keys) {
      expect(key).toBeGreaterThanOrEqual(0);
      expect(key).toBeLessThanOrEqual(0xffffffff);
      expect(Number.isInteger(key)).toBe(true);
    }
  });

  it("decodes back to the f32 the device held", () => {
    for (const value of sorted) {
      expect(decodeF32OrderKey(f32OrderKey(value))).toBe(Math.fround(value));
    }
  });

  it("leaves the runner's empty-range sentinels unused by any finite value", () => {
    // The shader initialises min slots to the u32 maximum and max slots to
    // zero; both must be keys no finite sample can produce.
    expect(f32OrderKey(3.4e38)).toBeLessThan(0xffffffff);
    expect(f32OrderKey(-3.4e38)).toBeGreaterThan(0);
  });
});

describe("calibrationKey", () => {
  it("keys by marking and metric set", () => {
    const base = calibrationKey({
      placeCounts: [190, 10, 0],
      metricIds: ["a"],
    });
    expect(base).toBe(
      calibrationKey({ placeCounts: [190, 10, 0], metricIds: ["a"] }),
    );
    expect(base).not.toBe(
      calibrationKey({ placeCounts: [189, 11, 0], metricIds: ["a"] }),
    );
    expect(base).not.toBe(
      calibrationKey({ placeCounts: [190, 10, 0], metricIds: ["a", "b"] }),
    );
  });

  it("separates typed markings by their token words and boundaries", () => {
    const key = (placeTokenWords: Uint32Array[]) =>
      calibrationKey({ placeCounts: [2], placeTokenWords, metricIds: [] });
    expect(key([new Uint32Array([1, 2]), new Uint32Array([3])])).not.toBe(
      key([new Uint32Array([1]), new Uint32Array([2, 3])]),
    );
    expect(key([new Uint32Array([1, 2])])).toBe(key([new Uint32Array([1, 2])]));
  });
});
