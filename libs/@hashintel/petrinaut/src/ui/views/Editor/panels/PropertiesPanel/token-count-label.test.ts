import { expect, it } from "vitest";

import { tokenCountLabel } from "./token-count-label";

it("names how many tokens an arity couples", () => {
  expect(tokenCountLabel(1)).toBe("1 token");
  expect(tokenCountLabel(2)).toBe("2 tokens");
});
