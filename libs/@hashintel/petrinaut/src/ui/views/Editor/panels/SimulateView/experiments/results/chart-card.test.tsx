/**
 * @vitest-environment jsdom
 *
 * jsdom computes no layout, so the card's size contract is checked through
 * what fixes it: the inline heights and the reserved subtitle line.
 */
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ChartCard } from "./chart-card";

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
