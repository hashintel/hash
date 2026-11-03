import { describe, expect, it } from "vitest";

import { remarkSlideSteps } from "./slide-steps.mjs";

import type { Root, RootContent } from "mdast";

const expression = (value: string) => ({
  type: "mdxJsxAttributeValueExpression" as const,
  value,
});

const reveal = (
  type: "mdxJsxFlowElement" | "mdxJsxTextElement",
  attributes: Record<string, string>,
) => ({
  type,
  name: "Reveal",
  attributes: Object.entries(attributes).map(([name, value]) => ({
    type: "mdxJsxAttribute" as const,
    name,
    value: expression(value),
  })),
  children: [],
  position: { start: { line: 4, column: 1 }, end: { line: 4, column: 9 } },
});

/** `export const <name> = <init>` as MDX parses it, estree included. */
const esm = (name: string, init: unknown) => ({
  type: "mdxjsEsm" as const,
  value: `export const ${name} = …`,
  data: {
    estree: {
      type: "Program",
      sourceType: "module",
      body: [
        {
          type: "ExportNamedDeclaration",
          declaration: {
            type: "VariableDeclaration",
            kind: "const",
            declarations: [
              {
                type: "VariableDeclarator",
                id: { type: "Identifier", name },
                init,
              },
            ],
          },
        },
      ],
    },
  },
});

const notesWithSteps = (...steps: number[]) => ({
  type: "ObjectExpression",
  properties: [
    {
      type: "Property",
      key: { type: "Identifier", name: "byStep" },
      value: {
        type: "ObjectExpression",
        properties: steps.map((step) => ({
          type: "Property",
          key: { type: "Literal", value: step },
          value: { type: "Literal", value: "say" },
        })),
      },
    },
  ],
});

const tree = (...children: unknown[]): Root => ({
  type: "root",
  children: children as RootContent[],
});

const slide = { path: "/decks/tour/1-claim.mdx" } as never;
const plugin = remarkSlideSteps({ docsDirectory: "/site/content/docs/" });

const exportedSteps = (root: Root): string | undefined => {
  const [first] = root.children;
  return first?.type === "mdxjsEsm" ? first.value : undefined;
};

describe("remarkSlideSteps", () => {
  it("counts a slide's steps from the highest step a reveal names", () => {
    const root = tree(
      reveal("mdxJsxFlowElement", { at: "1" }),
      reveal("mdxJsxFlowElement", { at: "1", until: "3" }),
    );
    plugin(root, slide);
    expect(exportedSteps(root)).toBe("export const steps = 4;");
  });

  it("counts formula steps and note steps too", () => {
    const root = tree(
      { type: "math", value: String.raw`a \step{2}{+ b} \step { 5 }{+ c}` },
      esm("notes", notesWithSteps(1, 6)),
    );
    plugin(root, slide);
    expect(exportedSteps(root)).toBe("export const steps = 7;");
  });

  it("gives a slide with nothing to step one step", () => {
    const root = tree({ type: "paragraph", children: [] });
    plugin(root, slide);
    expect(exportedSteps(root)).toBe("export const steps = 1;");
  });

  it("turns a reveal inside a line of text into an inline reveal", () => {
    const inline = reveal("mdxJsxTextElement", { at: "1" });
    const block = reveal("mdxJsxFlowElement", { at: "1" });
    plugin(tree({ type: "paragraph", children: [inline] }, block), slide);
    expect([inline.name, block.name]).toEqual(["RevealInline", "Reveal"]);
  });

  it("keeps a declared count that covers every step", () => {
    const root = tree(
      esm("steps", { type: "Literal", value: 5 }),
      reveal("mdxJsxFlowElement", { at: "2" }),
    );
    plugin(root, slide);
    expect(root.children).toHaveLength(2);
  });

  it("fails a declared count that a reveal outruns", () => {
    expect(() =>
      plugin(
        tree(
          esm("steps", { type: "Literal", value: 2 }),
          reveal("mdxJsxFlowElement", { at: "2" }),
        ),
        slide,
      ),
    ).toThrow(/declares steps = 2 but uses step 2/u);
  });

  it("asks for a number it can read, or a declared count", () => {
    expect(() =>
      plugin(tree(reveal("mdxJsxFlowElement", { at: "next" })), slide),
    ).toThrow(/1-claim\.mdx:4: <Reveal at> is not a number/u);
  });

  it("leaves docs pages alone", () => {
    const root = tree(reveal("mdxJsxTextElement", { at: "1" }));
    plugin(root, { path: "/site/content/docs/a.mdx" } as never);
    expect(root.children).toHaveLength(1);
  });
});
