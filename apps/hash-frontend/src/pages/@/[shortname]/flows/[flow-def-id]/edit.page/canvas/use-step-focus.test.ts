import { describe, expect, it } from "vitest";

import { getCenterToReveal } from "./use-step-focus";

const pane = { width: 1000, height: 600 };
const card = { width: 200, height: 60 };

describe("getCenterToReveal", () => {
  it("leaves a card that's clear of the panel where it is", () => {
    expect(
      getCenterToReveal(
        { x: 400, y: 100, ...card },
        { x: 0, y: 0, zoom: 1 },
        pane,
        384,
      ),
    ).toBeNull();
  });

  it("centres a card inside the pane but under the panel in the part the panel leaves", () => {
    /* Its right edge, 664 + 200, is past the panel's left edge at 1000 - 384 = 616. */
    expect(
      getCenterToReveal(
        { x: 664, y: 100, ...card },
        { x: 0, y: 0, zoom: 1 },
        pane,
        384,
      ),
    ).toEqual({ x: 664 + 100 + 192, y: 130 });
  });

  it("measures the card at the view's zoom and offset", () => {
    /* At zoom 2 with the view moved 100px left, x = 300 sits at 500 on screen and ends at 900. */
    const viewport = { x: -100, y: 0, zoom: 2 };

    expect(
      getCenterToReveal({ x: 300, y: 100, ...card }, viewport, pane, 0),
    ).toBeNull();
    expect(
      getCenterToReveal({ x: 300, y: 100, ...card }, viewport, pane, 200),
    ).toEqual({ x: 300 + 100 + 50, y: 130 });
  });
});
