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
 *
 * `\step{n}{…}` shows part of a formula from step `n`, and
 * `\swap{n}{before}{after}` shows `before` until step `n` and `after` from
 * it, in the same place. Both expand to KaTeX's `\htmlData`, the one HTML
 * extension trusted, and each tagged span becomes an inline reveal. A
 * `\step` part keeps its space while hidden, so the formula never shifts; a
 * swap reflows once, at its step. `\morph{name}{…}` marks a part that keeps
 * its identity across steps: where a step moves it, it glides to its new
 * place. They step with the slide they are on, or on a docs page with the
 * `Steps` block around the formula.
 */

import { fromHtml } from "hast-util-from-html";
import katex from "katex";
import { SKIP, visit } from "unist-util-visit";

import { numberAttribute } from "./mdx-jsx.mjs";

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
 * KaTeX settings for stepped formulas: `\step`, `\swap`, `\morph` and the
 * one HTML extension they need. A function, because KaTeX writes a formula's own definitions
 * into `macros`, and one formula's must not reach the next.
 */
const stepOptions = () => ({
  macros: {
    "\\step": "\\htmlData{at=#1}{#2}",
    "\\swap": "\\htmlData{until=#1, swap=1}{#2}\\htmlData{at=#1, swap=1}{#3}",
    "\\morph": "\\htmlData{morph=#1}{#2}",
  },
  trust: (/** @type {{ command: string }} */ context) =>
    context.command === "\\htmlData",
  strict: (/** @type {string} */ errorCode) =>
    errorCode === "htmlExtension" ? "ignore" : "warn",
});

/**
 * The step a span's data attribute names, if it is a whole number.
 *
 * @param {unknown} value
 * @returns {number | undefined}
 */
const stepOf = (value) => {
  const step = Number(value);
  return value !== undefined && Number.isInteger(step) ? step : undefined;
};

/**
 * Wraps every span `\step`, `\swap` or `\morph` tagged, innermost last so
 * a part nested in another is wrapped too. A `\step` part becomes a
 * `RevealInline`, which keeps its space while hidden; each side of a
 * `\swap` becomes an `OnlyInline`, which does not, so the two share a place;
 * a `\morph` part becomes a `Morph`.
 *
 * @param {import("hast").Root} fragment
 */
const wrapSteppedParts = (fragment) => {
  visit(fragment, "element", (element, index, parent) => {
    if (parent === undefined || index === undefined) {
      return;
    }
    const morph = element.properties.dataMorph;
    if (typeof morph === "string" && morph !== "") {
      parent.children[index] = /** @type {never} */ ({
        type: "mdxJsxTextElement",
        name: "Morph",
        attributes: [{ type: "mdxJsxAttribute", name: "name", value: morph }],
        children: [element],
      });
      return;
    }
    const at = stepOf(element.properties.dataAt);
    const until = stepOf(element.properties.dataUntil);
    if (at === undefined && until === undefined) {
      return;
    }
    const swapped = element.properties.dataSwap !== undefined;
    parent.children[index] = /** @type {never} */ ({
      type: "mdxJsxTextElement",
      name: swapped ? "OnlyInline" : "RevealInline",
      attributes: [
        ...(at === undefined ? [] : [numberAttribute("at", at)]),
        ...(until === undefined ? [] : [numberAttribute("until", until)]),
      ],
      children: [element],
    });
  });
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
        ...stepOptions(),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      const line = element.position?.start.line ?? "?";
      throw new Error(
        `KaTeX could not render a formula:\n${file.path ?? "page"}:${line}: ${reason}`,
      );
    }
    const fragment = fromHtml(html, { fragment: true });
    wrapSteppedParts(fragment);
    const rendered = fragment.children;
    parent.children.splice(index, 1, ...rendered);
    return [SKIP, index + rendered.length];
  });
};
