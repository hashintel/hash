import { describe, expect, it } from "vitest";

import { truncationNotice } from "./scenario-start-state";

describe("truncationNotice", () => {
  it("names each place a preview cuts short, with the rows shown and held", () => {
    expect(
      truncationNotice([
        { placeName: "Depot", shown: 50, total: 120 },
        { placeName: "Yard", shown: 50, total: 60 },
      ]),
    ).toBe(
      "Preview truncated: Depot shows 50 of 120 rows · Yard shows 50 of 60 rows",
    );
  });

  it("says nothing when every place shows all its rows", () => {
    expect(truncationNotice([])).toBeNull();
  });
});
