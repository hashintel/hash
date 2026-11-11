import { describe, expect, it } from "vitest";

import {
  fitViewportToBounds,
  getInitialViewport,
  isScenePointInView,
  MAX_FIT_ZOOM,
  revealBounds,
} from "./canvas-viewport";

const canvasSize = { width: 1000, height: 600 };
const insets = { left: 200, right: 300, bottom: 100 };
const atOrigin = { x: 0, y: 0, zoom: 1 };

describe("revealBounds", () => {
  const reveal = (bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  }) =>
    revealBounds({
      bounds,
      viewport: atOrigin,
      container: canvasSize,
      insets,
      minZoom: 0.1,
      zoomOut: true,
    });

  it("leaves bounds that already show alone", () => {
    expect(reveal({ x: 300, y: 100, width: 100, height: 80 })).toBeNull();
  });

  it("pans a node under the right panel just far enough out", () => {
    // The uncovered area ends at 1000 - 300 = 700.
    expect(reveal({ x: 650, y: 100, width: 100, height: 80 })).toEqual({
      x: -50,
      y: 0,
      zoom: 1,
    });
  });

  it("pans a node under the left panel and the bottom panel", () => {
    expect(reveal({ x: 100, y: 450, width: 100, height: 80 })).toEqual({
      x: 100,
      y: -30,
      zoom: 1,
    });
  });

  it("zooms out to fit bounds larger than the visible area", () => {
    const result = reveal({ x: 0, y: 0, width: 1000, height: 200 });
    // The uncovered area is 500 by 500: the zoom fits 1000 scene pixels
    // across it, and the bounds sit centred in it.
    expect(result).toEqual({ zoom: 0.5, x: 200, y: 200 });
  });

  it("leaves bounds too large to fit alone unless it may zoom out", () => {
    expect(
      revealBounds({
        bounds: { x: 0, y: 0, width: 1000, height: 200 },
        viewport: atOrigin,
        container: canvasSize,
        insets,
        minZoom: 0.1,
        zoomOut: false,
      }),
    ).toBeNull();
  });
});

describe("isScenePointInView", () => {
  it("counts a point under a panel as out of view", () => {
    expect(
      isScenePointInView({ x: 100, y: 100 }, atOrigin, canvasSize, insets),
    ).toBe(false);
    expect(
      isScenePointInView({ x: 400, y: 100 }, atOrigin, canvasSize, insets),
    ).toBe(true);
  });
});

describe("fitViewportToBounds", () => {
  it("centres the bounds and leaves the padding free", () => {
    const result = fitViewportToBounds(
      { x: 0, y: 0, width: 200, height: 100 },
      { width: 600, height: 600 },
      0.1,
      10,
      0.5,
    );
    // Width limits: 600 / (200 * 1.5) = 2
    expect(result.zoom).toBe(2);
    // Bounds centre (100, 50) lands on the container centre (300, 300)
    expect(result.x).toBe(300 - 100 * 2);
    expect(result.y).toBe(300 - 50 * 2);
  });

  it("clamps the zoom to the given range", () => {
    const bounds = { x: 0, y: 0, width: 10, height: 10 };
    const container = { width: 1000, height: 1000 };
    expect(fitViewportToBounds(bounds, container, 0.1, 1.5, 0).zoom).toBe(1.5);
    expect(
      fitViewportToBounds(
        { x: 0, y: 0, width: 10_000, height: 10_000 },
        container,
        0.3,
        1.5,
        0,
      ).zoom,
    ).toBe(0.3);
  });

  it("centres within asymmetric panel insets", () => {
    const result = fitViewportToBounds(
      { x: 0, y: 0, width: 200, height: 100 },
      { width: 1000, height: 600 },
      0.1,
      10,
      0,
      { left: 100, right: 300, bottom: 200 },
    );
    expect(result.zoom).toBe(3);
    // The visible area is x=[100,700], y=[0,400].
    expect(result.x).toBe(400 - 100 * 3);
    expect(result.y).toBe(200 - 50 * 3);
  });
});

describe("getInitialViewport", () => {
  it("returns the origin at zoom 1 when there is nothing to fit", () => {
    expect(getInitialViewport(null, { width: 500, height: 400 })).toEqual({
      x: 0,
      y: 0,
      zoom: 1,
    });
  });

  it("never zooms in past the fit ceiling", () => {
    const result = getInitialViewport(
      { x: 0, y: 0, width: 10, height: 10 },
      { width: 1000, height: 1000 },
    );
    expect(result.zoom).toBe(MAX_FIT_ZOOM);
  });
});
