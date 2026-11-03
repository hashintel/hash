/**
 * Renders the formulas `remark-math` parsed, with KaTeX, when the page
 * compiles: a `$…$` span becomes inline HTML and MathML, a `$$` block a
 * display formula, and the page ships no renderer. A formula KaTeX cannot
 * parse fails the compile with the file, the line and KaTeX's reason,
 * where KaTeX alone would set the TeX in red and the page would ship it.
 *
 * `rehype-katex` renders the same nodes, but its release line pins a KaTeX
 * the dependency review rejects; calling KaTeX here keeps the site on the
 * patched release.
 */

import { fromHtml } from "hast-util-from-html";
import katex from "katex";
import { SKIP, visit } from "unist-util-visit";

/**
 * The formula an element carries, if `remark-math` emitted it: a `$…$` span
 * is a `code.math-inline`, a `$$` block the `pre` around a `code.math-display`.
 *
 * @param {import("hast").Element} element
 * @returns {{ tex: string; display: boolean } | null}
 */
const formulaOf = (element) => {
  const display = element.tagName === "pre";
  const code = display ? element.children[0] : element;
  const classes =
    code?.type === "element" ? (code.properties.className ?? []) : [];
  if (!classes.includes(display ? "math-display" : "math-inline")) {
    return null;
  }
  const tex = code.children
    .map((child) => (child.type === "text" ? child.value : ""))
    .join("");
  return { tex, display };
};

/**
 * @returns {(tree: import("hast").Root, file: import("vfile").VFile) => void}
 */
export const rehypeFormulas = () => (tree, file) => {
  visit(tree, "element", (element, index, parent) => {
    const formula = formulaOf(element);
    if (formula === null || parent === undefined || index === undefined) {
      return;
    }
    let html;
    try {
      html = katex.renderToString(formula.tex, {
        displayMode: formula.display,
        output: "htmlAndMathml",
        throwOnError: true,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      const line = element.position?.start.line ?? "?";
      throw new Error(
        `KaTeX could not render a formula:\n${file.path ?? "page"}:${line}: ${reason}`,
      );
    }
    const rendered = fromHtml(html, { fragment: true }).children;
    parent.children.splice(index, 1, ...rendered);
    return [SKIP, index + rendered.length];
  });
};
