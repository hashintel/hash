import { describe, expect, it } from "vitest";

import { chartCardBodyHeight, chartCardHeight } from "./chart-card-layout";

describe("chartCardHeight", () => {
  it("adds the footer row and its padding only when it has a height", () => {
    const without = chartCardHeight({ bodyHeight: 100 });
    expect(chartCardHeight({ bodyHeight: 100, footerHeight: 0 })).toBe(without);
    expect(
      chartCardHeight({ bodyHeight: 100, footerHeight: 20 }),
    ).toBeGreaterThan(without + 20);
  });
});

describe("chartCardBodyHeight", () => {
  it("inverts chartCardHeight for a card without a footer", () => {
    expect(chartCardBodyHeight(chartCardHeight({ bodyHeight: 220 }))).toBe(220);
  });
});
