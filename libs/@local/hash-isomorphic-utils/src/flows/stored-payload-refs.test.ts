import { describe, expect, test } from "vitest";

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
  test("rejects an input whose value is a stored reference, naming it", () => {
    expect.hasAssertions();

    // SAFETY: the literal omits input fields irrelevant to this check but has the shape of FlowInputValues.
    const flowInputs = {
      query: { kind: "Text", value: "a" },
      entities: { kind: "PersistedEntityMetadata", value: storedArray },
    } as FlowInputValues;

    expect(() => {
      assertNoStoredPayloadRefsInFlowInputs(flowInputs);
    }).toThrow(/^Flow input "entities" contains a stored payload reference/u);
  });

  test("rejects a stored reference held as an item of an inline array", () => {
    expect.hasAssertions();

    // SAFETY: the literal omits input fields irrelevant to this check but has the shape of FlowInputValues.
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
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- partial literal, only the inputs under test are present
    } as FlowInputValues;

    expect(() => {
      assertNoStoredPayloadRefsInFlowInputs(flowInputs);
    }).toThrow(/^Flow input "entity" contains a stored payload reference/u);
  });

  test("accepts inline values, and leaves malformed payloads to other checks", () => {
    expect.hasAssertions();

    // oxlint-disable-next-line typescript/no-restricted-types -- deliberately malformed payloads that do not satisfy FlowInputValues
    const malformedInputs: unknown = {
      query: { kind: "Text", value: "a" },
      urls: { kind: "Text", value: ["https://example.com", "b"] },
      every: { kind: "Duration", value: { amount: 1, unit: "days" } },
      malformed: null,
    };
    // SAFETY: deliberately malformed, since the function must tolerate payloads that are not objects.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the test feeds a malformed payload on purpose
    const flowInputs = malformedInputs as FlowInputValues;

    expect(() => {
      assertNoStoredPayloadRefsInFlowInputs(flowInputs);
    }).not.toThrow();
  });
});
