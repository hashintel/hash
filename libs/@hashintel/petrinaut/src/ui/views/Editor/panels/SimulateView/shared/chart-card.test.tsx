/**
 * @vitest-environment jsdom
 *
 * jsdom computes no layout, so the card's size contract is checked through
 * what fixes it: the inline heights, the reserved subtitle line, and the
 * height helper the grid and the cards both read.
 */
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  CHART_CARD_FOOTER_CHROME,
  ChartCard,
  chartCardBodyHeight,
  chartCardHeight,
} from "./chart-card";

afterEach(cleanup);

describe("ChartCard", () => {
  it("reserves the subtitle line when there is no subtitle", () => {
    render(
      <ChartCard title="Summary" bodyHeight={120}>
        <span>body</span>
      </ChartCard>,
    );

    const subtitle = document.querySelector("[data-chart-card-subtitle]");
    expect(subtitle).not.toBeNull();
    expect(subtitle!.textContent).toBe("");
  });

  it("fixes the body's height and lets a card without one fill", () => {
    render(
      <>
        <ChartCard title="Fixed" bodyHeight={220}>
          <span>fixed</span>
        </ChartCard>
        <ChartCard title="Filling">
          <span>filling</span>
        </ChartCard>
      </>,
    );

    const [fixed, filling] = document.querySelectorAll<HTMLElement>(
      "[data-chart-card-body]",
    );
    expect(fixed!.style.height).toBe("220px");
    expect(filling!.style.height).toBe("");
  });

  it("reserves the footer row when only its height is given", () => {
    const { container } = render(
      <ChartCard title="Surface" footerHeight={20}>
        <span />
      </ChartCard>,
    );

    const footer = container.querySelector<HTMLElement>(
      "[data-chart-card] > :last-child",
    )!;
    expect(footer.style.height).toBe("20px");
    expect(footer.textContent).toBe("");
  });
});

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
