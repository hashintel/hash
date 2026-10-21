import { hashFolioAIBlockText } from "@stll/folio-react";
import { describe, expect, it } from "vitest";

import { findSearchHits } from "./use-search-hits";

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
