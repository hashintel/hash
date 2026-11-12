import { describe, expect, it } from "vitest";

import { getValueDisplay, isLongText } from "./run-value-display";

import type { EntityId } from "@blockprotocol/type-system";

const entityId = (uuid: string) => `web~${uuid}` as EntityId;

describe("isLongText", () => {
  it("counts text as long past 600 characters, or past 12 lines", () => {
    expect(isLongText("Supplier report")).toBe(false);
    expect(isLongText("a".repeat(600))).toBe(false);
    expect(isLongText("a".repeat(601))).toBe(true);
    expect(isLongText(Array(12).fill("line").join("\n"))).toBe(false);
    expect(isLongText(Array(13).fill("line").join("\n"))).toBe(true);
  });
});

describe("getValueDisplay", () => {
  it("shows text, numbers, true or false and dates as text, a list's one per line", () => {
    expect(getValueDisplay({ kind: "Text", value: "Supplier report" })).toEqual(
      { kind: "inline", values: ["Supplier report"] },
    );
    expect(getValueDisplay({ kind: "Number", value: [3, 0.5] })).toEqual({
      kind: "inline",
      values: ["3", "0.5"],
    });
    expect(getValueDisplay({ kind: "Boolean", value: false })).toEqual({
      kind: "inline",
      values: ["False"],
    });
    expect(getValueDisplay({ kind: "Date", value: "2026-11-05" })).toEqual({
      kind: "inline",
      values: ["5 Nov 2026"],
    });
    /* Read in local time, so the test holds in any time zone. */
    expect(
      getValueDisplay({ kind: "DateTime", value: "2026-11-05T09:05:00" }),
    ).toEqual({ kind: "inline", values: ["5 Nov 2026, 09:05"] });
    expect(
      getValueDisplay({
        kind: "Duration",
        value: [
          { amount: 1, unit: "hours" },
          { amount: 3, unit: "days" },
        ],
      }),
    ).toEqual({ kind: "inline", values: ["1 hour", "3 days"] });
    expect(getValueDisplay({ kind: "Text", value: [] })).toEqual({
      kind: "inline",
      values: [],
    });
  });

  it("shows the entities a value names, whether by id or as saved", () => {
    expect(
      getValueDisplay({
        kind: "EntityId",
        value: [entityId("a"), entityId("b")],
      }),
    ).toEqual({ kind: "entities", entityIds: [entityId("a"), entityId("b")] });
    expect(
      getValueDisplay({
        kind: "PersistedEntityMetadata",
        value: { entityId: entityId("c"), operation: "create" },
      }),
    ).toEqual({ kind: "entities", entityIds: [entityId("c")] });
  });

  it("describes a value whose content means little to read, a list by its length", () => {
    expect(
      getValueDisplay({ kind: "EntityQuery", value: { filter: { all: [] } } }),
    ).toEqual({ kind: "described", text: "An entity query" });
    expect(
      getValueDisplay({
        kind: "EntityQuery",
        value: [{ filter: { all: [] } }, { filter: { any: [] } }],
      }),
    ).toEqual({ kind: "described", text: "2 items" });
  });

  it("describes a value read from storage, whose content the run doesn't have", () => {
    const storedList = {
      __stored: true,
      kind: "EntityId",
      storageKey: "flows/run/list",
      array: true,
      length: 20,
    } as const;

    expect(getValueDisplay({ kind: "EntityId", value: storedList })).toEqual({
      kind: "described",
      text: "20 items",
    });
    expect(
      getValueDisplay({
        kind: "EntityId",
        value: {
          __stored: true,
          kind: "EntityId",
          array: false,
          of: storedList,
          index: 3,
        },
      }),
    ).toEqual({ kind: "described", text: "An entity" });
  });
});
