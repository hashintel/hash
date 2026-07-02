import { describe, expect, it } from "vitest";

import { ReadonlySortedSet } from "./readonly-sorted-set";

const numericCmp = (a: number, b: number) => a - b;

const setOf = (...values: number[]) =>
  new ReadonlySortedSet(values, numericCmp);

describe("ReadonlySortedSet", () => {
  describe("isSubsetOf", () => {
    it("empty is a subset of everything", () => {
      expect(setOf().isSubsetOf(setOf(1, 2, 3))).toBe(true);
    });

    it("empty is a subset of empty", () => {
      expect(setOf().isSubsetOf(setOf())).toBe(true);
    });

    it("equal sets are subsets of each other", () => {
      expect(setOf(1, 2, 3).isSubsetOf(setOf(1, 2, 3))).toBe(true);
    });

    it("proper subset with gaps in the superset", () => {
      expect(setOf(1, 3, 5).isSubsetOf(setOf(1, 2, 3, 4, 5, 6))).toBe(true);
    });

    it("single element present", () => {
      expect(setOf(3).isSubsetOf(setOf(1, 2, 3, 4))).toBe(true);
    });

    it("single element missing", () => {
      expect(setOf(7).isSubsetOf(setOf(1, 2, 3, 4))).toBe(false);
    });

    it("rejects when one element is missing", () => {
      expect(setOf(1, 2, 3).isSubsetOf(setOf(1, 3))).toBe(false);
    });

    it("rejects a superset", () => {
      expect(setOf(1, 2, 3).isSubsetOf(setOf(1, 2))).toBe(false);
    });

    it("rejects disjoint sets", () => {
      expect(setOf(1, 2).isSubsetOf(setOf(3, 4))).toBe(false);
    });

    it("handles duplicates in input (deduped by constructor)", () => {
      expect(setOf(1, 1, 2, 2).isSubsetOf(setOf(1, 2, 3))).toBe(true);
    });
  });
});
