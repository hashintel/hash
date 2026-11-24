/**
 * Readies a docs page's stepped parts to play themselves. Each top-level
 * block that names a step, outside a `Steps` block, is wrapped in one of its
 * own: a stepped drawing, a formula with `\step`, a paragraph with a
 * reveal. Each `Steps` block then gets `count`, the number of steps it
 * has: the highest step anything in it names, plus one, as
 * `step-markers.mjs` lists them. A `Steps` block inside another counts
 * towards the outer one and adds nothing of its own.
 *
 * A fenced d2 block on a docs page is code, not a drawing; drawings come
 * from the bundle as images. Slides are left alone: `slide-metadata.mjs`
 * counts theirs.
 */

import { SKIP, visit } from "unist-util-visit";

import { numberAttribute } from "./mdx-jsx.mjs";
import {
  drawingsBeside,
  literalAttribute,
  markInlineReveals,
  stepsNamedIn,
} from "./step-markers.mjs";

/** @param {import("unist").Node} node */
const isSteps = (node) =>
  (node.type === "mdxJsxFlowElement" || node.type === "mdxJsxTextElement") &&
  "name" in node &&
  node.name === "Steps";

/**
 * @param {{ docsDirectory: string, diagramsDirectory?: string }} options
 * @returns {(tree: import("mdast").Root, file: import("vfile").VFile) => void}
 */
export const remarkDocSteps =
  ({ docsDirectory, diagramsDirectory }) =>
  (tree, file) => {
    if (typeof file.path !== "string" || !file.path.startsWith(docsDirectory)) {
      return;
    }
    const path = file.path;
    const where = (node) => `${path}:${node.position?.start.line ?? "?"}`;
    const options = {
      drawingAt: drawingsBeside(path, diagramsDirectory),
      where,
      d2Blocks: false,
    };
    /** The steps `node` names; a reveal whose step is not a literal fails the page. */
    const stepsOf = (node) => {
      const { named, unreadable } = stepsNamedIn(node, options);
      if (unreadable.length > 0) {
        throw new Error(
          `the steps on a docs page are counted from number literals:\n${unreadable.join("\n")}`,
        );
      }
      return named;
    };

    markInlineReveals(tree);
    tree.children = tree.children.map((child) =>
      isSteps(child) || stepsOf(child).length === 0
        ? child
        : /** @type {never} */ ({
            type: "mdxJsxFlowElement",
            name: "Steps",
            attributes: [],
            children: [child],
            position: child.position,
          }),
    );
    visit(tree, (node) => {
      if (!isSteps(node)) {
        return;
      }
      const written = literalAttribute(node, "count");
      const count = Math.max(
        written ?? 1,
        ...stepsOf(node).map((step) => step + 1),
      );
      node.attributes = [
        ...node.attributes.filter((attribute) => attribute.name !== "count"),
        numberAttribute("count", count),
      ];
      return SKIP;
    });
  };
