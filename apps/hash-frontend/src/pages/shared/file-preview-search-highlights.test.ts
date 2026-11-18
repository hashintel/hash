// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { createHitRange } from "./file-preview-search-highlights";

const createElement = (html: string) => {
  const element = document.createElement("span");
  element.innerHTML = html;
  return element;
};

describe("createHitRange", () => {
  it("counts offsets across the text nodes of nested elements", () => {
    const element = createElement("A <b>quo</b>kka lives");

    const range = createHitRange(
      { element, offset: 2 },
      { element, offset: 8 },
    );

    expect(range.toString()).toBe("quokka");
  });

  it("spans two elements", () => {
    const paragraph = createElement("<b>da</b><i>ta</i>");
    const [bold, italic] = paragraph.children;
    if (!bold || !italic) {
      throw new Error("The paragraph should hold two elements");
    }

    const range = createHitRange(
      { element: bold, offset: 0 },
      { element: italic, offset: 2 },
    );

    expect(range.toString()).toBe("data");
  });

  it("treats an offset past the end of the text as its end", () => {
    const element = createElement("quokka");

    const range = createHitRange(
      { element, offset: 3 },
      { element, offset: 99 },
    );

    expect(range.toString()).toBe("kka");
  });

  it("returns an empty range in an element without text", () => {
    const element = createElement("<br>");

    const range = createHitRange(
      { element, offset: 0 },
      { element, offset: 4 },
    );

    expect(range.collapsed).toBe(true);
  });
});
