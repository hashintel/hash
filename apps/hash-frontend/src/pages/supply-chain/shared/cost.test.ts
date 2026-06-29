import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_STORAGE_COST,
  DEFAULT_WACC,
  computeDailyCost,
  computeMonthlyCost,
  computePeriodCost,
  costRatePerKgDay,
  formatCost,
  formatNumber,
} from "./cost";

// Characterization tests: pin the current cost-model + formatting behaviour
// before the contract refactor. These are pure numeric functions.

describe("costRatePerKgDay", () => {
  it("combines WACC interest and storage at the documented rate", () => {
    // 100 * (0.10/365) + 0.4/1000
    expect(
      costRatePerKgDay(100, DEFAULT_WACC, DEFAULT_STORAGE_COST),
    ).toBeCloseTo(100 * (0.1 / 365) + 0.4 / 1000, 10);
  });

  it("treats a null unit price as zero interest (storage only)", () => {
    expect(
      costRatePerKgDay(null, DEFAULT_WACC, DEFAULT_STORAGE_COST),
    ).toBeCloseTo(DEFAULT_STORAGE_COST / 1000, 10);
  });
});

describe("computeMonthlyCost / computeDailyCost", () => {
  it("multiplies kg-days by the per-kg-day rate", () => {
    const rate = costRatePerKgDay(100, DEFAULT_WACC, DEFAULT_STORAGE_COST);
    expect(
      computeMonthlyCost(1000, 100, DEFAULT_WACC, DEFAULT_STORAGE_COST),
    ).toBeCloseTo(1000 * rate, 8);
  });

  it("returns null when an input is missing", () => {
    expect(
      computeMonthlyCost(null, 100, DEFAULT_WACC, DEFAULT_STORAGE_COST),
    ).toBeNull();
    expect(
      computeMonthlyCost(1000, null, DEFAULT_WACC, DEFAULT_STORAGE_COST),
    ).toBeNull();
    expect(
      computeDailyCost(null, 100, DEFAULT_WACC, DEFAULT_STORAGE_COST),
    ).toBeNull();
  });
});

describe("computePeriodCost", () => {
  const months = [
    { total_kg_days: 1000 },
    { total_kg_days: 500 },
    { total_kg_days: 2500 },
  ];

  it("sums computeMonthlyCost over the buckets", () => {
    const rate = costRatePerKgDay(100, DEFAULT_WACC, DEFAULT_STORAGE_COST);
    expect(
      computePeriodCost(months, 100, DEFAULT_WACC, DEFAULT_STORAGE_COST),
    ).toBeCloseTo((1000 + 500 + 2500) * rate, 6);
  });

  it("equals the manual per-bucket reduce (the dedup invariant)", () => {
    const manual = months.reduce(
      (sum, month) =>
        sum +
        (computeMonthlyCost(
          month.total_kg_days,
          100,
          DEFAULT_WACC,
          DEFAULT_STORAGE_COST,
        ) ?? 0),
      0,
    );
    expect(
      computePeriodCost(months, 100, DEFAULT_WACC, DEFAULT_STORAGE_COST),
    ).toBeCloseTo(manual, 6);
  });

  it("returns 0 for null/empty monthly or missing unit price", () => {
    expect(
      computePeriodCost(null, 100, DEFAULT_WACC, DEFAULT_STORAGE_COST),
    ).toBe(0);
    expect(computePeriodCost([], 100, DEFAULT_WACC, DEFAULT_STORAGE_COST)).toBe(
      0,
    );
    // null unit price -> each bucket contributes null -> treated as 0
    expect(
      computePeriodCost(months, null, DEFAULT_WACC, DEFAULT_STORAGE_COST),
    ).toBe(0);
  });
});

describe("formatCost / formatNumber", () => {
  // Pin locale so thousands/decimal separators are deterministic.
  afterEach(() => vi.unstubAllGlobals());
  function withLocale() {
    vi.stubGlobal("navigator", { language: "en-US" });
  }

  it("formats a 2dp currency with its symbol", () => {
    withLocale();
    expect(formatCost(1234.5, "CHF")).toBe("CHF 1,234.50");
  });

  it("rounds zero-decimal currencies (JPY/CNY) to whole units", () => {
    withLocale();
    expect(formatCost(1234.5, "JPY")).toBe("¥1,235");
  });

  it("renders compact magnitudes", () => {
    withLocale();
    expect(formatCost(2_500_000, "USD", { compact: true })).toBe("$2.5m");
    expect(formatNumber(1500, { compact: true })).toBe("1.5k");
  });

  it("falls back to USD when no currency is supplied", () => {
    withLocale();
    expect(formatCost(2500, null, { compact: true })).toBe("$2.5k");
  });

  it("renders a dash for null", () => {
    withLocale();
    expect(formatCost(null, "USD")).toBe("–");
    expect(formatNumber(null)).toBe("–");
  });
});
