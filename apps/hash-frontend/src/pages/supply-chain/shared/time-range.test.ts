import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { cutoffForRange, rangeMonths, timeRangeLongLabel } from "./time-range";

describe("rangeMonths", () => {
  it("maps each TimeRange token to its month count", () => {
    expect(rangeMonths("3m")).toBe(3);
    expect(rangeMonths("6m")).toBe(6);
    expect(rangeMonths("12m")).toBe(12);
  });
});

describe("timeRangeLongLabel", () => {
  it("renders a long-form window label", () => {
    expect(timeRangeLongLabel("6m")).toBe("Last 6 months");
  });
});

describe("cutoffForRange", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T00:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("maps each TimeRange to a YYYY-MM cutoff relative to now", () => {
    expect(cutoffForRange("3m")).toBe("2026-04");
    expect(cutoffForRange("6m")).toBe("2026-01");
    expect(cutoffForRange("12m")).toBe("2025-07");
  });
});
