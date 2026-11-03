/**
 * Turns an MDX slide's frontmatter into the exports the deck reads, and
 * works out how many steps the slide has, so the author never writes the
 * count by hand. A slide's steps are the highest step anything on it names,
 * plus one:
 *
 * - `<Reveal at={n} until={m}>`, whose `at` and `until` are number literals;
 * - `\step{n}{…}` and `\swap{n}{…}{…}` inside a formula;
 * - a key of the frontmatter's `notes.byStep`.
 *
 * A `steps` key in the frontmatter overrides the count, and the compile
 * fails if the slide uses a later step. Metadata lives in the frontmatter
 * alone: a slide whose code exports `title` or another of its keys fails.
 * A `Reveal` inside a line of text becomes `RevealInline`, which draws a
 * span where `Reveal` draws a block, so the author writes `Reveal` anywhere.
 *
 * Docs pages are left alone: they have no steps.
 */

import { visit } from "unist-util-visit";

import { valueExpression } from "./estree-values.mjs";
import {
  readSlideFrontmatter,
  slideFrontmatterKeys,
} from "./slide-frontmatter.mjs";

const formulaStep = /\\(?:step|swap)\s*\{\s*(\d+)\s*\}/gu;

/**
 * The number an attribute's literal expression holds, `undefined` when the
 * attribute is absent, and `null` when it is something else.
 *
 * @param {import("mdast-util-mdx-jsx").MdxJsxFlowElement | import("mdast-util-mdx-jsx").MdxJsxTextElement} node
 * @param {string} name
 * @returns {number | null | undefined}
 */
const literalAttribute = (node, name) => {
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
 * The names an ESM node declares with `export const`.
 *
 * @param {import("mdast-util-mdxjs-esm").MdxjsEsm} node
 * @returns {string[]}
 */
const exportedConsts = (node) =>
  (node.data?.estree?.body ?? []).flatMap((statement) =>
    statement.type === "ExportNamedDeclaration" &&
    statement.declaration?.type === "VariableDeclaration"
      ? statement.declaration.declarations.flatMap((declarator) =>
          declarator.id.type === "Identifier" ? [declarator.id.name] : [],
        )
      : [],
  );

/**
 * `export const <key> = <value>;` for each entry, as one ESM node with the
 * estree MDX compiles from.
 *
 * @param {Record<string, unknown>} values
 */
const exportsOf = (values) => {
  const entries = Object.entries(values);
  return {
    type: "mdxjsEsm",
    value: entries
      .map(([key, value]) => `export const ${key} = ${JSON.stringify(value)};`)
      .join("\n"),
    data: {
      estree: {
        type: "Program",
        sourceType: "module",
        body: entries.map(([key, value]) => ({
          type: "ExportNamedDeclaration",
          specifiers: [],
          source: null,
          attributes: [],
          declaration: {
            type: "VariableDeclaration",
            kind: "const",
            declarations: [
              {
                type: "VariableDeclarator",
                id: { type: "Identifier", name: key },
                init: valueExpression(value),
              },
            ],
          },
        })),
      },
    },
  };
};

/**
 * @param {{ docsDirectory: string }} options
 * @returns {(tree: import("mdast").Root, file: import("vfile").VFile) => void}
 */
export const remarkSlideMetadata =
  ({ docsDirectory }) =>
  (tree, file) => {
    if (typeof file.path === "string" && file.path.startsWith(docsDirectory)) {
      return;
    }
    const path = file.path ?? "slide";
    const where = (node) => `${path}:${node.position?.start.line ?? "?"}`;
    const [first] = tree.children;
    const meta =
      first?.type === "yaml" ? readSlideFrontmatter(first.value, path) : {};

    /** @type {number[]} */
    const named =
      typeof meta.notes === "object"
        ? Object.keys(meta.notes.byStep ?? {}).map(Number)
        : [];
    /** @type {string[]} */
    const unreadable = [];

    visit(tree, (node) => {
      if (node.type === "math" || node.type === "inlineMath") {
        for (const match of node.value.matchAll(formulaStep)) {
          named.push(Number(match[1]));
        }
        return;
      }
      if (node.type === "mdxjsEsm") {
        const metadata = exportedConsts(node).find((name) =>
          slideFrontmatterKeys.includes(name),
        );
        if (metadata !== undefined) {
          throw new Error(
            `${where(node)}: \`export const ${metadata}\` is slide metadata; write \`${metadata}:\` in the frontmatter at the top of the slide instead`,
          );
        }
        return;
      }
      if (
        (node.type === "mdxJsxFlowElement" ||
          node.type === "mdxJsxTextElement") &&
        node.name === "Reveal"
      ) {
        for (const name of ["at", "until"]) {
          const value = literalAttribute(node, name);
          if (value === null) {
            unreadable.push(`${where(node)}: <Reveal ${name}> is not a number`);
          } else if (value !== undefined) {
            named.push(value);
          }
        }
        if (node.type === "mdxJsxTextElement") {
          node.name = "RevealInline";
        }
      }
    });

    const needed = Math.max(0, ...named) + 1;
    if (meta.steps !== undefined && meta.steps < needed) {
      throw new Error(
        `${path}: declares steps: ${meta.steps} but uses step ${needed - 1}; drop the key and the count is worked out`,
      );
    }
    if (meta.steps === undefined && unreadable.length > 0) {
      throw new Error(
        `a slide's steps are counted from number literals:\n${unreadable.join("\n")}\nwrite the number, or declare \`steps:\` in the frontmatter`,
      );
    }
    tree.children.unshift(exportsOf({ ...meta, steps: meta.steps ?? needed }));
  };
