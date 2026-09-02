import { describe, expect, it } from "vitest";

import { canonicalizeSelection, selectionItemTypes } from "./selection";

describe("canonicalizeSelection", () => {
  it("deduplicates and orders by type then id", () => {
    expect(
      canonicalizeSelection([
        { type: "transition", id: "transition-b" },
        { type: "place", id: "place-b" },
        { type: "place", id: "place-a" },
        { type: "transition", id: "transition-b" },
      ]),
    ).toEqual([
      { type: "place", id: "place-a" },
      { type: "place", id: "place-b" },
      { type: "transition", id: "transition-b" },
    ]);
  });

  it("orders every selection item type deterministically", () => {
    const oneOfEach = selectionItemTypes.map((type) => ({ type, id: "x" }));

    expect(canonicalizeSelection([...oneOfEach].reverse())).toEqual(
      canonicalizeSelection(oneOfEach),
    );
  });
});
