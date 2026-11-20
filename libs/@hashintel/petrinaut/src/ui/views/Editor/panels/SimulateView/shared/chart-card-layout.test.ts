import { describe, expect, it } from "vitest";

import {
  CHART_CARD_FOOTER_CHROME,
  chartCardBodyHeight,
  chartCardHeight,
} from "./chart-card-layout";

describe("chartCardHeight", () => {
  it("adds the footer row only when it has a height", () => {
    const without = chartCardHeight({ bodyHeight: 100 });
    expect(chartCardHeight({ bodyHeight: 100, footerHeight: 0 })).toBe(without);
    expect(chartCardHeight({ bodyHeight: 100, footerHeight: 20 })).toBe(
      without + 20 + CHART_CARD_FOOTER_CHROME,
    );
  });
});

describe("chartCardBodyHeight", () => {
  it("inverts chartCardHeight for a card without a footer", () => {
    expect(chartCardBodyHeight(chartCardHeight({ bodyHeight: 220 }))).toBe(220);
    expect(chartCardBodyHeight(2 * 307 + 16)).toBe(543);
  });
});
