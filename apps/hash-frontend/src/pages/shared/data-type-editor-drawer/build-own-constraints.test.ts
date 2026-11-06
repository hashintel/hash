import { describe, expect, it } from "vitest";

import { buildOwnConstraints } from "./build-own-constraints";
import { defaultListConfig } from "./shared/list-config";

import type { ListConfig } from "./shared/list-config";
import type { SingleValueSchema } from "@blockprotocol/type-system";

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

  it("mirrors a union parent's arms instead of claiming string", () => {
    const unionArms: SingleValueSchema[] = [
      { type: "number", minimum: 0 },
      { type: "array", items: { type: "number" } },
    ];

    expect(
      buildOwnConstraints({ primitive: null, unionArms, listEntries: [] }),
    ).toEqual({ anyOf: unionArms });
  });

  it("keeps a single mirrored arm as the sole constraint", () => {
    expect(
      buildOwnConstraints({
        primitive: null,
        unionArms: [{ type: "boolean" }],
        listEntries: [],
      }),
    ).toEqual({ type: "boolean" });
  });

  it("does not duplicate a union arm already expressed as a list entry", () => {
    expect(
      buildOwnConstraints({
        primitive: null,
        unionArms: [
          { type: "string" },
          { type: "array", items: { type: "string" } },
        ],
        listEntries: [{ config: stringListConfig() }],
      }),
    ).toEqual({
      anyOf: [{ type: "string" }, { type: "array", items: { type: "string" } }],
    });
  });

  it("falls back to string with nothing to express", () => {
    expect(buildOwnConstraints({ primitive: null, listEntries: [] })).toEqual({
      type: "string",
    });
  });
});
