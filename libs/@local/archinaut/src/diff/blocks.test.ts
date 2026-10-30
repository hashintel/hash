import { describe, expect, it } from "vitest";

import { diffBlocks, splitBlocks } from "./blocks";

/**
 * Splitting decides where a marker may legally be inserted, so the cases that
 * matter are the ones where a naive blank-line split would land a marker
 * inside a construct: a fenced code block with blank lines, a JSX element with
 * markdown children. Either would fail the consuming site's MDX compile.
 */
describe("splitBlocks", () => {
  it("splits on blank lines", () => {
    expect(splitBlocks("one\n\ntwo\n\n\nthree\n")).toEqual([
      "one",
      "two",
      "three",
    ]);
  });

  it("keeps a fenced code block with blank lines as one block", () => {
    const body = "before\n\n```ts\nconst a = 1;\n\nconst b = 2;\n```\n\nafter";
    expect(splitBlocks(body)).toEqual([
      "before",
      "```ts\nconst a = 1;\n\nconst b = 2;\n```",
      "after",
    ]);
  });

  it("keeps a JSX element with blank-lined children as one block", () => {
    const body =
      "<Sequence>\n\nSome **markdown** inside.\n\n</Sequence>\n\nafter";
    expect(splitBlocks(body)).toEqual([
      "<Sequence>\n\nSome **markdown** inside.\n\n</Sequence>",
      "after",
    ]);
  });

  it("treats a multi-line self-closing element as one closed block", () => {
    const body = '<LayerFacts\n  files={3}\n  layerId={"core"}\n/>\n\nafter';
    expect(splitBlocks(body)).toEqual([
      '<LayerFacts\n  files={3}\n  layerId={"core"}\n/>',
      "after",
    ]);
  });

  it("does not merge on JSX mentioned in inline code", () => {
    const body = "Use `<Sequence>` for timelines.\n\nafter";
    expect(splitBlocks(body)).toEqual([
      "Use `<Sequence>` for timelines.",
      "after",
    ]);
  });
});

const identity = (block: string): string => block;

describe("diffBlocks", () => {
  it("reports nothing on equal blocks", () => {
    const diff = diffBlocks({
      baseBlocks: ["a", "b"],
      headBlocks: ["a", "b"],
      normalize: identity,
    });

    expect(diff.headStatuses).toEqual(["unchanged", "unchanged"]);
    expect(diff.removed.size).toBe(0);
  });

  it("marks an inserted block added", () => {
    const diff = diffBlocks({
      baseBlocks: ["a", "c"],
      headBlocks: ["a", "b", "c"],
      normalize: identity,
    });

    expect(diff.headStatuses).toEqual(["unchanged", "added", "unchanged"]);
    expect(diff.removed.size).toBe(0);
  });

  it("records a removed block at the head position it preceded", () => {
    const diff = diffBlocks({
      baseBlocks: ["a", "b", "c"],
      headBlocks: ["a", "c"],
      normalize: identity,
    });

    expect(diff.headStatuses).toEqual(["unchanged", "unchanged"]);
    expect(diff.removed).toEqual(new Map([[1, ["b"]]]));
  });

  it("records a run removed from the end after the last head block", () => {
    const diff = diffBlocks({
      baseBlocks: ["a", "b", "c"],
      headBlocks: ["a"],
      normalize: identity,
    });

    expect(diff.removed).toEqual(new Map([[1, ["b", "c"]]]));
  });

  it("pairs a replaced block as changed rather than removed plus added", () => {
    const diff = diffBlocks({
      baseBlocks: ["a", "old", "c"],
      headBlocks: ["a", "new", "c"],
      normalize: identity,
    });

    expect(diff.headStatuses).toEqual(["unchanged", "changed", "unchanged"]);
    expect(diff.removed.size).toBe(0);
  });

  it("splits an uneven replace run into changed, added and removed", () => {
    const grew = diffBlocks({
      baseBlocks: ["a", "old", "z"],
      headBlocks: ["a", "new-1", "new-2", "z"],
      normalize: identity,
    });
    expect(grew.headStatuses).toEqual([
      "unchanged",
      "changed",
      "added",
      "unchanged",
    ]);

    const shrank = diffBlocks({
      baseBlocks: ["a", "old-1", "old-2", "z"],
      headBlocks: ["a", "new", "z"],
      normalize: identity,
    });
    expect(shrank.headStatuses).toEqual(["unchanged", "changed", "unchanged"]);
    expect(shrank.removed).toEqual(new Map([[2, ["old-2"]]]));
  });

  it("compares normalized forms but reports raw base blocks", () => {
    const diff = diffBlocks({
      baseBlocks: ["count 1", "gone 1"],
      headBlocks: ["count 2"],
      normalize: (block) => (block.startsWith("count") ? "count N" : block),
    });

    expect(diff.headStatuses).toEqual(["unchanged"]);
    expect(diff.removed).toEqual(new Map([[1, ["gone 1"]]]));
  });
});
