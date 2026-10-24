import { describe, expect, it } from "vitest";

import { bboxToPercentage } from "./bbox-transform";

describe("bboxToPercentage", () => {
  const bbox = { x1: 100, y1: 200, x2: 300, y2: 250, unit: "pt" } as const;

  it("flips the y axis for bottom-left origins", () => {
    expect(bboxToPercentage(bbox, 400, 1000, "BOTTOMLEFT")).toEqual({
      left: 25,
      top: 75,
      width: 50,
      height: 5,
    });
  });

  it("uses y1 directly for top-left origins", () => {
    expect(bboxToPercentage(bbox, 400, 1000, "TOPLEFT")).toEqual({
      left: 25,
      top: 20,
      width: 50,
      height: 5,
    });
  });
});
