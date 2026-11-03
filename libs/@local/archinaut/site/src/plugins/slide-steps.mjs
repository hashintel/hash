/**
 * Works out how many steps an MDX slide has, so the author never writes the
 * count by hand. A slide's steps are the highest step anything on it names,
 * plus one:
 *
 * - `<Reveal at={n} until={m}>`, whose `at` and `until` are number literals;
 * - `\step{n}{…}` and `\swap{n}{…}{…}` inside a formula;
 * - a key of `notes.byStep`.
 *
 * Without an `export const steps` the plugin writes one. With one, it checks
 * the count covers every step the slide names and fails the compile if not.
 * A `Reveal` inside a line of text becomes `RevealInline`, which draws a
 * span where `Reveal` draws a block, so the author writes `Reveal` anywhere.
 *
 * Docs pages are left alone: they have no steps.
 */

import { visit } from "unist-util-visit";

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
 * The declarator of `export const <name> = …` in an ESM node, if any.
 *
 * @param {import("mdast-util-mdxjs-esm").MdxjsEsm} node
 * @param {string} name
 */
const exportedConst = (node, name) => {
  for (const statement of node.data?.estree?.body ?? []) {
    if (
      statement.type === "ExportNamedDeclaration" &&
      statement.declaration?.type === "VariableDeclaration"
    ) {
      const declarator = statement.declaration.declarations.find(
        (candidate) =>
          candidate.id.type === "Identifier" && candidate.id.name === name,
      );
      if (declarator !== undefined) {
        return declarator;
      }
    }
  }
  return undefined;
};

/**
 * The numeric keys of `notes.byStep`, when `notes` is an object literal.
 *
 * @param {import("estree").Expression | null | undefined} notes
 * @returns {number[]}
 */
const noteSteps = (notes) => {
  if (notes?.type !== "ObjectExpression") {
    return [];
  }
  const byStep = notes.properties.find(
    (property) =>
      property.type === "Property" &&
      ((property.key.type === "Identifier" && property.key.name === "byStep") ||
        (property.key.type === "Literal" && property.key.value === "byStep")),
  );
  if (byStep?.type !== "Property" || byStep.value.type !== "ObjectExpression") {
    return [];
  }
  return byStep.value.properties.flatMap((property) =>
    property.type === "Property" &&
    property.key.type === "Literal" &&
    typeof property.key.value === "number"
      ? [property.key.value]
      : [],
  );
};

/** An `export const steps = <count>` node, with the estree MDX compiles from. */
const stepsExport = (count) => ({
  type: "mdxjsEsm",
  value: `export const steps = ${count};`,
  data: {
    estree: {
      type: "Program",
      sourceType: "module",
      body: [
        {
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
                id: { type: "Identifier", name: "steps" },
                init: { type: "Literal", value: count, raw: String(count) },
              },
            ],
          },
        },
      ],
    },
  },
});

/**
 * @param {{ docsDirectory: string }} options
 * @returns {(tree: import("mdast").Root, file: import("vfile").VFile) => void}
 */
export const remarkSlideSteps =
  ({ docsDirectory }) =>
  (tree, file) => {
    if (typeof file.path === "string" && file.path.startsWith(docsDirectory)) {
      return;
    }
    const where = (node) =>
      `${file.path ?? "slide"}:${node.position?.start.line ?? "?"}`;
    /** @type {number[]} */
    const named = [];
    /** @type {string[]} */
    const unreadable = [];
    /** @type {number | null} */
    let declared = null;

    visit(tree, (node) => {
      if (node.type === "math" || node.type === "inlineMath") {
        for (const match of node.value.matchAll(formulaStep)) {
          named.push(Number(match[1]));
        }
        return;
      }
      if (node.type === "mdxjsEsm") {
        noteSteps(exportedConst(node, "notes")?.init).forEach((step) =>
          named.push(step),
        );
        const steps = exportedConst(node, "steps");
        if (steps !== undefined) {
          declared =
            steps.init?.type === "Literal" &&
            typeof steps.init.value === "number"
              ? steps.init.value
              : Number.POSITIVE_INFINITY;
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

    if (declared !== null) {
      const needed = Math.max(0, ...named) + 1;
      if (declared < needed) {
        throw new Error(
          `${file.path ?? "slide"}: declares steps = ${declared} but uses step ${needed - 1}; drop the export and the count is worked out`,
        );
      }
      return;
    }
    if (unreadable.length > 0) {
      throw new Error(
        `a slide's steps are counted from number literals:\n${unreadable.join("\n")}\nwrite the number, or declare \`export const steps\``,
      );
    }
    tree.children.unshift(stepsExport(Math.max(0, ...named) + 1));
  };
