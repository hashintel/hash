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

  it("orders ids by UTF-16 code unit, not by collation", () => {
    // By code unit `-` and `B` both sort before `a`. Collation puts `placea`
    // before `placeB` everywhere, and before `place-b` where it ignores
    // punctuation.
    expect(
      canonicalizeSelection([
        { type: "place", id: "placea" },
        { type: "place", id: "placeB" },
        { type: "place", id: "place-b" },
      ]),
    ).toEqual([
      { type: "place", id: "place-b" },
      { type: "place", id: "placeB" },
      { type: "place", id: "placea" },
    ]);
  });

  it("orders every selection item type deterministically", () => {
    const oneOfEach = selectionItemTypes.map((type) => ({ type, id: "x" }));

    expect(canonicalizeSelection([...oneOfEach].reverse())).toEqual(
      canonicalizeSelection(oneOfEach),
    );
  });
});
