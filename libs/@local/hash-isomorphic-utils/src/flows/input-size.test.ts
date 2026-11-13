import { describe, expect, it } from "vitest";

import { actionDefinitions } from "./action-definitions.js";
import { filterableKinds } from "./filter-condition.js";
import { getInputSize } from "./input-size.js";

import type { InputDefinition } from "./types.js";

/** An input that's single and required unless `fields` says otherwise. */
const input = (fields: Partial<InputDefinition>) =>
  ({
    name: "input",
    array: false,
    required: true,
    ...fields,
  }) as InputDefinition;

describe("getInputSize", () => {
  it("takes the size on the definition over its kind's", () => {
    expect(
      getInputSize(input({ oneOfPayloadKinds: ["Text"], size: "short" })),
    ).toBe("short");
    expect(
      getInputSize(input({ oneOfPayloadKinds: ["Text"], size: "medium" })),
    ).toBe("medium");
  });

  it("sizes an input of one kind by that kind, with text long", () => {
    expect(getInputSize(input({ oneOfPayloadKinds: ["Text"] }))).toBe("long");
    expect(getInputSize(input({ oneOfPayloadKinds: ["FormattedText"] }))).toBe(
      "long",
    );
    expect(getInputSize(input({ oneOfPayloadKinds: ["Number"] }))).toBe(
      "short",
    );
    expect(getInputSize(input({ oneOfPayloadKinds: ["EntityQuery"] }))).toBe(
      "short",
    );
  });

  it("keeps a list, an input of several kinds, and one with a derived kind short", () => {
    expect(
      getInputSize(input({ oneOfPayloadKinds: ["Text"], array: true })),
    ).toBe("short");
    expect(getInputSize(input({ oneOfPayloadKinds: filterableKinds }))).toBe(
      "short",
    );
    expect(
      getInputSize(input({ oneOfPayloadKinds: ["Text", "WebPage"] })),
    ).toBe("short");
    expect(getInputSize(input({ kindFrom: "items" }))).toBe("short");
  });

  it("sizes the text inputs of the steps the editor can add", () => {
    const sizes = (actionId: "draftMessage" | "getFileFromUrl") =>
      Object.fromEntries(
        actionDefinitions[actionId].inputs.map((definition) => [
          definition.name,
          getInputSize(definition),
        ]),
      );

    expect(sizes("draftMessage")).toEqual({
      instructions: "medium",
      context: "long",
      entities: "short",
    });
    expect(sizes("getFileFromUrl")).toMatchObject({
      url: "short",
      displayName: "short",
      description: "medium",
    });
  });

  it("has sizes on definitions only for single inputs that take text", () => {
    const misplaced = Object.values(actionDefinitions).flatMap(
      ({ actionDefinitionId, inputs }) =>
        inputs
          .filter(
            (definition) =>
              definition.size !== undefined &&
              (definition.array ||
                !("oneOfPayloadKinds" in definition) ||
                !definition.oneOfPayloadKinds.includes("Text")),
          )
          .map(({ name }) => `${actionDefinitionId}.${name}`),
    );

    expect(misplaced).toEqual([]);
  });
});
