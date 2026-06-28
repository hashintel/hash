import { describe, expect, it } from "vitest";

import {
  applyReadOps,
  buildStatuses,
  coalesceReadOps,
  mergeReadKeySets,
} from "./read-state";

import type { ReadOp } from "./read-state";

describe("applyReadOps", () => {
  it("merges adds and removes onto the server base", () => {
    const next = applyReadOps(
      ["a", "b"],
      new Map<string, ReadOp>([
        ["b", "remove"],
        ["c", "add"],
      ]),
    );
    expect(next.sort()).toEqual(["a", "c"]);
  });

  it("does not duplicate keys already present on the server", () => {
    const next = applyReadOps(["a"], new Map<string, ReadOp>([["a", "add"]]));
    expect(next).toEqual(["a"]);
  });

  it("ignores removes for keys not present", () => {
    const next = applyReadOps([], new Map<string, ReadOp>([["x", "remove"]]));
    expect(next).toEqual([]);
  });

  it("preserves server keys not referenced by any op (merge on refetch)", () => {
    const next = applyReadOps(
      ["server-only"],
      new Map<string, ReadOp>([["local", "add"]]),
    );
    expect(next.sort()).toEqual(["local", "server-only"]);
  });
});

describe("coalesceReadOps (rapid toggle ordering)", () => {
  it("keeps only the last intent per key", () => {
    const coalesced = coalesceReadOps([
      ["k", "add"],
      ["k", "remove"],
      ["k", "add"],
    ]);
    expect(coalesced.get("k")).toBe("add");
    expect(applyReadOps([], coalesced)).toEqual(["k"]);
  });

  it("resolves a rapid read-then-unread to unread", () => {
    const coalesced = coalesceReadOps([
      ["k", "add"],
      ["k", "remove"],
    ]);
    expect(applyReadOps(["k"], coalesced)).toEqual([]);
  });

  it("coalesces independent keys without interference", () => {
    const coalesced = coalesceReadOps([
      ["a", "add"],
      ["b", "add"],
      ["a", "remove"],
    ]);
    expect(applyReadOps([], coalesced).sort()).toEqual(["b"]);
  });
});

describe("buildStatuses", () => {
  it("maps each read scope key to a read status", () => {
    expect(buildStatuses(["a", "b"])).toEqual({
      a: { read: true },
      b: { read: true },
    });
  });

  it("returns an empty map for no keys", () => {
    expect(buildStatuses([])).toEqual({});
  });
});

describe("mergeReadKeySets", () => {
  it("merges duplicate preference entity read keys", () => {
    expect(
      mergeReadKeySets([
        ["a", "b"],
        ["b", "c"],
      ]),
    ).toEqual(["a", "b", "c"]);
  });
});
