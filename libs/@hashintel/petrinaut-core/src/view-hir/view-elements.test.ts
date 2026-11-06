import { describe, expect, it } from "vitest";

import { isSafeViewValue } from "./view-elements";

describe("isSafeViewValue", () => {
  it.for([
    // paint, colour and length values
    "#2196f3",
    "red",
    "none",
    "currentColor",
    "100%",
    "4px",
    "0.5",
    "rgb(33 150 243 / 50%)",
    "rgba(0, 0, 0, 0.5)",
    "hsla(210, 50%, 40%, 0.8)",
    "oklch(70% 0.1 200)",
    "color-mix(in srgb, red 40%, blue)",
    "1px solid rgba(0, 0, 0, 0.1)",
    // gradients
    "linear-gradient(90deg, #fff 0%, rgba(0, 0, 0, 0.5) 100%)",
    "repeating-radial-gradient(circle at 50% 50%, red, blue 10px)",
    "conic-gradient(from 90deg, red, blue)",
    // basic shapes on SVG's clipPath attribute
    "circle(50%)",
    "ellipse(40% 30%)",
    "inset(10%)",
    "polygon(0 0, 100% 0, 50% 100%)",
    'path("M0,0 L10,10 Z")',
    "rect(0 10px 10px 0)",
    "xywh(0 0 10px 10px)",
    // transforms, in CSS and in SVG's attribute syntax
    "translate(10px, 20px) rotate(45deg) scale(1.5)",
    "rotate(45 5 5)",
    "matrix(1 0 0 1 0 0)",
    "translateX(-50%)",
    // math, substitution and timing
    "calc(100% - 4px)",
    "clamp(1rem, 2vw, 3rem)",
    "var(--colors-gray-50)",
    "var(--accent, #ff5722)",
    "opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
    // text
    '"Helvetica Neue", Arial, sans-serif',
    "'Inter', system-ui",
    "https://example.com is just text",
    // path data, points, view boxes
    "M0,0 L10,10 Z",
    "0 0, 8 4, 0 8",
    "0 0 800 600",
    // fragment references to this picture
    "url(#arrow)",
    "url( #arrow )",
    "URL(#arrow)",
    "url(#gradient) red",
    String.raw`u\72l(#arrow)`,
  ])("accepts %s", (value, { expect: expectValue }) => {
    expectValue(isSafeViewValue(value)).toBe(true);
  });

  it.for([
    // url(), in every spelling a browser accepts
    "url(https://x.invalid/a)",
    "url( https://x.invalid/a )",
    'url("https://x.invalid/a")',
    "url('//x.invalid/a')",
    "url(a.png)",
    "URL(https://x.invalid/a)",
    "url(#arrow) url(https://x.invalid/a)",
    // CSS escapes resolve to the name the browser sees
    String.raw`u\72l("https://x.invalid/a")`,
    String.raw`u\72l(https://x.invalid/a)`,
    String.raw`\75 rl(https://x.invalid/a)`,
    String.raw`image\-set("https://x.invalid/a" 1x)`,
    String.raw`\69mage-set("https://x.invalid/a" 1x)`,
    // functions that load images, plain, prefixed and nested
    'image-set("https://x.invalid/a" 1x)',
    'IMAGE-SET("https://x.invalid/a" 1x)',
    "image-set(url(https://x.invalid/a) 1x)",
    'image-set(/**/"https://x.invalid/a" 1x)',
    '-webkit-image-set("https://x.invalid/a" 1x)',
    "-webkit-image-set(url(https://x.invalid/a) 1x)",
    'linear-gradient(red, blue), image-set("https://x.invalid/a" 1x)',
    'image-set(linear-gradient(red, blue) 1x, "https://x.invalid/a" 2x)',
    'image("https://x.invalid/a")',
    "cross-fade(url(https://x.invalid/a) 50%, red)",
    'src("https://x.invalid/a")',
    "element(#arrow)",
    "paint(worklet)",
    // substitutions cannot smuggle one in
    "var(--a, url(https://x.invalid/a))",
    'calc(1px + var(--a, image-set("https://x.invalid/a" 1x)))',
    "attr(id)",
    // preserve the original unquoted-only fragment syntax
    'url("#arrow")',
    'url("#arrow" "https://x.invalid/a")',
    // values the tokenizer would have to repair
    'url("https://x.invalid/a',
    "url(https://x.invalid/a",
    "url(#a b)",
    'image-set("https://x.invalid/a',
    '"unterminated string, then f(x)',
    // function names outside the allowlist
    "f(x)",
    "ur/**/l(https://x.invalid/a)",
  ])("refuses %s", (value, { expect: expectValue }) => {
    expectValue(isSafeViewValue(value)).toBe(false);
  });

  it("checks every nested function, however deep", () => {
    const nested = `${"calc(".repeat(50)}image-set("https://x.invalid/a" 1x)${")".repeat(50)}`;
    expect(isSafeViewValue(nested)).toBe(false);
    expect(isSafeViewValue(`${"calc(".repeat(50)}1px${")".repeat(50)}`)).toBe(
      true,
    );
  });
});
