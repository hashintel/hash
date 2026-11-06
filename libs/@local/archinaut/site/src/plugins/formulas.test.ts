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

interface JsxNode {
  type: string;
  name?: string;
  attributes?: { name: string; value: string | { value: string } }[];
  children?: JsxNode[];
}

/** Every inline reveal in the tree, as its component and step range. */
const revealsIn = (root: Root): string[] => {
  const found: string[] = [];
  const walk = (node: JsxNode): void => {
    if (node.type === "mdxJsxTextElement") {
      const range = (node.attributes ?? [])
        .map(
          (attribute) =>
            `${attribute.name}=${typeof attribute.value === "string" ? attribute.value : attribute.value.value}`,
        )
        .join(" ");
      found.push(`${node.name} ${range}`);
    }
    (node.children ?? []).forEach(walk);
  };
  walk(root as unknown as JsxNode);
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
    expect(revealsIn(root)).toEqual(["RevealInline at=1", "RevealInline at=2"]);
  });

  it("wraps a step nested inside another", () => {
    const root = inlineMath(String.raw`\step{1}{a \step{3}{+ b}}`);
    plugin(root, slide);
    expect(revealsIn(root)).toEqual(["RevealInline at=1", "RevealInline at=3"]);
  });

  it("turns a \\swap into a part until the step and a part from it", () => {
    const root = inlineMath(String.raw`\ge \swap{4}{1 - \alpha}{0.95}`);
    plugin(root, slide);
    expect(revealsIn(root)).toEqual(["OnlyInline until=4", "OnlyInline at=4"]);
  });

  it("swaps again inside the part a swap brings in", () => {
    const root = inlineMath(String.raw`\swap{2}{a}{\swap{5}{b}{c}}`);
    plugin(root, slide);
    expect(revealsIn(root)).toEqual([
      "OnlyInline until=2",
      "OnlyInline at=2",
      "OnlyInline until=5",
      "OnlyInline at=5",
    ]);
  });

  it("turns a \\morph into a part that keeps its name across steps", () => {
    const root = inlineMath(
      String.raw`\swap{1}{\morph{H}{H_T} + 1}{1 + \morph{H}{H_T}}`,
    );
    plugin(root, slide);
    expect(revealsIn(root)).toEqual([
      "OnlyInline until=1",
      "Morph name=H",
      "OnlyInline at=1",
      "Morph name=H",
    ]);
  });

  it("does not define \\step, \\swap or \\morph on a docs page", () => {
    const docsPage = { path: "/site/content/docs/a.mdx" } as never;
    expect(() =>
      plugin(inlineMath(String.raw`a \step{1}{b}`), docsPage),
    ).toThrow(
      /a\.mdx:7: KaTeX parse error: Undefined control sequence: \\step/u,
    );
    expect(() =>
      plugin(inlineMath(String.raw`\swap{1}{a}{b}`), docsPage),
    ).toThrow(/Undefined control sequence: \\swap/u);
    expect(() =>
      plugin(inlineMath(String.raw`\morph{a}{b}`), docsPage),
    ).toThrow(/Undefined control sequence: \\morph/u);
  });
});
