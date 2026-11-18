import { describe, expect, it } from "vitest";

import { getCenterToReveal } from "./use-step-focus";

const pane = { width: 1000, height: 600 };
const card = { x: 300, y: 100, width: 200, height: 60 };
/* At zoom 2 with the view moved 100px left, the card spans 500 to 900 on screen. */
const viewport = { x: -100, y: 0, zoom: 2 };

describe("getCenterToReveal", () => {
  it("leaves a card that's clear of the panel where it is", () => {
    expect(getCenterToReveal(card, viewport, pane, 100)).toBeNull();
  });

  it("centres a card under the panel in the part the panel leaves", () => {
    expect(getCenterToReveal(card, viewport, pane, 200)).toEqual({
      x: 300 + 100 + 50,
      y: 130,
    });
  });
});
