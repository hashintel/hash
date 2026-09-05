import { describe, expect, it } from "vitest";

import { hintLabels, matchHint } from "./hint-jump";

describe("hintLabels", () => {
  it("uses single letters while they suffice", () => {
    expect(hintLabels(3)).toEqual(["a", "s", "d"]);
    expect(hintLabels(9)).toHaveLength(9);
    expect(new Set(hintLabels(9)).size).toBe(9);
  });

  it("switches every label to pairs when singles run out", () => {
    const labels = hintLabels(12);
    expect(labels).toHaveLength(12);
    expect(labels.every((label) => label.length === 2)).toBe(true);
    expect(new Set(labels).size).toBe(12);
  });

  it("never makes one label a prefix of another", () => {
    for (const count of [5, 9, 10, 40, 81]) {
      const labels = hintLabels(count);
      for (const label of labels) {
        expect(labels.filter((other) => other.startsWith(label))).toHaveLength(
          1,
        );
      }
    }
  });
});

describe("matchHint", () => {
  it("matches a complete single-letter label", () => {
    expect(matchHint("s", 3)).toEqual({ kind: "match", index: 1 });
  });

  it("stays pending on a valid pair prefix", () => {
    expect(matchHint("a", 12)).toEqual({ kind: "pending" });
    expect(matchHint("as", 12)).toEqual({ kind: "match", index: 1 });
  });

  it("reports a dead end for characters no label starts with", () => {
    expect(matchHint("z", 12)).toEqual({ kind: "none" });
    expect(matchHint("az", 12)).toEqual({ kind: "none" });
  });
});
