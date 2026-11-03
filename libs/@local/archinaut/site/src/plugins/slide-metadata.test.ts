import { describe, expect, it } from "vitest";

import { remarkSlideMetadata } from "./slide-metadata.mjs";

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

const tree = (...children: unknown[]): Root => ({
  type: "root",
  children: children as RootContent[],
});

const yaml = (...lines: string[]) => ({
  type: "yaml" as const,
  value: lines.join("\n"),
});

const slide = { path: "/decks/tour/1-claim.mdx" } as never;
const plugin = remarkSlideMetadata({ docsDirectory: "/site/content/docs/" });

const exported = (root: Root): string | undefined => {
  const [first] = root.children;
  return first?.type === "mdxjsEsm" ? first.value : undefined;
};

describe("remarkSlideMetadata", () => {
  it("counts a slide's steps from the highest step a reveal names", () => {
    const root = tree(
      reveal("mdxJsxFlowElement", { at: "1" }),
      reveal("mdxJsxFlowElement", { at: "1", until: "3" }),
    );
    plugin(root, slide);
    expect(exported(root)).toBe("export const steps = 4;");
  });

  it("counts formula steps, swaps and the frontmatter's note steps too", () => {
    const root = tree(
      yaml("notes:", "  byStep:", "    1: First.", "    6: Last."),
      { type: "math", value: String.raw`a \step{2}{+ b} \step { 5 }{+ c}` },
      { type: "inlineMath", value: String.raw`\swap{8}{x}{y}` },
    );
    plugin(root, slide);
    expect(exported(root)).toMatch(/export const steps = 9;$/u);
  });

  it("gives a slide with nothing to step one step", () => {
    const root = tree({ type: "paragraph", children: [] });
    plugin(root, slide);
    expect(exported(root)).toBe("export const steps = 1;");
  });

  it("exports the frontmatter beside the step count", () => {
    const root = tree(
      yaml(
        "layout: title",
        "title: Overview",
        "author: Sam Speaker",
        "notes: Say this.",
      ),
    );
    plugin(root, slide);
    expect(exported(root)?.split("\n")).toEqual([
      'export const title = "Overview";',
      'export const layout = "title";',
      'export const author = "Sam Speaker";',
      'export const notes = "Say this.";',
      "export const steps = 1;",
    ]);
    const [first] = root.children;
    expect(
      first?.type === "mdxjsEsm" ? first.data?.estree?.body : undefined,
    ).toHaveLength(5);
  });

  it("turns a reveal inside a line of text into an inline reveal", () => {
    const inline = reveal("mdxJsxTextElement", { at: "1" });
    const block = reveal("mdxJsxFlowElement", { at: "1" });
    plugin(tree({ type: "paragraph", children: [inline] }, block), slide);
    expect([inline.name, block.name]).toEqual(["RevealInline", "Reveal"]);
  });

  it("keeps a declared count that covers every step", () => {
    const root = tree(
      yaml("steps: 5"),
      reveal("mdxJsxFlowElement", { at: "2" }),
    );
    plugin(root, slide);
    expect(exported(root)).toBe("export const steps = 5;");
  });

  it("fails a declared count that a reveal outruns", () => {
    expect(() =>
      plugin(
        tree(yaml("steps: 2"), reveal("mdxJsxFlowElement", { at: "2" })),
        slide,
      ),
    ).toThrow(/declares steps: 2 but uses step 2/u);
  });

  it("asks for a number it can read, or a declared count", () => {
    expect(() =>
      plugin(tree(reveal("mdxJsxFlowElement", { at: "next" })), slide),
    ).toThrow(/1-claim\.mdx:4: <Reveal at> is not a number/u);
  });

  it("refuses metadata exported from the slide's code", () => {
    expect(() =>
      plugin(tree(esm("title", { type: "Literal", value: "Overview" })), slide),
    ).toThrow(/`export const title` is slide metadata; write `title:`/u);
    expect(() =>
      plugin(tree(esm("rows", { type: "Literal", value: 3 })), slide),
    ).not.toThrow();
  });

  it("fails the compile on frontmatter the schema refuses", () => {
    expect(() => plugin(tree(yaml("subtitle: Lost")), slide)).toThrow(
      /1-claim\.mdx: frontmatter/u,
    );
  });

  it("leaves docs pages alone", () => {
    const root = tree(reveal("mdxJsxTextElement", { at: "1" }));
    plugin(root, { path: "/site/content/docs/a.mdx" } as never);
    expect(root.children).toHaveLength(1);
  });
});
