import { expect, it } from "vitest";

import { scene } from "../scene.test-helpers";
import { joinedPairs } from "./joined-pairs";

it("says whether a line runs from one node to another, in that direction", () => {
  const joined = joinedPairs(scene.arcs);

  expect(joined("place", "transition")).toBe(true);
  expect(joined("transition", "place")).toBe(true);
  expect(joined("component", "transition")).toBe(true);
  expect(joined("place", "component")).toBe(false);
  expect(joinedPairs(scene.arcs.slice(0, 1))("transition", "place")).toBe(
    false,
  );
});
