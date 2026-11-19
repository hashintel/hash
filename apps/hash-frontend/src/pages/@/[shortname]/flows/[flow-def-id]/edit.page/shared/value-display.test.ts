import { describe, expect, it } from "vitest";

import { getKindLabel } from "./value-display";

import type { PayloadKind } from "@local/hash-isomorphic-utils/flows/types";

const listOf = (payloadKind: PayloadKind) =>
  getKindLabel({ payloadKind, array: true });

describe("getKindLabel", () => {
  it("names a list by its kind's plural, with a capital", () => {
    expect(listOf("Date")).toBe("list of Dates");
    expect(listOf("EntityId")).toBe("list of Entities");
    expect(listOf("FormattedText")).toBe("list of Formatted text");
    /* A phrase whose last word isn't the noun. */
    expect(listOf("DateTime")).toBe("list of Dates and times");
  });
});
