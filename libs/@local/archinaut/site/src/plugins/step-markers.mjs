/**
 * The steps a stretch of MDX names, as a slide counts them for its step
 * count and a docs page for each `Steps` block's. A step is named by
 *
 * - `<Reveal at={n} until={m}>`, whose `at` and `until` are number literals;
 * - `\step{n}{…}` and `\swap{n}{…}{…}` inside a formula;
 * - a step class, such as `at-2` or `token-3`, in a d2 block or on an
 *   element of an SVG drawing the page inlines.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { visit } from "unist-util-visit";

import { stepClassInText } from "./step-classes.mjs";

const formulaStep = /\\(?:step|swap)\s*\{\s*(\d+)\s*\}/gu;

/** A d2 `class:` value, one name or a list. */
const d2Class = /\bclass\s*:\s*(\[[^\]]*\]|[^\s;}]+)/gu;
/** An SVG `class` attribute's value. */
const svgClass = /\bclass="([^"]*)"/gu;

/**
 * The steps the class values in a text name.
 *
 * @param {string} text
 * @param {RegExp} classValue
 */
const classSteps = (text, classValue) =>
  [...text.matchAll(classValue)].flatMap(([, names = ""]) =>
    [...names.matchAll(stepClassInText)].map((match) => Number(match[1])),
  );

/**
 * Whether an SVG's markup gives any element a step class.
 *
 * @param {string} markup
 */
export const svgHasSteps = (markup) => classSteps(markup, svgClass).length > 0;

/**
 * The number an attribute's literal expression holds, `undefined` when the
 * attribute is absent, and `null` when it is something else.
 *
 * @param {import("mdast-util-mdx-jsx").MdxJsxFlowElement | import("mdast-util-mdx-jsx").MdxJsxTextElement} node
 * @param {string} name
 * @returns {number | null | undefined}
 */
export const literalAttribute = (node, name) => {
  const attribute = node.attributes.find(
    (candidate) =>
      candidate.type === "mdxJsxAttribute" && candidate.name === name,
  );
  if (attribute === undefined) {
    return undefined;
  }
  const raw =
    typeof attribute.value === "object" && attribute.value !== null
      ? attribute.value.value
      : attribute.value;
  return typeof raw === "string" && /^\s*\d+\s*$/u.test(raw)
    ? Number(raw)
    : null;
};

/**
 * Reads the drawings a page inlines: `@diagrams/<name>.svg` from the
 * bundle's diagrams, anything else relative to the page. Null when the file
 * is not there.
 *
 * @param {string} path the page's file
 * @param {string | undefined} diagramsDirectory
 * @returns {(url: string) => string | null}
 */
export const drawingsBeside = (path, diagramsDirectory) => (url) => {
  const location =
    url.startsWith("@diagrams/") && diagramsDirectory !== undefined
      ? resolve(diagramsDirectory, url.slice("@diagrams/".length))
      : resolve(dirname(path), url);
  return existsSync(location) ? readFileSync(location, "utf8") : null;
};

/**
 * Every step `node` and what it holds name, and the reveals whose step is
 * not a number literal.
 *
 * @param {import("unist").Node} node
 * @param {{ drawingAt: (url: string) => string | null, where: (node: import("unist").Node) => string, d2Blocks: boolean }} options
 *   `d2Blocks`: whether a fenced d2 block is drawn, as on a slide, rather
 *   than shown as code
 * @returns {{ named: number[], unreadable: string[] }}
 */
export const stepsNamedIn = (node, { drawingAt, where, d2Blocks }) => {
  /** @type {number[]} */
  const named = [];
  /** @type {string[]} */
  const unreadable = [];
  visit(node, (child) => {
    if (child.type === "math" || child.type === "inlineMath") {
      for (const match of child.value.matchAll(formulaStep)) {
        named.push(Number(match[1]));
      }
      return;
    }
    if (d2Blocks && child.type === "code" && child.lang === "d2") {
      named.push(...classSteps(child.value, d2Class));
      return;
    }
    if (
      child.type === "image" &&
      child.url.endsWith(".svg") &&
      child.url.includes("diagrams/")
    ) {
      const svg = drawingAt(child.url);
      if (svg !== null) {
        named.push(...classSteps(svg, svgClass));
      }
      return;
    }
    if (
      (child.type === "mdxJsxFlowElement" ||
        child.type === "mdxJsxTextElement") &&
      (child.name === "Reveal" || child.name === "RevealInline")
    ) {
      for (const name of ["at", "until"]) {
        const value = literalAttribute(child, name);
        if (value === null) {
          unreadable.push(`${where(child)}: <Reveal ${name}> is not a number`);
        } else if (value !== undefined) {
          named.push(value);
        }
      }
    }
  });
  return { named, unreadable };
};

/**
 * Renames each `Reveal` inside a line of text to `RevealInline`, which
 * draws a span where `Reveal` draws a block, so the author writes `Reveal`
 * anywhere.
 *
 * @param {import("mdast").Root} tree
 */
export const markInlineReveals = (tree) => {
  visit(tree, "mdxJsxTextElement", (node) => {
    if (node.name === "Reveal") {
      node.name = "RevealInline";
    }
  });
};
