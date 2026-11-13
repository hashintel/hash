import { maxSubnetIconLength } from "@hashintel/petrinaut-core";

/** A length given in user units, a bare number or one in `px`; 0 for any other. */
const userUnits = (length: string | null): number =>
  Number(/^\s*(\d*\.?\d+)(?:px)?\s*$/.exec(length ?? "")?.[1] ?? 0);

/**
 * A CSS image of `markup`, to paint as a mask, or `null` when the markup is
 * not SVG, or is longer than an icon may be. The image fills the box that
 * draws it and keeps the icon's proportions: a missing `viewBox` is taken
 * from a width and height given in user units, and the fixed size goes.
 *
 * A mask image is fetched as an image, so nothing in the markup runs or
 * loads, whatever it holds: nothing here filters it.
 */
export const iconMaskImage = (markup: string): string | null => {
  if (markup.length > maxSubnetIconLength) {
    return null;
  }
  // Read into a detached document. The HTML parser takes a standalone SVG
  // file as well as an inline `<svg>` copied out of a page.
  const root = new DOMParser()
    .parseFromString(markup, "text/html")
    .body.querySelector("svg");
  if (!root) {
    return null;
  }
  if (!root.hasAttribute("viewBox")) {
    const width = userUnits(root.getAttribute("width"));
    const height = userUnits(root.getAttribute("height"));
    if (width > 0 && height > 0) {
      root.setAttribute("viewBox", `0 0 ${width} ${height}`);
    }
  }
  root.removeAttribute("width");
  root.removeAttribute("height");
  const svg = new XMLSerializer().serializeToString(root);
  try {
    return `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}")`;
  } catch {
    // Half of a surrogate pair on its own has no encoding.
    return null;
  }
};
