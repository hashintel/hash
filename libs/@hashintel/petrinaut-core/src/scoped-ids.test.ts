import { describe, expect, it } from "vitest";

import {
  formatScopedId,
  isScopedId,
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
  it("parses an unscoped id to an empty instance path", () => {
    expect(parseScopedId("place-1")).toEqual({
      instancePath: [],
      entityId: "place-1",
    });
  });

  it("parses a scoped id into path and entity id", () => {
    expect(parseScopedId("instance-1::place-1")).toEqual({
      instancePath: ["instance-1"],
      entityId: "place-1",
    });
  });

  it("parses nested instance paths outermost-first", () => {
    expect(parseScopedId("outer::inner::place-1")).toEqual({
      instancePath: ["outer", "inner"],
      entityId: "place-1",
    });
  });

  it("round-trips through formatScopedId", () => {
    const { instancePath, entityId } = parseScopedId("outer::inner::place-1");
    expect(formatScopedId(instancePath, entityId)).toBe(
      "outer::inner::place-1",
    );
  });
});

describe("isScopedId", () => {
  it("distinguishes scoped from unscoped ids", () => {
    expect(isScopedId("place-1")).toBe(false);
    expect(isScopedId("instance-1::place-1")).toBe(true);
  });
});
