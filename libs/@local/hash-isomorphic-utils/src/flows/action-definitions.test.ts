import { describe, expect, it } from "vitest";

import {
  actionDefinitions,
  getKindSources,
  getPayloadInputNames,
} from "./action-definitions.js";

import type { FlowActionDefinitionId } from "./types.js";

const findAction = {
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

describe("getKindSources", () => {
  it("accepts every action definition", () => {
    for (const definition of Object.values(actionDefinitions)) {
      expect(() => getKindSources(definition)).not.toThrow();
    }
  });

  it("rejects a kind taken from an input that doesn't list its kinds", () => {
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
    ).toThrow(/takes its kind from input "fallback"/);
  });
});

describe("getPayloadInputNames", () => {
  it("reads inputs that a kind is taken from, and inputs that take their kind from another, as payloads", () => {
    expect(getPayloadInputNames(findAction)).toEqual(
      new Set(["items", "fallback"]),
    );
  });
});
