import { describe, expect, it } from "vitest";

import {
  classifyWheel,
  clampRange,
  hitTest,
  MIN_VIEW_SPAN,
  panRange,
  resumesAfterScrub,
  zoomRange,
} from "./interactions";

describe("clampRange", () => {
  it("keeps the range inside the run and no narrower than the minimum span", () => {
    expect(clampRange(2, 3, 10)).toEqual({ min: 2, max: 5 });
    expect(clampRange(-1, 3, 10)).toEqual({ min: 0, max: 3 });
    expect(clampRange(9, 3, 10)).toEqual({ min: 7, max: 10 });
    expect(clampRange(1, 20, 10)).toEqual({ min: 0, max: 10 });
    expect(clampRange(1, 0, 10)).toEqual({ min: 1, max: 1 + MIN_VIEW_SPAN });
  });
});

describe("zoomRange", () => {
  it("scales about the pivot, which stays at the same fraction of the view", () => {
    const zoomed = zoomRange({ min: 2, max: 6 }, 0.5, 3, 10);
    expect(zoomed).toEqual({ min: 2.5, max: 4.5 });
    expect((3 - zoomed.min) / (zoomed.max - zoomed.min)).toBeCloseTo(0.25);
  });

  it("stops at the run's bounds", () => {
    expect(zoomRange({ min: 0, max: 4 }, 4, 4, 10)).toEqual({
      min: 0,
      max: 10,
    });
  });

  it("holds still when the span is already the narrowest", () => {
    const narrowest = { min: 4, max: 4 + MIN_VIEW_SPAN };
    const zoomed = zoomRange(narrowest, 0.5, 4 + MIN_VIEW_SPAN, 10);
    expect(zoomed.min).toBeCloseTo(narrowest.min);
    expect(zoomed.max).toBeCloseTo(narrowest.max);
  });
});

describe("panRange", () => {
  it("shifts the range and keeps its span at the edges", () => {
    expect(panRange({ min: 2, max: 4 }, 1, 10)).toEqual({ min: 3, max: 5 });
    expect(panRange({ min: 2, max: 4 }, -5, 10)).toEqual({ min: 0, max: 2 });
    expect(panRange({ min: 2, max: 4 }, 50, 10)).toEqual({ min: 8, max: 10 });
  });
});

describe("classifyWheel", () => {
  const wheel = (overrides: Partial<WheelEvent>) => ({
    deltaX: 0,
    deltaY: 0,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    ...overrides,
  });

  it("zooms on pinch and on cmd or ctrl with the wheel", () => {
    expect(classifyWheel(wheel({ deltaY: -10, ctrlKey: true }))).toEqual({
      kind: "zoom",
      factor: Math.exp(-0.1),
    });
    expect(classifyWheel(wheel({ deltaY: 10, metaKey: true })).kind).toBe(
      "zoom",
    );
  });

  it("pans on shift, whichever axis the browser reports", () => {
    expect(classifyWheel(wheel({ deltaY: 30, shiftKey: true }))).toEqual({
      kind: "pan",
      pixels: 30,
    });
    expect(classifyWheel(wheel({ deltaX: -30, shiftKey: true }))).toEqual({
      kind: "pan",
      pixels: -30,
    });
  });

  it("lets the dominant axis decide between a pan and a zoom", () => {
    expect(classifyWheel(wheel({ deltaX: 20, deltaY: 5 }))).toEqual({
      kind: "pan",
      pixels: 20,
    });
    expect(classifyWheel(wheel({ deltaX: 2, deltaY: 50 }))).toEqual({
      kind: "zoom",
      factor: Math.exp(0.1),
    });
  });
});

describe("hitTest", () => {
  const plot = { left: 50, top: 40, width: 400, height: 200 };
  const at = (x: number, y: number) =>
    hitTest({ x, y, plot, rulerHeight: 40, playheadX: 250, grab: 6 });

  it("finds the playhead in the plot and in the ruler", () => {
    expect(at(250, 100)).toBe("playhead");
    expect(at(255, 10)).toBe("playhead");
    expect(at(257, 100)).toBe("plot");
  });

  it("separates the ruler from the plot and both from outside", () => {
    expect(at(100, 10)).toBe("ruler");
    expect(at(100, 39)).toBe("ruler");
    expect(at(100, 40)).toBe("plot");
    expect(at(100, 240)).toBe("plot");
    expect(at(100, 241)).toBe("outside");
    expect(at(20, 100)).toBe("outside");
    expect(at(100, -1)).toBe("outside");
  });
});

describe("resumesAfterScrub", () => {
  it("resumes at the live edge of a run that is still computing", () => {
    expect(
      resumesAfterScrub({ time: 4, coveredTime: 4, runIsOver: false }),
    ).toBe(true);
  });

  it("resumes inside a finished run, and holds at its end", () => {
    expect(
      resumesAfterScrub({ time: 3, coveredTime: 4, runIsOver: true }),
    ).toBe(true);
    expect(
      resumesAfterScrub({ time: 4, coveredTime: 4, runIsOver: true }),
    ).toBe(false);
  });
});
