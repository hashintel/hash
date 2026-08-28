import { describe, expect, it } from "vitest";

import {
  canonicalSearchString,
  selectionToSearch,
  sharedSearchesMatch,
  validateSharedExampleSearch,
} from "./example-search";

describe("example search contract", () => {
  it("strips unsupported query values", () => {
    expect(
      validateSharedExampleSearch({
        scenario: "scenario-1",
        subnet: 42,
        itemType: "unknown",
        itemId: "place-1",
        unrelated: "value",
      }),
    ).toEqual({
      scenario: "scenario-1",
      subnet: undefined,
    });
  });

  it("keeps focused items only as complete pairs", () => {
    expect(validateSharedExampleSearch({ itemType: "place" })).toEqual({
      scenario: undefined,
      subnet: undefined,
    });
    expect(
      validateSharedExampleSearch({ itemType: "place", itemId: "place-1" }),
    ).toEqual({
      scenario: undefined,
      subnet: undefined,
      itemType: "place",
      itemId: "place-1",
    });
  });

  it("carries no item for a multi-selection", () => {
    expect(
      selectionToSearch([
        { type: "place", id: "place-1" },
        { type: "transition", id: "transition-1" },
      ]),
    ).toEqual({});
  });

  it("compares locations by canonical string, not key order", () => {
    expect(
      sharedSearchesMatch(
        { subnet: "subnet-1", scenario: "scenario-1" },
        { scenario: "scenario-1", subnet: "subnet-1" },
      ),
    ).toBe(true);
    expect(
      sharedSearchesMatch(
        { scenario: "scenario-1" },
        { scenario: "scenario-2" },
      ),
    ).toBe(false);
  });

  it("encodes the canonical string with contract keys only, sorted", () => {
    expect(
      canonicalSearchString({
        subnet: "subnet-1",
        scenario: "scenario-1",
        itemType: "place",
        itemId: "place-1",
      }),
    ).toBe("itemId=place-1&itemType=place&scenario=scenario-1&subnet=subnet-1");
  });
});
