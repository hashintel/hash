/**
 * `fitViewportToBounds` replaced xyflow's `getViewportForBounds`, so it has to
 * agree with it. xyflow resolves a numeric padding to whole pixels on each
 * side, `floor((size - size / (1 + padding)) / 2)`, and subtracts both from the
 * container; the shared helper divides the bounds by `1 + padding` instead.
 * Those are the same fit up to that flooring, and this pins it so an xyflow
 * upgrade that changes the padding semantics fails here rather than silently
 * reframing every net on first load.
 */

import { getViewportForBounds } from "@xyflow/react";
import { describe, expect, it } from "vitest";

import { ZOOM_PADDING } from "@hashintel/petrinaut-core";

import { fitViewportToBounds } from "../../../canvas-viewport";

import type { Rect, Size } from "@hashintel/petrinaut-core";

const cases: { name: string; bounds: Rect; container: Size }[] = [
  {
    name: "a wide net",
    bounds: { x: 0, y: 0, width: 3000, height: 1500 },
    container: { width: 1200, height: 800 },
  },
  {
    name: "a tall net around the origin",
    bounds: { x: -400, y: -200, width: 2000, height: 2500 },
    container: { width: 900, height: 600 },
  },
  {
    name: "a net far wider than it is tall",
    bounds: { x: 120, y: 40, width: 4000, height: 300 },
    container: { width: 1280, height: 720 },
  },
  {
    name: "a net smaller than the container",
    bounds: { x: 0, y: 0, width: 800, height: 400 },
    container: { width: 1600, height: 900 },
  },
];

/** Wide enough that neither end of the range hides a difference. */
const minZoom = 0.05;
const maxZoom = 2;

describe("fitViewportToBounds", () => {
  for (const { name, bounds, container } of cases) {
    it(`fits ${name} where xyflow does`, () => {
      const ours = fitViewportToBounds(
        bounds,
        container,
        minZoom,
        maxZoom,
        ZOOM_PADDING,
      );
      const xyflow = getViewportForBounds(
        bounds,
        container.width,
        container.height,
        minZoom,
        maxZoom,
        ZOOM_PADDING,
      );

      // Flooring the padding leaves xyflow marginally more room, never less.
      expect(ours.zoom).toBeLessThanOrEqual(xyflow.zoom);
      expect(xyflow.zoom / ours.zoom - 1).toBeLessThan(0.005);
      // The same scene point lands within a pixel of the same screen point.
      expect(Math.abs(ours.x - xyflow.x)).toBeLessThan(2);
      expect(Math.abs(ours.y - xyflow.y)).toBeLessThan(2);
    });
  }

  it("clamps to the zoom floor exactly as xyflow does", () => {
    const bounds: Rect = { x: 0, y: 0, width: 6000, height: 4000 };
    const container: Size = { width: 1200, height: 800 };
    const floor = 0.5;

    const ours = fitViewportToBounds(
      bounds,
      container,
      floor,
      maxZoom,
      ZOOM_PADDING,
    );
    const xyflow = getViewportForBounds(
      bounds,
      container.width,
      container.height,
      floor,
      maxZoom,
      ZOOM_PADDING,
    );

    expect(ours.zoom).toBe(floor);
    expect(xyflow.zoom).toBe(floor);
    expect(Math.abs(ours.x - xyflow.x)).toBeLessThan(2);
    expect(Math.abs(ours.y - xyflow.y)).toBeLessThan(2);
  });

  it("clamps to the zoom ceiling exactly as xyflow does", () => {
    const bounds: Rect = { x: -50, y: -50, width: 200, height: 100 };
    const container: Size = { width: 1600, height: 900 };
    const ceiling = 1.1;

    const ours = fitViewportToBounds(
      bounds,
      container,
      minZoom,
      ceiling,
      ZOOM_PADDING,
    );
    const xyflow = getViewportForBounds(
      bounds,
      container.width,
      container.height,
      minZoom,
      ceiling,
      ZOOM_PADDING,
    );

    expect(ours.zoom).toBe(ceiling);
    expect(xyflow.zoom).toBe(ceiling);
    expect(Math.abs(ours.x - xyflow.x)).toBeLessThan(2);
    expect(Math.abs(ours.y - xyflow.y)).toBeLessThan(2);
  });
});
