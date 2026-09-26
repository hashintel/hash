import { describe, expect, it } from "vitest";

import {
  formatScopedId,
  parseScopedId,
  SCOPED_ID_SEPARATOR,
} from "./scoped-ids";

describe("formatScopedId", () => {
  it("returns the entity id unchanged for an empty instance path", () => {
    expect(formatScopedId([], "place-1")).toBe("place-1");
  });

  it("joins the instance path and entity id with the separator", () => {
    expect(formatScopedId(["instance-1"], "place-1")).toBe(
      "instance-1::place-1",
    );
    expect(formatScopedId(["outer", "inner"], "place-1")).toBe(
      "outer::inner::place-1",
    );
  });

  it("rejects segments containing the separator", () => {
    expect(() => formatScopedId([], `a${SCOPED_ID_SEPARATOR}b`)).toThrow(
      /scope separator/,
    );
    expect(() => formatScopedId(["a::b"], "place-1")).toThrow(
      /scope separator/,
    );
  });
});

describe("parseScopedId", () => {
  it("parses nested instance paths outermost-first", () => {
    expect(parseScopedId("outer::inner::place-1")).toEqual({
      instancePath: ["outer", "inner"],
      entityId: "place-1",
    });
  });
});
