/**
 * Reads SVG markup into a detached document, where nothing in it runs or
 * loads, and returns its `<svg>` root, or `null` when the markup has none.
 * The HTML parser takes a standalone SVG file as well as an inline `<svg>`
 * copied out of a page.
 */
const readSvgRoot = (markup: string): SVGElement | null => {
  const root = new DOMParser()
    .parseFromString(markup, "text/html")
    .body.querySelector("svg");
  return root instanceof SVGElement ? root : null;
};

/**
 * A CSS image of `markup`, to paint as a mask, or `null` when the markup is
 * not SVG. The image fills the box that draws it and keeps the icon's
 * proportions: a missing `viewBox` is taken from the width and height, and
 * the fixed size goes.
 *
 * A mask image is fetched as an image, so nothing in the markup runs or
 * loads, whatever it holds. Scripts and foreign content are dropped all the
 * same, since neither can draw.
 */
export const iconMaskImage = (markup: string): string | null => {
  const root = readSvgRoot(markup);
  if (!root) {
    return null;
  }
  for (const inert of root.querySelectorAll("script, foreignObject")) {
    inert.remove();
  }
  if (!root.hasAttribute("viewBox")) {
    const width = Number.parseFloat(root.getAttribute("width") ?? "");
    const height = Number.parseFloat(root.getAttribute("height") ?? "");
    if (width > 0 && height > 0) {
      root.setAttribute("viewBox", `0 0 ${width} ${height}`);
    }
  }
  root.removeAttribute("width");
  root.removeAttribute("height");
  const svg = new XMLSerializer().serializeToString(root);
  return `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}")`;
};
