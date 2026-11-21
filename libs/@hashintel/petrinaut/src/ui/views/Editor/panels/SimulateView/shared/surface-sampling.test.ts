import { expect, it } from "vitest";

import { surfaceColumnCount } from "./surface-sampling";

it("draws one column per position of a short axis", () => {
  expect(surfaceColumnCount({ stepCount: 4 })).toBe(5);
});
