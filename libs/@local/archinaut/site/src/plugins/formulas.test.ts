import { describe, expect, it } from "vitest";

import { rehypeFormulas } from "./formulas.mjs";

import type { Element, Root } from "hast";

const inlineMath = (tex: string): Root => ({
  type: "root",
  children: [
    {
      type: "element",
      tagName: "p",
      properties: {},
      children: [
        {
          type: "element",
          tagName: "code",
          properties: { className: ["language-math", "math-inline"] },
          children: [{ type: "text", value: tex }],
          position: {
            start: { line: 7, column: 1 },
            end: { line: 7, column: 9 },
          },
        },
      ],
    },
  ],
});

/** Every inline reveal in the tree, as `at` and the text it holds. */
const revealsIn = (root: Root): string[] => {
  const found: string[] = [];
  const walk = (
    node: { type: string; children?: unknown[] } & Record<string, unknown>,
  ): void => {
    if (node.type === "mdxJsxTextElement" && node.name === "RevealInline") {
      const [attribute] = node.attributes as { value: { value: string } }[];
      let text = "";
      const collect = (child: {
        type: string;
        value?: string;
        children?: unknown[];
      }) => {
        if (child.type === "text") text += child.value ?? "";
        (child.children ?? []).forEach((grandchild) =>
          collect(grandchild as never),
        );
      };
      (node.children ?? []).forEach((child) => collect(child as never));
      found.push(`${attribute?.value.value}:${text}`);
    }
    (node.children ?? []).forEach((child) => walk(child as never));
  };
  walk(root as never);
  return found;
};

const plugin = rehypeFormulas({ docsDirectory: "/site/content/docs/" });
const slide = { path: "/decks/tour/2-rule.mdx" } as never;

describe("rehypeFormulas", () => {
  it("renders a formula in place of the math code", () => {
    const root = inlineMath("x^2");
    plugin(root, slide);
    const [paragraph] = root.children as Element[];
    const [first] = (paragraph?.children ?? []) as Element[];
    expect(first?.properties.className).toContain("katex");
  });

  it("turns each \\step on a slide into an inline reveal from that step", () => {
    const root = inlineMath(String.raw`a \step{1}{+ b} \step{2}{+ c}`);
    plugin(root, slide);
    expect(revealsIn(root).map((reveal) => reveal.split(":")[0])).toEqual([
      "1",
      "2",
    ]);
  });

  it("wraps a step nested inside another", () => {
    const root = inlineMath(String.raw`\step{1}{a \step{3}{+ b}}`);
    plugin(root, slide);
    expect(revealsIn(root).map((reveal) => reveal.split(":")[0])).toEqual([
      "1",
      "3",
    ]);
  });

  it("does not define \\step on a docs page", () => {
    expect(() =>
      plugin(inlineMath(String.raw`a \step{1}{b}`), {
        path: "/site/content/docs/a.mdx",
      } as never),
    ).toThrow(
      /a\.mdx:7: KaTeX parse error: Undefined control sequence: \\step/u,
    );
  });
});
