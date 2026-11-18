// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { createHitRangesInTextLayer } from "./pdf-search";

import type { SearchHit } from "./pdf-search";

/**
 * A text layer as pdf.js draws it for "Page 1", an empty item, and a row with
 * leading spaces. The rows that end a line are followed by a `br`.
 */
const textLines = [{ str: "Page 1" }, { str: "" }, { str: "  A quokka" }];

const createTextLayer = () => {
  const textLayer = document.createElement("div");
  textLayer.innerHTML = [
    '<span role="presentation">Page 1</span>',
    '<br role="presentation">',
    '<br role="presentation">',
    '<span role="presentation">  A quokka</span>',
  ].join("");
  return textLayer;
};

/**
 * The search runs on the rows' trimmed text joined by spaces,
 * "Page 1  A quokka ", and its end position is inclusive.
 */
const searchHit = (
  start: SearchHit["start"],
  end: SearchHit["end"],
): SearchHit => ({ start, end, pageNumber: 1, indexInAllHits: 0 });

describe("createHitRangesInTextLayer", () => {
  it("skips the leading whitespace the search trimmed", () => {
    const [range] = createHitRangesInTextLayer(createTextLayer(), textLines, [
      searchHit(
        { rowIndex: 2, characterIndex: 2 },
        { rowIndex: 2, characterIndex: 7 },
      ),
    ]);

    expect(range?.toString()).toBe("quokka");
  });

  it("spans rows, past an item pdf.js draws no span for", () => {
    const [range] = createHitRangesInTextLayer(createTextLayer(), textLines, [
      searchHit(
        { rowIndex: 0, characterIndex: 5 },
        { rowIndex: 2, characterIndex: 0 },
      ),
    ]);

    expect(range?.toString()).toBe("1  A");
  });

  it("gives no range to a hit that starts on an item without text", () => {
    expect(
      createHitRangesInTextLayer(createTextLayer(), textLines, [
        searchHit(
          { rowIndex: 1, characterIndex: 0 },
          { rowIndex: 2, characterIndex: 0 },
        ),
      ]),
    ).toEqual([null]);
  });
});
