import { describe, expect, it } from "vitest";

import {
  omitInvalidEmptyFlowInputs,
  validateActionOutputs,
  validateFlowInputs,
} from "./validate-payloads.js";

import type {
  FlowInputDefinition,
  FlowInputValues,
  StepInput,
  StepOutput,
  StoredObjectRef,
} from "./types.js";

const entityId =
  "d4e16033-c281-4cde-aa35-9085bf2e7579~0f5f3bd1-3a28-4b9f-9e3a-5b4a6b1c2d3e";

const storedEntities: StoredObjectRef<"PersistedEntityMetadata", true> = {
  __stored: true,
  kind: "PersistedEntityMetadata",
  storageKey: "flows/run/outputs/step-1",
  array: true,
  length: 2,
};

const inputDefinitions: FlowInputDefinition[] = [
  { name: "query", payloadKind: "Text", array: false, required: true },
  { name: "urls", payloadKind: "Text", array: true, required: false },
  { name: "every", payloadKind: "Duration", array: false, required: false },
  {
    name: "entities",
    payloadKind: "PersistedEntityMetadata",
    array: true,
    required: false,
  },
];

const validateInputs = (flowInputs: Record<string, unknown>) =>
  validateFlowInputs({
    inputDefinitions,
    flowInputs: flowInputs as FlowInputValues,
  });

describe("validateFlowInputs", () => {
  it("accepts valid inputs, leaving out optional ones", () => {
    expect(
      validateInputs({
        query: { kind: "Text", value: "a" },
        urls: { kind: "Text", value: ["https://example.com"] },
        every: { kind: "Duration", value: { amount: 1, unit: "days" } },
        entities: {
          kind: "PersistedEntityMetadata",
          value: [{ entityId, operation: "create" }],
        },
      }),
    ).toBeUndefined();

    expect(
      validateInputs({ query: { kind: "Text", value: "a" } }),
    ).toBeUndefined();
  });

  it("rejects an input the flow doesn't define", () => {
    expect(
      validateInputs({
        query: { kind: "Text", value: "a" },
        other: { kind: "Text", value: "b" },
      }),
    ).toBe(`Flow input "other" isn't one of the flow's inputs`);
  });

  it("rejects a missing required input", () => {
    expect(validateInputs({})).toBe(
      `Flow input "query" is required, but wasn't given`,
    );
  });

  it("rejects a payload that isn't an object, or of another kind", () => {
    expect(validateInputs({ query: null })).toBe(
      `Flow input "query" must be a payload with a kind and a value`,
    );

    expect(validateInputs({ query: { kind: "Number", value: 1 } })).toBe(
      `Flow input "query" must be of kind Text, but is of kind Number`,
    );

    expect(
      validateInputs({
        query: { kind: JSON.parse(`{ "toString": null }`), value: "a" },
      }),
    ).toBe(`Flow input "query" must be of kind Text`);
  });

  it("rejects an invalid value, with the path to it", () => {
    expect(
      validateInputs({
        query: { kind: "Text", value: "a" },
        every: { kind: "Duration", value: { amount: 1, unit: "years" } },
      }),
    ).toMatch(/^Flow input "every" is invalid at unit: /);

    expect(
      validateInputs({
        query: { kind: "Text", value: "a" },
        urls: { kind: "Text", value: ["https://example.com", 2] },
      }),
    ).toMatch(/^Flow input "urls" is invalid at \[1\]: /);

    expect(validateInputs({ query: { kind: "Text", value: ["a"] } })).toMatch(
      /^Flow input "query" is invalid: /,
    );
  });

  it("rejects a stored payload reference, which only the flow's own steps can create", () => {
    expect(
      validateInputs({
        query: { kind: "Text", value: "a" },
        entities: { kind: "PersistedEntityMetadata", value: storedEntities },
      }),
    ).toBe(
      `Flow input "entities" is invalid: A stored payload reference can only be created by a flow's own steps`,
    );
  });
});

describe("omitInvalidEmptyFlowInputs", () => {
  const omitEmpty = (flowInputs: Record<string, unknown>) =>
    omitInvalidEmptyFlowInputs({
      inputDefinitions: [
        ...inputDefinitions,
        { name: "limit", payloadKind: "Number", array: false, required: true },
        {
          name: "entityType",
          payloadKind: "VersionedUrl",
          array: false,
          required: false,
        },
      ],
      flowInputs: flowInputs as FlowInputValues,
    });

  it("leaves out an empty string that isn't valid for its input's kind", () => {
    expect(
      omitEmpty({
        query: { kind: "Text", value: "a" },
        limit: { kind: "Number", value: "" },
        entityType: { kind: "VersionedUrl", value: "" },
      }),
    ).toEqual({ query: { kind: "Text", value: "a" } });
  });

  it("keeps an empty string that is valid, and anything it can't tell is blank", () => {
    const flowInputs = {
      query: { kind: "Text", value: "" },
      urls: { kind: "Text", value: [""] },
      limit: { kind: "Text", value: "" },
      other: { kind: "Number", value: "" },
      every: null,
    };

    expect(omitEmpty(flowInputs)).toEqual(flowInputs);
  });
});

describe("validateActionOutputs", () => {
  const filterInputs: StepInput[] = [
    { inputName: "items", payload: { kind: "Number", value: [1, 2, 3] } },
  ];

  const nonMatching: StepOutput = {
    outputName: "nonMatching",
    payload: { kind: "Number", value: [2, 3] },
  };

  it("accepts valid outputs, including stored references", () => {
    expect(
      validateActionOutputs({
        actionDefinitionId: "webSearch",
        inputs: [],
        outputs: [
          {
            outputName: "webSearchResult",
            payload: {
              kind: "WebSearchResult",
              value: [{ url: "https://example.com", title: "Example" }],
            },
          },
        ] as StepOutput[],
      }),
    ).toBeUndefined();

    expect(
      validateActionOutputs({
        actionDefinitionId: "persistEntities",
        inputs: [],
        outputs: [
          {
            outputName: "persistedEntities",
            payload: { kind: "PersistedEntityMetadata", value: storedEntities },
          },
          {
            outputName: "failedEntityProposals",
            payload: {
              kind: "FailedEntityProposal",
              value: {
                __stored: true,
                kind: "FailedEntityProposal",
                storageKey: "flows/run/outputs/step-1-failed",
                array: true,
                length: 0,
              },
            },
          },
        ],
      }),
    ).toBeUndefined();

    expect(
      validateActionOutputs({
        actionDefinitionId: "filterList",
        inputs: filterInputs,
        outputs: [
          { outputName: "matching", payload: { kind: "Number", value: [1] } },
          nonMatching,
        ],
      }),
    ).toBeUndefined();
  });

  it("rejects a missing required output, accepting a missing optional one", () => {
    expect(
      validateActionOutputs({
        actionDefinitionId: "filterList",
        inputs: filterInputs,
        outputs: [nonMatching],
      }),
    ).toBe(`Action filterList didn't return its required output "matching"`);

    expect(
      validateActionOutputs({
        actionDefinitionId: "find",
        inputs: filterInputs,
        outputs: [],
      }),
    ).toBeUndefined();
  });

  it("rejects an output the action doesn't define", () => {
    expect(
      validateActionOutputs({
        actionDefinitionId: "webSearch",
        inputs: [],
        outputs: [
          { outputName: "other", payload: { kind: "Text", value: "a" } },
        ],
      }),
    ).toBe(`Action webSearch returned output "other", which it doesn't define`);
  });

  it("rejects an output of a kind other than the one it declares", () => {
    expect(
      validateActionOutputs({
        actionDefinitionId: "webSearch",
        inputs: [],
        outputs: [
          {
            outputName: "webSearchResult",
            payload: { kind: "Text", value: ["https://example.com"] },
          },
        ],
      }),
    ).toBe(
      `Action webSearch returned output "webSearchResult" of kind Text, but it must be of kind WebSearchResult`,
    );
  });

  it("rejects a derived output of a kind other than its kind source's", () => {
    expect(
      validateActionOutputs({
        actionDefinitionId: "filterList",
        inputs: filterInputs,
        outputs: [
          { outputName: "matching", payload: { kind: "Text", value: ["a"] } },
        ],
      }),
    ).toBe(
      `Action filterList returned output "matching" of kind Text, but it must have the kind of input "items" (Number)`,
    );
  });

  it("rejects an invalid value, with the path to it", () => {
    const outputs = [
      {
        outputName: "webSearchResult",
        payload: {
          kind: "WebSearchResult",
          value: [
            { url: "https://example.com", title: "Example" },
            { url: "https://example.org" },
          ],
        },
      },
    ] as StepOutput[];

    expect(
      validateActionOutputs({
        actionDefinitionId: "webSearch",
        inputs: [],
        outputs,
      }),
    ).toMatch(
      /^Action webSearch returned an invalid output "webSearchResult" at \[1\]\.title: /,
    );

    expect(
      validateActionOutputs({
        actionDefinitionId: "filterList",
        inputs: filterInputs,
        outputs: [
          { outputName: "matching", payload: { kind: "Number", value: 1 } },
        ] as StepOutput[],
      }),
    ).toBe(
      `Action filterList returned an invalid output "matching": Expected an array`,
    );
  });

  it("rejects a stored reference of the wrong shape", () => {
    expect(
      validateActionOutputs({
        actionDefinitionId: "persistEntities",
        inputs: [],
        outputs: [
          {
            outputName: "persistedEntities",
            payload: {
              kind: "PersistedEntityMetadata",
              value: { ...storedEntities, kind: "EntityId" },
            },
          },
        ] as unknown as StepOutput[],
      }),
    ).toBe(
      `Action persistEntities returned an invalid output "persistedEntities": Expected a stored PersistedEntityMetadata reference, but it is of kind EntityId`,
    );
  });
});
