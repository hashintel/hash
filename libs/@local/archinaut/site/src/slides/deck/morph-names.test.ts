import { describe, expect, it } from "vitest";

import { repeatedNames } from "./morph-names";

describe("repeatedNames", () => {
  it("finds each name shown more than once, once", () => {
    expect(repeatedNames(["a", "b", "a", "c", "a", "b"])).toEqual(["a", "b"]);
  });

  it("finds none when every name is shown once", () => {
    expect(repeatedNames(["dt", "H", "P"])).toEqual([]);
  });
});
