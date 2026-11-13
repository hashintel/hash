import { describe, expect, it } from "vitest";

import { getKindLabel } from "./value-display";

import type { PayloadKind } from "@local/hash-isomorphic-utils/flows/types";

const listOf = (payloadKind: PayloadKind) =>
  getKindLabel({ payloadKind, array: true });

describe("getKindLabel", () => {
  it("names a single value's kind in lower case", () => {
    expect(getKindLabel({ payloadKind: "EntityId", array: false })).toBe(
      "entity",
    );
  });

  it("names a list by its kind's plural, with a capital", () => {
    expect(listOf("Date")).toBe("list of Dates");
    /* A consonant before the y, so -ies. */
    expect(listOf("EntityId")).toBe("list of Entities");
    expect(listOf("EntityQuery")).toBe("list of Entity queries");
    /* Text, and a name already ending in s, stay as they are. */
    expect(listOf("FormattedText")).toBe("list of Formatted text");
    expect(listOf("PropertyObjectWithMetadata")).toBe(
      "list of Entity properties",
    );
    /* A phrase whose last word isn't the noun. */
    expect(listOf("DateTime")).toBe("list of Dates and times");
  });
});
