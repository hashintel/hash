/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";

import { maxSubnetIconLength } from "@hashintel/petrinaut-core";

import { readIconMarkup } from "./pick-svg-icon";

describe("readIconMarkup", () => {
  it("takes an SVG file's text, trimmed", () => {
    expect(
      readIconMarkup('\n<svg viewBox="0 0 8 8"><circle r="3"/></svg>\n'),
    ).toEqual({
      ok: true,
      iconSvg: '<svg viewBox="0 0 8 8"><circle r="3"/></svg>',
    });
  });

  it("refuses a file that is not SVG", () => {
    expect(readIconMarkup("not an icon")).toEqual({
      ok: false,
      error: "That file is not an SVG.",
    });
  });

  it("refuses a file over the size an icon may have", () => {
    const result = readIconMarkup(
      `<svg>${"<g/>".repeat(maxSubnetIconLength / 4 + 1)}</svg>`,
    );

    expect(result).toMatchObject({ ok: false });
    expect(result.ok ? "" : result.error).toContain("too large");
  });
});
