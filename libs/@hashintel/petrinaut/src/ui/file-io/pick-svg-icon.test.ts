/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";

import { maxSubnetIconLength } from "@hashintel/petrinaut-core";

import { readIconFile, readIconMarkup } from "./pick-svg-icon";

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

describe("readIconFile", () => {
  const icon = '<svg viewBox="0 0 8 8"><circle r="3"/></svg>';

  it("reads a file's text as an icon", async () => {
    await expect(
      readIconFile({ size: icon.length, text: () => Promise.resolve(icon) }),
    ).resolves.toEqual({ ok: true, iconSvg: icon });
  });

  it("refuses a file that cannot fit without reading it", async () => {
    const text = vi.fn(() => Promise.resolve(icon));

    const result = await readIconFile({
      size: 3 * maxSubnetIconLength + 1,
      text,
    });

    expect(result.ok ? "" : result.error).toContain("too large");
    expect(text).not.toHaveBeenCalled();
  });

  it("says so when the file cannot be read", async () => {
    await expect(
      readIconFile({
        size: icon.length,
        text: () => Promise.reject(new Error("gone")),
      }),
    ).resolves.toEqual({ ok: false, error: "Failed to read file" });
  });
});
