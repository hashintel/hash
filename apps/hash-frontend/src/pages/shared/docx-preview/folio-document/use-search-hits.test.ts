// @vitest-environment jsdom
import { hashFolioAIBlockText } from "@stll/folio-react";
import { describe, expect, it } from "vitest";

import { createPaintedHitRanges, findSearchHits } from "./use-search-hits";

const textRange = (blockId: string, startOffset: number, text: string) => ({
  type: "textRange",
  story: "main",
  blockId,
  startOffset,
  endOffset: startOffset + text.length,
  selectedTextHash: hashFolioAIBlockText(text),
});

describe("findSearchHits", () => {
  it("finds every occurrence in every block", () => {
    const blocks = [
      { id: "first", kind: "heading", text: "Lease and lease terms" },
      { id: "second", kind: "paragraph", text: "The lease ends" },
    ] as const;

    expect(findSearchHits(blocks, "lease", false)).toEqual([
      textRange("first", 10, "lease"),
      textRange("second", 4, "lease"),
    ]);
  });

  it("matches other cases only when told to ignore case", () => {
    const blocks = [{ id: "only", kind: "paragraph", text: "Lease" }] as const;

    expect(findSearchHits(blocks, "lease", false)).toEqual([]);
    expect(findSearchHits(blocks, "lease", true)).toEqual([
      textRange("only", 0, "Lease"),
    ]);
  });

  it("treats the search text literally", () => {
    const blocks = [
      { id: "only", kind: "paragraph", text: "abc a.c" },
    ] as const;

    expect(findSearchHits(blocks, "a.c", false)).toEqual([
      textRange("only", 4, "a.c"),
    ]);
  });

  it("skips diagnostic blocks", () => {
    const blocks = [
      { id: "note", kind: "diagnostic", text: "lease" },
      { id: "body", kind: "listItem", text: "lease" },
    ] as const;

    expect(findSearchHits(blocks, "lease", false)).toEqual([
      textRange("body", 0, "lease"),
    ]);
  });
});

/**
 * Two painted pages as folio draws them. The second page's "data" is split
 * over a bold and a plain run, and the first page's header repeats text
 * outside `.layout-page-content`.
 */
const createPaintedPages = () => {
  const container = document.createElement("div");
  container.innerHTML = [
    '<div class="layout-page">',
    '<div class="layout-page-header"><span data-pm-start="1" data-pm-end="6">Lease</span></div>',
    '<div class="layout-page-content"><span data-pm-start="1" data-pm-end="15">Lease and data</span></div>',
    "</div>",
    '<div class="layout-page"><div class="layout-page-content">',
    '<span data-pm-start="17" data-pm-end="21">The </span>',
    '<span data-pm-start="21" data-pm-end="23"><b>da</b></span>',
    '<span data-pm-start="23" data-pm-end="30">ta ends</span>',
    "</div></div>",
  ].join("");
  return container;
};

describe("createPaintedHitRanges", () => {
  it("covers the painted text of each hit", () => {
    const ranges = createPaintedHitRanges(createPaintedPages(), [
      { from: 1, to: 6 },
      { from: 11, to: 15 },
      { from: 21, to: 25 },
    ]);

    expect(ranges.map((range) => range?.toString())).toEqual([
      "Lease",
      "data",
      "data",
    ]);
  });

  it("gives no range to a hit that is not painted or not resolved", () => {
    expect(
      createPaintedHitRanges(createPaintedPages(), [
        { from: 40, to: 44 },
        null,
      ]),
    ).toEqual([null, null]);
  });
});
