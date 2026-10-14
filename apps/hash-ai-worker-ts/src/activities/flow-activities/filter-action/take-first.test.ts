import { describe, expect, it } from "vitest";

import { takeFirst } from "./take-first.js";

const letters = {
  kind: "Text" as const,
  value: Object.freeze(["a", "b", "c"]),
};

describe("takeFirst", () => {
  it("keeps the first items in order", () => {
    expect(takeFirst(letters, 2)).toEqual({
      status: "success",
      items: { kind: "Text", value: ["a", "b"] },
    });
  });

  it("keeps nothing for a count of 0", () => {
    expect(takeFirst(letters, 0)).toEqual({
      status: "success",
      items: { kind: "Text", value: [] },
    });
  });

  it("keeps the whole list for a count past its end", () => {
    expect(takeFirst(letters, 5)).toEqual({
      status: "success",
      items: { kind: "Text", value: ["a", "b", "c"] },
    });
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects a count of %s, which isn't a whole number of 0 or more",
    (count) => {
      expect(takeFirst(letters, count)).toEqual({
        status: "error",
        code: "invalidCount",
        message: "The count must be a whole number, 0 or more.",
      });
    },
  );
});
