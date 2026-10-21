/**
 * Exports a page's table of contents from its module: every `h2` and `h3`
 * with the id `rehype-slug` gave it, so the right-hand panel renders from
 * data the page itself carries, with no second parse.
 */

import { toString } from "hast-util-to-string";
import { visit } from "unist-util-visit";

/**
 * @typedef {{ depth: number; slug: string; text: string }} TocEntry
 */

/** @returns {(tree: import("hast").Root) => void} */
export const rehypeToc = () => (tree) => {
  /** @type {TocEntry[]} */
  const entries = [];
  visit(tree, "element", (node) => {
    if (
      (node.tagName === "h2" || node.tagName === "h3") &&
      typeof node.properties?.id === "string"
    ) {
      entries.push({
        depth: Number(node.tagName.slice(1)),
        slug: node.properties.id,
        text: toString(node),
      });
    }
  });
  tree.children.unshift({
    type: "mdxjsEsm",
    value: "",
    data: {
      estree: {
        type: "Program",
        sourceType: "module",
        body: [
          {
            type: "ExportNamedDeclaration",
            specifiers: [],
            declaration: {
              type: "VariableDeclaration",
              kind: "const",
              declarations: [
                {
                  type: "VariableDeclarator",
                  id: { type: "Identifier", name: "toc" },
                  init: {
                    type: "Literal",
                    value: null,
                    raw: JSON.stringify(entries),
                  },
                },
              ],
            },
          },
        ],
      },
    },
  });
};
