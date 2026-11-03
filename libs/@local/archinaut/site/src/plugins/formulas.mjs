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
 * On a slide, `\step{n}{…}` shows part of a formula from step `n`. It
 * expands to KaTeX's `\htmlData{at=n}{…}`, the one HTML extension trusted,
 * and each tagged span becomes a `RevealInline`, so it keeps its space while
 * hidden and the formula never shifts. On a docs page `\step` is not
 * defined, and using it fails the compile.
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
 * KaTeX settings for a slide: `\step` and the one HTML extension it needs.
 * A function, because KaTeX writes a formula's own definitions into
 * `macros`, and one formula's must not reach the next.
 */
const slideOptions = () => ({
  macros: { "\\step": "\\htmlData{at=#1}{#2}" },
  trust: (/** @type {{ command: string }} */ context) =>
    context.command === "\\htmlData",
  strict: (/** @type {string} */ errorCode) =>
    errorCode === "htmlExtension" ? "ignore" : "warn",
});

/**
 * An inline reveal around a span `\step` tagged, as MDX compiles JSX.
 *
 * @param {import("hast").Element} element
 * @param {number} at
 */
const revealFrom = (element, at) => ({
  type: "mdxJsxTextElement",
  name: "RevealInline",
  attributes: [
    {
      type: "mdxJsxAttribute",
      name: "at",
      value: {
        type: "mdxJsxAttributeValueExpression",
        value: String(at),
        data: {
          estree: {
            type: "Program",
            sourceType: "module",
            body: [
              {
                type: "ExpressionStatement",
                expression: { type: "Literal", value: at, raw: String(at) },
              },
            ],
          },
        },
      },
    },
  ],
  children: [element],
});

/**
 * Wraps every span `\step` tagged in an inline reveal, innermost last so a
 * step nested in another is wrapped too.
 *
 * @param {import("hast").Root} fragment
 */
const revealSteps = (fragment) => {
  visit(fragment, "element", (element, index, parent) => {
    const at = Number(element.properties.dataAt);
    if (
      element.properties.dataAt === undefined ||
      !Number.isInteger(at) ||
      parent === undefined ||
      index === undefined
    ) {
      return;
    }
    parent.children[index] = /** @type {never} */ (revealFrom(element, at));
  });
};

/**
 * @param {{ docsDirectory?: string }} [options]
 * @returns {(tree: import("hast").Root, file: import("vfile").VFile) => void}
 */
export const rehypeFormulas =
  (options = {}) =>
  (tree, file) => {
    const slide =
      options.docsDirectory !== undefined &&
      typeof file.path === "string" &&
      !file.path.startsWith(options.docsDirectory);
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
          ...(slide ? slideOptions() : {}),
        });
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        const line = element.position?.start.line ?? "?";
        throw new Error(
          `KaTeX could not render a formula:\n${file.path ?? "page"}:${line}: ${reason}`,
        );
      }
      const fragment = fromHtml(html, { fragment: true });
      if (slide) {
        revealSteps(fragment);
      }
      const rendered = fragment.children;
      parent.children.splice(index, 1, ...rendered);
      return [SKIP, index + rendered.length];
    });
  };
