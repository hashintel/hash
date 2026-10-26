import { describe, expect, it, vi } from "vitest";

import { searchDocument, showSearchHit, toSearchResult } from "./search-hits";

import type { FindResult } from "@stll/folio-react";

/** Stands in for folio's find API over a document with `hitCount` hits. */
const createFolioFind = (hitCount: number) => {
  let result: FindResult | null = null;

  const step = (by: number) => {
    if (result) {
      result = {
        ...result,
        currentIndex: (result.currentIndex + by + hitCount) % hitCount,
      };
    }
    return null;
  };

  return {
    find: vi.fn(() => {
      result = { matches: [], totalCount: hitCount, currentIndex: 0 };
      return result;
    }),
    findNext: vi.fn(() => step(1)),
    findPrevious: vi.fn(() => step(-1)),
    getFindResult: () => result,
    clearFind: vi.fn(() => {
      result = null;
    }),
  };
};

describe("searchDocument", () => {
  it("matches case only when not told to ignore it", () => {
    const folioFind = createFolioFind(2);

    searchDocument(folioFind, "lease", true);
    searchDocument(folioFind, "Lease", false);

    expect(folioFind.find.mock.calls).toEqual([
      ["lease", { matchCase: false }],
      ["Lease", { matchCase: true }],
    ]);
  });

  it("clears the hits for empty text", () => {
    const folioFind = createFolioFind(2);

    searchDocument(folioFind, "lease", true);
    searchDocument(folioFind, "", true);

    expect(folioFind.clearFind).toHaveBeenCalledOnce();
    expect(folioFind.getFindResult()).toBeNull();
  });
});

describe("showSearchHit", () => {
  it("steps forward and back to the hit asked for", () => {
    const folioFind = createFolioFind(4);
    searchDocument(folioFind, "lease", true);

    showSearchHit(folioFind, 3);
    expect(folioFind.getFindResult()?.currentIndex).toBe(3);
    expect(folioFind.findNext).toHaveBeenCalledTimes(3);

    showSearchHit(folioFind, 1);
    expect(folioFind.getFindResult()?.currentIndex).toBe(1);
    expect(folioFind.findPrevious).toHaveBeenCalledTimes(2);
  });

  it("does nothing for the current hit or without a search", () => {
    const folioFind = createFolioFind(2);

    showSearchHit(folioFind, 1);
    searchDocument(folioFind, "lease", true);
    showSearchHit(folioFind, 0);

    expect(folioFind.findNext).not.toHaveBeenCalled();
    expect(folioFind.findPrevious).not.toHaveBeenCalled();
  });
});

describe("toSearchResult", () => {
  it("counts the hits and names the current one", () => {
    expect(
      toSearchResult({ matches: [], totalCount: 3, currentIndex: 2 }),
    ).toEqual({ hitCount: 3, currentHitIndex: 2 });
  });

  it("has no current hit without hits", () => {
    expect(toSearchResult(null)).toEqual({
      hitCount: 0,
      currentHitIndex: null,
    });
    expect(
      toSearchResult({ matches: [], totalCount: 0, currentIndex: 0 }),
    ).toEqual({ hitCount: 0, currentHitIndex: null });
  });
});
