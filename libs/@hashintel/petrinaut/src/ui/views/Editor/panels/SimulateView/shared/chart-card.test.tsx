/**
 * @vitest-environment jsdom
 *
 * jsdom computes no layout, so the card's size contract is checked through
 * what fixes it: the inline heights, the reserved subtitle line, the grid's
 * row template, and the height helper the grid and the cards both read.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  CHART_CARD_BODY_PADDING,
  CHART_CARD_FOOTER_CHROME,
  CHART_CARD_HEADER_HEIGHT,
  ChartCard,
  chartCardBodyHeight,
  ChartCardGrid,
  chartCardHeight,
} from "./chart-card";

afterEach(cleanup);

describe("ChartCard", () => {
  it("renders the title, the subtitle and the actions in the header", () => {
    render(
      <ChartCard
        title="Infected"
        subtitle="heatmap · value over time"
        actions={<button type="button">Chart options</button>}
        bodyHeight={220}
      >
        <canvas />
      </ChartCard>,
    );

    expect(screen.getByText("Infected")).toBeTruthy();
    expect(screen.getByText("heatmap · value over time")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Chart options" })).toBeTruthy();
  });

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

  it("marks the tone on the root for probes and tests", () => {
    render(
      <>
        <ChartCard title="A" bodyHeight={10}>
          <span />
        </ChartCard>
        <ChartCard title="B" tone="paused" bodyHeight={10}>
          <span />
        </ChartCard>
      </>,
    );

    const tones = [...document.querySelectorAll("[data-chart-card]")].map(
      (card) => card.getAttribute("data-tone"),
    );
    expect(tones).toEqual(["default", "paused"]);
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
  it("adds the chrome around the body", () => {
    expect(chartCardHeight({ bodyHeight: 220 })).toBe(
      2 + CHART_CARD_HEADER_HEIGHT + CHART_CARD_BODY_PADDING * 2 + 220,
    );
  });

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

describe("ChartCardGrid", () => {
  it("fixes every row's height and fits as many columns as the width allows", () => {
    render(
      <ChartCardGrid minColumnWidth={360} rowHeight={295}>
        <ChartCard title="One" bodyHeight={220}>
          <span />
        </ChartCard>
        <ChartCard title="Two" bodyHeight={220}>
          <span />
        </ChartCard>
      </ChartCardGrid>,
    );

    const grid = document.querySelector<HTMLElement>("[data-chart-card-grid]")!;
    expect(grid.style.gridAutoRows).toBe("295px");
    expect(grid.style.gridTemplateColumns).toBe(
      "repeat(auto-fill, minmax(min(100%, 360px), 1fr))",
    );
    expect(grid.querySelectorAll("[data-chart-card]")).toHaveLength(2);
  });

  it("declares reading-flow so Tab follows the packed order where the browser supports it", () => {
    render(
      <ChartCardGrid minColumnWidth={360} rowHeight={295}>
        <ChartCard title="One" bodyHeight={220}>
          <span />
        </ChartCard>
      </ChartCardGrid>,
    );

    const grid = document.querySelector<HTMLElement>("[data-chart-card-grid]")!;
    expect(grid.className).toContain("grid-af_row_dense");
    expect(grid.className).toContain("reading-flow_grid-order");
  });
});
