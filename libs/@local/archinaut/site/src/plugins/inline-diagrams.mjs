/**
 * Inlines the bundle's rendered diagrams into the page instead of leaving them
 * as `<img>`.
 *
 * The bundle emits every diagram as a plain markdown image, which keeps it
 * portable: any host can render it with no toolchain of its own. The cost is
 * that an SVG behind an `<img>` is a separate document, so nothing on the page
 * reaches it — not this site's palette, not its custom properties, not the
 * theme it is currently set to. Inlining the same file hands it all three.
 *
 * The generator writes each diagram's colours as `var(--pnd-diagram-*, <the
 * colour d2 drew>)`, so a host that does none of this still gets the diagram it
 * always got. `chrome.css` is what defines those properties here.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { fromHtml } from "hast-util-from-html";
import { visit } from "unist-util-visit";

/**
 * Diagrams live beside the pages, under the bundle's own directory.
 *
 * @param {unknown} src
 * @returns {src is string}
 */
const isDiagram = (src) =>
  typeof src === "string" && src.endsWith(".svg") && src.includes("diagrams/");

/**
 * @returns {(tree: import("hast").Root, file: import("vfile").VFile) => void}
 */
export const rehypeInlineDiagrams = () => (tree, file) => {
  if (typeof file.path !== "string") {
    return;
  }

  const pageDirectory = dirname(file.path);

  visit(tree, "element", (node, index, parent) => {
    const src = node.properties?.["src"];

    if (
      node.tagName !== "img" ||
      parent === undefined ||
      index === undefined ||
      !isDiagram(src)
    ) {
      return;
    }

    const path = resolve(pageDirectory, src);

    let markup;

    try {
      markup = readFileSync(path, "utf8");
    } catch {
      // A page referencing a diagram the bundle did not render is the
      // generator's problem to report; leaving the `<img>` alone keeps the
      // broken reference visible rather than swallowing it.
      return;
    }

    const parsed = fromHtml(markup, { space: "svg", fragment: true });
    const svg = parsed.children.find(
      /** @returns {child is import("hast").Element} */
      (child) => child.type === "element" && child.tagName === "svg",
    );

    if (svg === undefined) {
      return;
    }

    const alt = node.properties?.["alt"];

    // The alt text was the image's accessible name, so it has to become the
    // inline element's; without a role an <svg> is not exposed as an image.
    svg.properties = {
      ...svg.properties,
      class: "pnd-diagram",
      role: "img",
      ...(typeof alt === "string" && alt !== "" ? { "aria-label": alt } : {}),
    };

    parent.children[index] = svg;
  });
};
