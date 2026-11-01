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
 * @param {import("hast").Element} element
 * @returns {string[]}
 */
const classesOf = (element) =>
  Array.isArray(element.properties.className)
    ? element.properties.className.map(String)
    : [];

/**
 * @param {import("hast").Element} element
 * @returns {string}
 */
const textOf = (element) => {
  let text = "";
  visit(element, "text", (node) => {
    text += node.value;
  });
  return text;
};

/**
 * The formula an element carries, if it is one `remark-math` emitted: the
 * `code` of a `$…$` span, or the `pre` around the `code` of a `$$` block.
 *
 * @param {import("hast").Element} element
 * @returns {{ tex: string; display: boolean } | null}
 */
const formulaOf = (element) => {
  if (element.tagName === "pre") {
    const [child] = element.children;
    return child?.type === "element" &&
      child.tagName === "code" &&
      classesOf(child).includes("math-display")
      ? { tex: textOf(child), display: true }
      : null;
  }
  return element.tagName === "code" &&
    classesOf(element).includes("math-inline")
    ? { tex: textOf(element), display: false }
    : null;
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
