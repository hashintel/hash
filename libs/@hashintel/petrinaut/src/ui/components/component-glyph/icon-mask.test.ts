/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";

import { iconMaskImage } from "./icon-mask";

const prefix = 'url("data:image/svg+xml;charset=utf-8,';

/** The SVG inside the CSS image, as text. */
const svgOf = (image: string | null): string => {
  if (!image?.startsWith(prefix)) {
    throw new Error(`not a data image: ${String(image)}`);
  }
  return decodeURIComponent(image.slice(prefix.length, -2));
};

describe("iconMaskImage", () => {
  it("turns SVG markup into an image that fills its box", () => {
    const svg = svgOf(
      iconMaskImage(
        '<svg width="24" height="24" viewBox="0 0 24 24"><path d="M4 4h16v16H4z"/></svg>',
      ),
    );

    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('viewBox="0 0 24 24"');
    expect(svg).toContain('d="M4 4h16v16H4z"');
    expect(svg).not.toMatch(/\s(width|height)=/);
  });

  it("takes a missing viewBox from the width and height", () => {
    const svg = svgOf(
      iconMaskImage(
        '<svg width="32" height="16"><rect width="32" height="16"/></svg>',
      ),
    );

    expect(svg).toContain('viewBox="0 0 32 16"');
  });

  it("reads a standalone file, prolog and all", () => {
    const svg = svgOf(
      iconMaskImage(
        '<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><circle cx="4" cy="4" r="3"/></svg>',
      ),
    );

    expect(svg).toContain("<circle");
  });

  it("drops what cannot draw", () => {
    const svg = svgOf(
      iconMaskImage(
        '<svg viewBox="0 0 8 8"><script>alert(1)</script><foreignObject><p>Hi</p></foreignObject><circle cx="4" cy="4" r="3"/></svg>',
      ),
    );

    expect(svg).not.toContain("script");
    expect(svg).not.toContain("foreignObject");
    expect(svg).toContain("<circle");
  });

  it("refuses markup with no svg in it", () => {
    expect(iconMaskImage("not an icon")).toBeNull();
    expect(iconMaskImage("<div><p>Hello</p></div>")).toBeNull();
  });
});
