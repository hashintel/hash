import { describe, expect, it } from "vitest";

import { defaultListConfig } from "../list-util";
import { buildOwnConstraints } from "./build-own-constraints";

import type { ListConfig } from "../list-util";

const stringListConfig = (): ListConfig => ({
  ...defaultListConfig(),
  itemType: "string",
});

describe("buildOwnConstraints", () => {
  it("emits the parent primitive with own constraint values", () => {
    expect(
      buildOwnConstraints({
        primitive: "string",
        listEntries: [],
        constraintsPart: { minLength: 2 },
      }),
    ).toEqual({ type: "string", minLength: 2 });
  });

  it("joins the primitive and list arms with anyOf", () => {
    expect(
      buildOwnConstraints({
        primitive: "number",
        listEntries: [{ config: stringListConfig() }],
      }),
    ).toEqual({
      anyOf: [{ type: "number" }, { type: "array", items: { type: "string" } }],
    });
  });

  it("falls back to string with nothing to express", () => {
    expect(buildOwnConstraints({ primitive: null, listEntries: [] })).toEqual({
      type: "string",
    });
  });
});
