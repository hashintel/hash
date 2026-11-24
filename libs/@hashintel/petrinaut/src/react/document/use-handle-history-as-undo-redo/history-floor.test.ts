import { describe, expect, it } from "vitest";

import { historyFloor, markCurrentEntry } from "./history-floor";

import type { PetrinautHistory } from "@hashintel/petrinaut-core";

const entriesAt = (...timestamps: string[]) =>
  timestamps.map((timestamp) => ({ timestamp }));

const markAt = (timestamps: string[], currentIndex: number) =>
  markCurrentEntry({
    entries: { get: () => entriesAt(...timestamps) },
    currentIndex: { get: () => currentIndex },
  } as unknown as PetrinautHistory);

describe("historyFloor", () => {
  it("is the start of the history with no mark", () => {
    expect(historyFloor(entriesAt("t0", "t1"), null)).toBe(0);
  });

  it("finds the marked entry where it is", () => {
    const mark = markAt(["t0", "t1", "t2"], 1);

    expect(historyFloor(entriesAt("t0", "t1", "t2", "t3"), mark)).toBe(1);
  });

  it("follows the entry down as older ones are dropped", () => {
    const mark = markAt(["t0", "t1", "t2"], 2);

    expect(historyFloor(entriesAt("t1", "t2", "t3"), mark)).toBe(1);
    expect(historyFloor(entriesAt("t2", "t3", "t4"), mark)).toBe(0);
  });

  it("is the start of what is left once the entry is dropped", () => {
    const mark = markAt(["t0", "t1"], 1);

    expect(historyFloor(entriesAt("t2", "t3"), mark)).toBe(0);
  });

  it("tells apart entries made in the same millisecond", () => {
    // Three changes in one burst, the history at the second of them.
    const mark = markAt(["t0", "t1", "t1", "t1"], 2);

    expect(historyFloor(entriesAt("t0", "t1", "t1", "t1"), mark)).toBe(2);
    // The entry after it is replaced by a later change.
    expect(historyFloor(entriesAt("t0", "t1", "t1", "t2"), mark)).toBe(2);
  });

  it("errs after the mark, never before, when its burst is cut short", () => {
    const mark = markAt(["t1", "t1", "t2"], 1);

    // The first of the burst is dropped: the marked entry is the oldest left.
    expect(historyFloor(entriesAt("t1", "t2", "t3"), mark)).toBe(0);

    // With a later entry of the burst still there, the two cannot be told
    // apart, and the later one is taken.
    const inside = markAt(["t1", "t1", "t1"], 1);
    expect(historyFloor(entriesAt("t1", "t1", "t2"), inside)).toBe(1);
  });
});
