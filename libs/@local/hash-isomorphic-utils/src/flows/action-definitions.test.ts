import { describe, expect, it } from "vitest";

import {
  actionDefinitions,
  getKindSources,
  getPayloadInputNames,
} from "./action-definitions.js";
import { validatePayloadValue } from "./payload-schemas.js";

import type { FlowActionDefinitionId, InputDefinition } from "./types.js";

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

  it("rejects a required output that takes its kind from an optional input", () => {
    expect(() =>
      getKindSources({
        ...findAction,
        inputs: findAction.inputs.map((input) =>
          input.name === "items" ? { ...input, required: false } : input,
        ),
        outputs: [
          { name: "match", kindFrom: "items", array: false, required: true },
        ],
      }),
    ).toThrow(/is required, but takes its kind from input "items"/);
  });

  it("rejects a default on an input a kind is taken from, or on an input that takes its kind from another", () => {
    const withDefault = (inputName: string) => ({
      ...findAction,
      inputs: findAction.inputs.map((input) =>
        input.name === inputName
          ? { ...input, default: { kind: "Text" as const, value: "" } }
          : input,
      ),
    });

    expect(() => getKindSources(withDefault("items"))).toThrow(
      /neither can have a default/,
    );
    expect(() => getKindSources(withDefault("fallback"))).toThrow(
      /neither can have a default/,
    );
  });
});

describe("action input defaults", () => {
  it("gives every default a kind its input accepts and a valid value", () => {
    for (const definition of Object.values(actionDefinitions)) {
      const inputs: readonly InputDefinition[] = definition.inputs;

      for (const input of inputs) {
        if (input.default === undefined) {
          continue;
        }

        const subject = `The default of input "${input.name}" of action "${definition.actionDefinitionId}"`;

        expect(
          "oneOfPayloadKinds" in input ? input.oneOfPayloadKinds : [],
          subject,
        ).toContain(input.default.kind);

        expect(
          validatePayloadValue({
            kind: input.default.kind,
            array: input.array,
            value: input.default.value,
            allowStoredRefs: false,
          }),
          subject,
        ).toBeUndefined();
      }
    }
  });
});

describe("getPayloadInputNames", () => {
  it("reads inputs that a kind is taken from, and inputs that take their kind from another, as payloads", () => {
    expect(getPayloadInputNames(findAction)).toEqual(
      new Set(["items", "fallback"]),
    );
  });

  it("reads other inputs that accept more than one kind as payloads", () => {
    expect(
      getPayloadInputNames({
        ...findAction,
        inputs: findAction.inputs.map((input) =>
          input.name === "criterion"
            ? { ...input, oneOfPayloadKinds: ["Text", "Number"] }
            : input,
        ),
      }),
    ).toEqual(new Set(["items", "fallback", "criterion"]));
  });
});
