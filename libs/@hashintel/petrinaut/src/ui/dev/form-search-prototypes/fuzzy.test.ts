import { describe, expect, it } from "vitest";

import { buildSearchIndex } from "./search-index";
import { bottlingContext, bottlingState } from "./big-fixture";
import { fuzzyMatch, rankMatches } from "./fuzzy";

describe("fuzzyMatch", () => {
  it("matches ordered subsequences case-insensitively", () => {
    expect(fuzzyMatch("frate", "Fill Rate")).not.toBeNull();
    expect(fuzzyMatch("flr", "fill_rate")).not.toBeNull();
    expect(fuzzyMatch("xyz", "fill_rate")).toBeNull();
    expect(fuzzyMatch("etar", "fill_rate")).toBeNull();
  });

  it("returns the matched positions for highlighting", () => {
    const match = fuzzyMatch("fr", "Fill Rate")!;
    expect(match.positions).toEqual([0, 5]);
  });

  it("prefers word starts over embedded characters", () => {
    const wordStart = fuzzyMatch("wr", "Wash Rate")!;
    const embedded = fuzzyMatch("wr", "aluminium wrap")!;
    expect(wordStart.score).toBeGreaterThan(embedded.score);
  });

  it("prefers consecutive runs and shorter names", () => {
    const tight = fuzzyMatch("cap", "Cap Rate")!;
    const spread = fuzzyMatch("cap", "Crate Capacity Padding")!;
    expect(tight.score).toBeGreaterThan(spread.score);
  });

  it("matches across the › separator of place-scoped names", () => {
    expect(fuzzyMatch("fill time", "FillingLine › fill_time")).not.toBeNull();
  });

  it("empty query matches everything with score 0", () => {
    expect(fuzzyMatch("", "anything")).toEqual({ score: 0, positions: [] });
  });
});

describe("rankMatches", () => {
  const entries = ["Fill Rate", "Filler Cap", "Reject Ratio", "fill_rate"];

  it("sorts by score and drops non-matches", () => {
    const ranked = rankMatches("fira", entries, (entry) => entry);
    expect(ranked.length).toBeGreaterThan(0);
    expect(ranked[0]!.entry).toBe("Fill Rate");
    expect(ranked.every((result) => result.entry !== "Reject Ratio")).toBe(
      true,
    );
  });

  it("applies the limit", () => {
    expect(rankMatches("", entries, (entry) => entry, 2)).toHaveLength(2);
  });
});

describe("buildSearchIndex", () => {
  const index = buildSearchIndex(bottlingState, bottlingContext);

  it("indexes every kind with the form's aria-label conventions", () => {
    const byKind = (kind: string) =>
      index.filter((entry) => entry.kind === kind);
    expect(byKind("parameter")).toHaveLength(18);
    expect(byKind("variable")).toHaveLength(12);
    expect(byKind("place")).toHaveLength(12);
    expect(byKind("place variable").length).toBeGreaterThan(4);

    expect(
      index.find((entry) => entry.text === "Fill Rate")?.ariaLabel,
    ).toBe("Fill Rate");
    expect(
      index.find((entry) => entry.text === "EmptyBottles")?.ariaLabel,
    ).toBe("EmptyBottles place");
    expect(
      index.find((entry) => entry.text === "RejectedBottles")?.ariaLabel,
    ).toBe("RejectedBottles › count");
    expect(
      index.find((entry) => entry.text === "FillingLine › fill_time")
        ?.ariaLabel,
    ).toBe("FillingLine › fill_time");
  });

  it("shows overrides and defaults in the detail line", () => {
    expect(
      index.find((entry) => entry.text === "Fill Rate")?.detail,
    ).toContain("override");
    expect(
      index.find((entry) => entry.text === "Wash Rate")?.detail,
    ).toContain("default");
  });
});
