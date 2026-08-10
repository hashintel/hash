import { describe, expect, it } from "vitest";

import { cursorInEffect } from "./cursor-in-effect";

const sequence = (requestKey: string, issued: string[]) => ({
  requestKey,
  issuedCursors: new Set(issued),
});

describe("cursorInEffect", () => {
  it("carries a cursor the current sequence handed out", () => {
    expect(
      cursorInEffect({
        requestedCursor: "page-2",
        requestKey: "filters-a",
        sequence: sequence("filters-a", ["page-2"]),
      }),
    ).toBe("page-2");
  });

  it("drops a cursor from a sequence the request left behind", () => {
    // The filters changed, so the accumulated pages — and the cursor they
    // handed out — belong to a sequence this request cannot continue.
    expect(
      cursorInEffect({
        requestedCursor: "page-2",
        requestKey: "filters-b",
        sequence: sequence("filters-a", ["page-2"]),
      }),
    ).toBeNull();
  });

  it("drops a cursor the current sequence never handed out", () => {
    expect(
      cursorInEffect({
        requestedCursor: "page-2-of-another-table",
        requestKey: "filters-a",
        sequence: sequence("filters-a", ["page-2"]),
      }),
    ).toBeNull();
  });

  it("drops a cursor while no pages are accumulated", () => {
    // Nothing has handed out a cursor yet, so a leftover one cannot be in
    // effect — this is what makes a restart ask for a network round trip
    // rather than waiting for a request change that will not come.
    expect(
      cursorInEffect({
        requestedCursor: "page-2",
        requestKey: "filters-a",
        sequence: null,
      }),
    ).toBeNull();
  });

  it("carries nothing without a cursor or a request", () => {
    expect(
      cursorInEffect({
        requestedCursor: null,
        requestKey: "filters-a",
        sequence: sequence("filters-a", ["page-2"]),
      }),
    ).toBeNull();
    expect(
      cursorInEffect({
        requestedCursor: "page-2",
        requestKey: null,
        sequence: sequence("filters-a", ["page-2"]),
      }),
    ).toBeNull();
  });
});
