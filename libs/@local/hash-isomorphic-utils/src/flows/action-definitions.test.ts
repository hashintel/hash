import { describe, expect, test } from "vitest";

import {
  actionDefinitions,
  getKindSources,
  getPayloadInputNames,
} from "./action-definitions.js";

import type { FlowActionDefinitionId } from "./types.js";

const findAction = {
  // SAFETY: A test fixture id, which need not name a registered action.
  actionDefinitionId: "find" as FlowActionDefinitionId,
  inputs: [
    {
      name: "items",
      oneOfPayloadKinds: ["Text"],
      array: true,
      required: true,
    },
    {
      name: "fallback",
      kindFrom: "items",
      array: false,
      required: false,
    },
    {
      name: "criterion",
      oneOfPayloadKinds: ["Text"],
      array: false,
      required: true,
    },
  ],
  outputs: [
    { name: "match", kindFrom: "items", array: false, required: false },
  ],
} satisfies Parameters<typeof getKindSources>[0];

type TestDefinition = Parameters<typeof getKindSources>[0];
type TestInput = TestDefinition["inputs"][number];

const overrideInput = (
  inputName: string,
  override: Partial<TestInput>,
): TestInput[] => {
  const inputs: TestInput[] = [];
  for (const input of findAction.inputs) {
    inputs.push(input.name === inputName ? { ...input, ...override } : input);
  }
  return inputs;
};

const withDefault = (inputName: string): TestDefinition => ({
  ...findAction,
  inputs: overrideInput(inputName, {
    default: { kind: "Text" as const, value: "" },
  }),
});

describe("getKindSources", () => {
  test("accepts every action definition", () => {
    expect.hasAssertions();

    for (const definition of Object.values(actionDefinitions)) {
      expect(() => getKindSources(definition)).not.toThrow();
    }
  });

  test("rejects a kind taken from an input that doesn't list its kinds", () => {
    expect.hasAssertions();

    expect(() =>
      getKindSources({
        ...findAction,
        outputs: [
          {
            name: "match",
            kindFrom: "fallback",
            array: false,
            required: false,
          },
        ],
      }),
    ).toThrow(/takes its kind from input "fallback"/u);
  });

  test("rejects a required output that takes its kind from an optional input", () => {
    expect.hasAssertions();

    expect(() =>
      getKindSources({
        ...findAction,
        inputs: overrideInput("items", { required: false }),
        outputs: [
          { name: "match", kindFrom: "items", array: false, required: true },
        ],
      }),
    ).toThrow(/is required, but takes its kind from input "items"/u);
  });

  test("rejects a default on an input a kind is taken from, or on an input that takes its kind from another", () => {
    expect.hasAssertions();

    expect(() => getKindSources(withDefault("items"))).toThrow(
      /neither can have a default/u,
    );
    expect(() => getKindSources(withDefault("fallback"))).toThrow(
      /neither can have a default/u,
    );
  });
});

describe("getPayloadInputNames", () => {
  test("reads inputs that a kind is taken from, and inputs that take their kind from another, as payloads", () => {
    expect.hasAssertions();

    expect(getPayloadInputNames(findAction)).toStrictEqual(
      new Set(["items", "fallback"]),
    );
  });

  test("reads other inputs that accept more than one kind as payloads", () => {
    expect.hasAssertions();

    expect(
      getPayloadInputNames({
        ...findAction,
        inputs: overrideInput("criterion", {
          oneOfPayloadKinds: ["Text", "Number"],
        }),
      }),
    ).toStrictEqual(new Set(["items", "fallback", "criterion"]));
  });
});
