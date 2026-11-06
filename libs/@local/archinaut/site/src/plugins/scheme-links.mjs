/**
 * Resolves `layer:` and `doc:` link targets in MDX the bundle did not emit,
 * which is to say in slides: the bundle resolves its own pages' links at
 * emit time, and a slide written beside the docs wants the same schemes.
 * A target no page answers to fails the compile with the file and line, as
 * an unresolved link fails `archinaut check` for a page.
 */

import { visit } from "unist-util-visit";

/**
 * @param {{ slugs: Set<string>; docsDirectory: string }} options
 * @returns {(tree: import("mdast").Root, file: import("vfile").VFile) => void}
 */
export const remarkSchemeLinks =
  ({ slugs, docsDirectory }) =>
  (tree, file) => {
    if (typeof file.path === "string" && file.path.startsWith(docsDirectory)) {
      return;
    }
    /** @type {string[]} */
    const unresolved = [];
    visit(tree, "link", (node) => {
      const match = /^(layer|doc):([^#]+)(#.*)?$/u.exec(node.url);
      if (match === null) {
        return;
      }
      const [, scheme, target, fragment = ""] = match;
      const slug =
        scheme === "layer"
          ? `architecture/${target.replace(/\./gu, "/")}`
          : target;
      if (slugs.has(slug)) {
        node.url = `/${slug}${fragment}`;
      } else {
        unresolved.push(
          `${file.path ?? "slide"}:${node.position?.start.line ?? "?"}: ${node.url}`,
        );
      }
    });
    if (unresolved.length > 0) {
      throw new Error(
        `no page answers to these links:\n${unresolved.join("\n")}`,
      );
    }
  };
