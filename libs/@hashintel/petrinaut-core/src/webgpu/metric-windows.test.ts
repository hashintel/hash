import { describe, expect, it } from "vitest";

import {
  anyEscapes,
  planInitialWindows,
  windowsFromObserved,
} from "./metric-windows";

describe("planInitialWindows", () => {
  it("is exact for a ceiling that fits the bins", () => {
    expect(
      planInitialWindows([{ initialCount: 5, countCeiling: 16 }], 1024),
    ).toEqual([{ lo: 0, stride: 1 }]);
  });

  it("strides a ceiling wider than the bins", () => {
    // 0..4095 over 1024 bins: 4 counts per bin.
    expect(
      planInitialWindows([{ initialCount: 5, countCeiling: 4095 }], 1024),
    ).toEqual([{ lo: 0, stride: 4 }]);
  });

  it("anchors an unbounded metric's guess on its initial count", () => {
    // 1030 initial tokens: the guess covers [0, 2060], where the old
    // zero-anchored layout refused the model outright.
    const [window] = planInitialWindows(
      [{ initialCount: 1030, countCeiling: null }],
      1024,
    );
    expect(window!.lo).toBe(0);
    expect(window!.lo + 1024 * window!.stride).toBeGreaterThan(2060);
  });
});

describe("windowsFromObserved", () => {
  it("fits the observed range with margin", () => {
    const [window] = windowsFromObserved(
      [{ min: 1000, max: 1200, below: 0, above: 5 }],
      [{ lo: 0, stride: 4 }],
      1024,
      0.25,
    );
    // Margin: ceil(201 × 0.25) = 51 → [949, 1251], span 303 ≤ 1024 → exact.
    expect(window).toEqual({ lo: 949, stride: 1 });
  });

  it("keeps the previous window for a metric with no samples", () => {
    expect(
      windowsFromObserved(
        [{ min: 0xffffffff, max: 0, below: 0, above: 0 }],
        [{ lo: 7, stride: 3 }],
        1024,
        0.25,
      ),
    ).toEqual([{ lo: 7, stride: 3 }]);
  });

  it("never plans a negative lo", () => {
    const [window] = windowsFromObserved(
      [{ min: 1, max: 4, below: 0, above: 0 }],
      [{ lo: 0, stride: 1 }],
      1024,
      0.25,
    );
    expect(window!.lo).toBe(0);
  });
});

describe("anyEscapes", () => {
  it("flags either edge", () => {
    expect(anyEscapes([{ min: 0, max: 9, below: 0, above: 0 }])).toBe(false);
    expect(anyEscapes([{ min: 0, max: 9, below: 1, above: 0 }])).toBe(true);
    expect(anyEscapes([{ min: 0, max: 9, below: 0, above: 2 }])).toBe(true);
  });
});
