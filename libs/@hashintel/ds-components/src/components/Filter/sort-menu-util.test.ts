import { describe, expect, it } from "vitest";

import { defaultDirectionOf } from "./sort-menu-util";

describe("defaultDirectionOf", () => {
  it("starts a two-way sorter ascending unless it asks for the other direction", () => {
    expect(defaultDirectionOf({ name: "Name", sortKey: "name" })).toBe(
      "ASCENDING",
    );
    expect(
      defaultDirectionOf({
        name: "Created at",
        sortKey: "createdAt",
        defaultDirection: "DESCENDING",
      }),
    ).toBe("DESCENDING");
  });

  it("ignores a default direction the sorter does not offer", () => {
    expect(
      defaultDirectionOf({
        name: "Created at",
        sortKey: "createdAt",
        directionsAvailable: "ascending",
        defaultDirection: "DESCENDING",
      }),
    ).toBe("ASCENDING");
  });

  it("falls back to ascending for a sorter with no direction", () => {
    expect(
      defaultDirectionOf({
        name: "Relevance",
        sortKey: "relevance",
        directionsAvailable: "none",
        defaultDirection: "DESCENDING",
      }),
    ).toBe("ASCENDING");
  });
});
