/**
 * BitSet tests, focused on the scratch-reuse contract (`clear`) that the
 * render-side planners lean on.
 */
import { describe, expect, it } from "vitest";

import { BitSet } from "./bitset";

describe("BitSet clear", () => {
  it("removes every member and resets cardinality", () => {
    const set = BitSet.empty<number>(64);
    set.add(0);
    set.add(31);
    set.add(63);
    expect(set.cardinality).toBe(3);

    set.clear();

    expect(set.cardinality).toBe(0);
    expect(set.has(0)).toBe(false);
    expect(set.has(31)).toBe(false);
    expect(set.has(63)).toBe(false);
    expect([...set.members()]).toEqual([]);
  });

  it("keeps the word storage for allocation-free reuse", () => {
    const set = BitSet.empty<number>(64);
    set.add(40);
    const wordsBefore = set.words;

    set.clear();
    set.add(7);

    expect(set.words).toBe(wordsBefore);
    expect(set.has(7)).toBe(true);
    expect(set.cardinality).toBe(1);
  });
});
