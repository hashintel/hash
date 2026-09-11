import { describe, expect, it } from "vitest";

import { surfaceColumnCount } from "./surface-sampling";

describe("surfaceColumnCount", () => {
  it("counts every position of a short axis and eleven of a long one", () => {
    expect(surfaceColumnCount({ stepCount: 4 })).toBe(5);
    expect(surfaceColumnCount({ stepCount: 10 })).toBe(11);
    expect(surfaceColumnCount({ stepCount: 50 })).toBe(11);
  });
});
