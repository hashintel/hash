import { describe, expect, it } from "vitest";

import {
  cameraViewBox,
  fitCamera,
  panCamera,
  pointerFrame,
  zoomCamera,
} from "./camera";

const size = { width: 400, height: 200 };
const options = { origin: "top-left", navigation: "none" } as const;

describe("SVG scene camera", () => {
  it("uses viewport pixels by default, with an optional centered origin", () => {
    expect(cameraViewBox(fitCamera(options, size), size)).toBe("0 0 400 200");
    expect(
      cameraViewBox(fitCamera({ ...options, origin: "center" }, size), size),
    ).toBe("-200 -100 400 200");
  });

  it("fits an explicit viewBox proportionally and reveals more scene on resize", () => {
    const camera = fitCamera(
      { ...options, viewBox: { x: -400, y: -300, width: 800, height: 600 } },
      size,
    );
    expect(camera.zoom).toBeCloseTo(1 / 3);
    expect(cameraViewBox(camera, size)).toBe("-600 -300 1200 600");
    expect(cameraViewBox(camera, { width: 600, height: 400 })).toBe(
      "-900 -600 1800 1200",
    );
  });

  it("pans in screen pixels and keeps the scene point beneath the zoom anchor", () => {
    const camera = { x: 100, y: 50, zoom: 2 };
    expect(panCamera(camera, { x: 40, y: -20 })).toEqual({
      x: 80,
      y: 60,
      zoom: 2,
    });
    const anchor = { x: 300, y: 40 };
    const zoomed = zoomCamera(camera, 3, anchor, size);
    expect(zoomed.x + (anchor.x - size.width / 2) / zoomed.zoom).toBeCloseTo(
      150,
    );
    expect(zoomed.y + (anchor.y - size.height / 2) / zoomed.zoom).toBeCloseTo(
      20,
    );
    expect(zoomCamera(camera, Infinity, anchor, size).zoom).toBe(1000);
    expect(zoomCamera(camera, 0, anchor, size).zoom).toBe(0.01);
  });

  it("tracks a two-finger pinch and continues panning when one finger lifts", () => {
    const points = new Map([
      [1, { x: 0, y: 0 }],
      [2, { x: 60, y: 80 }],
    ]);
    expect(pointerFrame(points)).toEqual({
      center: { x: 30, y: 40 },
      distance: 100,
    });
    points.delete(1);
    expect(pointerFrame(points)).toEqual({
      center: { x: 60, y: 80 },
      distance: 0,
    });
    points.delete(2);
    expect(pointerFrame(points)).toBeNull();
  });
});
