import { describe, expect, it } from "vitest";

import { assertNoStoredPayloadRefsInFlowInputs } from "./stored-payload-refs.js";

import type { FlowInputValues, StoredObjectRef } from "./types.js";

const storedArray: StoredObjectRef<"PersistedEntityMetadata", true> = {
  __stored: true,
  kind: "PersistedEntityMetadata",
  storageKey: "flows/other-run/outputs/step-1",
  array: true,
  length: 2,
};

describe("assertNoStoredPayloadRefsInFlowInputs", () => {
  it("rejects an input whose value is a stored reference, naming it", () => {
    const flowInputs = {
      query: { kind: "Text", value: "a" },
      entities: { kind: "PersistedEntityMetadata", value: storedArray },
    } as FlowInputValues;

    expect(() => assertNoStoredPayloadRefsInFlowInputs(flowInputs)).toThrow(
      /^Flow input "entities" contains a stored payload reference/,
    );
  });

  it("rejects a stored reference held as an item of an inline array", () => {
    const flowInputs = {
      entity: {
        kind: "PersistedEntityMetadata",
        value: [
          { entityId: "web~entity", operation: "create" },
          {
            __stored: true,
            kind: "PersistedEntityMetadata",
            array: false,
            of: storedArray,
            index: 1,
          },
        ],
      },
    } as FlowInputValues;

    expect(() => assertNoStoredPayloadRefsInFlowInputs(flowInputs)).toThrow(
      /^Flow input "entity" contains a stored payload reference/,
    );
  });

  it("accepts inline values, including arrays and objects", () => {
    const flowInputs = {
      query: { kind: "Text", value: "a" },
      urls: { kind: "Text", value: ["https://example.com", "b"] },
      none: { kind: "Text", value: [] },
      every: { kind: "Duration", value: { amount: 1, unit: "days" } },
    } satisfies FlowInputValues;

    expect(() =>
      assertNoStoredPayloadRefsInFlowInputs(flowInputs),
    ).not.toThrow();
  });
});
