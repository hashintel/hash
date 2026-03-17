import { describe, expect, it } from "vitest";

import { deduplicateName } from "./deduplicate-name";

describe("deduplicateName", () => {
  it("returns the original name when no conflict exists", () => {
    expect(deduplicateName("Place1", new Set())).toBe("Place1");
  });

  it("returns the original name when existing names are unrelated", () => {
    expect(deduplicateName("Place1", new Set(["Foo", "Bar"]))).toBe("Place1");
  });

  it("appends '2' when a name without a numeric suffix conflicts", () => {
    expect(deduplicateName("Foo", new Set(["Foo"]))).toBe("Foo2");
  });

  it("increments the numeric suffix when a numbered name conflicts", () => {
    expect(deduplicateName("Place1", new Set(["Place1"]))).toBe("Place2");
  });

  it("skips over existing suffixes to find the next available number", () => {
    expect(
      deduplicateName("Place1", new Set(["Place1", "Place2", "Place3"])),
    ).toBe("Place4");
  });

  it("handles gaps in the numeric sequence", () => {
    expect(
      deduplicateName("Place1", new Set(["Place1", "Place2", "Place4"])),
    ).toBe("Place3");
  });

  it("handles a name that ends with a large number", () => {
    expect(deduplicateName("Item99", new Set(["Item99"]))).toBe("Item100");
  });

  it("appends suffix to a name without trailing digits when conflicting", () => {
    expect(deduplicateName("MyTransition", new Set(["MyTransition"]))).toBe(
      "MyTransition2",
    );
  });

  it("skips existing suffixed names for non-numeric base names", () => {
    expect(
      deduplicateName(
        "MyTransition",
        new Set(["MyTransition", "MyTransition2", "MyTransition3"]),
      ),
    ).toBe("MyTransition4");
  });

  it("handles consecutive pastes of the same item", () => {
    const existing = new Set(["Place1"]);

    const first = deduplicateName("Place1", existing);
    expect(first).toBe("Place2");
    existing.add(first);

    const second = deduplicateName("Place1", existing);
    expect(second).toBe("Place3");
    existing.add(second);

    const third = deduplicateName("Place1", existing);
    expect(third).toBe("Place4");
  });

  it("treats multi-digit suffixes correctly", () => {
    expect(deduplicateName("Node10", new Set(["Node10"]))).toBe("Node11");
  });

  it("does not confuse numbers in the middle of a name", () => {
    // "Type2Color" ends with "olor" not a digit, so suffix starts at 2
    expect(deduplicateName("Type2Color", new Set(["Type2Color"]))).toBe(
      "Type2Color2",
    );
  });
});
