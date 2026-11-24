import { expect, it } from "vitest";

import { slideFromEdge } from "./slide-from-edge";

it("leaves a panel that is in place without a transform", () => {
  expect(slideFromEdge("left", 1)).toBe("none");
  expect(slideFromEdge("right", 1)).toBe("none");
  expect(slideFromEdge("bottom", 1)).toBe("none");
});

it("moves a closed panel off its edge by its own size", () => {
  expect(slideFromEdge("left", 0)).toBe("translateX(calc(0px - 100%))");
  expect(slideFromEdge("right", 0)).toBe("translateX(calc(100% - 0px))");
  expect(slideFromEdge("bottom", 0)).toBe("translateY(calc(100% - 0px))");
});

it("moves a panel part of the way while it opens or closes", () => {
  expect(slideFromEdge("right", 0.75)).toBe("translateX(calc(25% - 0px))");
});

it("pushes a panel further from its edge to make way", () => {
  expect(slideFromEdge("right", 1, 420)).toBe("translateX(calc(0% - 420px))");
});
