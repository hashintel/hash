import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { remarkDocSteps } from "./doc-steps.mjs";

import type { Root, RootContent } from "mdast";

const docsDirectory = mkdtempSync(join(tmpdir(), "archinaut-doc-steps-"));
const page = { path: join(docsDirectory, "guide.mdx") } as never;
const plugin = remarkDocSteps({ docsDirectory });

const jsx = (
  type: "mdxJsxFlowElement" | "mdxJsxTextElement",
  name: string,
  attributes: Record<string, string>,
  children: unknown[] = [],
) => ({
  type,
  name,
  attributes: Object.entries(attributes).map(([attribute, value]) => ({
    type: "mdxJsxAttribute",
    name: attribute,
    value: { type: "mdxJsxAttributeValueExpression", value },
  })),
  children,
  position: { start: { line: 3, column: 1 }, end: { line: 3, column: 9 } },
});

const text = (value: string) => ({ type: "text", value });
const paragraph = (...children: unknown[]) => ({
  type: "paragraph",
  children,
});

const run = (...children: unknown[]): Root => {
  const tree = { type: "root", children } as Root;
  plugin(tree, page);
  return tree;
};

/** Each top-level node, `Steps count=n` for a wrapped one. */
const outline = (tree: Root): string[] =>
  tree.children.map((node: RootContent) => {
    if (node.type !== "mdxJsxFlowElement" || node.name !== "Steps") {
      return node.type;
    }
    const count = node.attributes.find(
      (attribute) => "name" in attribute && attribute.name === "count",
    );
    const value =
      typeof count?.value === "object" ? count.value?.value : count?.value;
    return `Steps count=${value}`;
  });

describe("remarkDocSteps", () => {
  it("wraps a paragraph with a reveal in a block of its own", () => {
    const tree = run(
      paragraph(text("Plain.")),
      paragraph(
        text("Then "),
        jsx("mdxJsxTextElement", "Reveal", { at: "1" }, [text("this")]),
      ),
    );
    expect(outline(tree)).toEqual(["paragraph", "Steps count=2"]);
    expect(JSON.stringify(tree)).toContain('"name":"RevealInline"');
  });

  it("wraps a formula whose parts step", () => {
    const tree = run({ type: "math", value: String.raw`a \step{2}{+ b}` });
    expect(outline(tree)).toEqual(["Steps count=3"]);
  });

  it("wraps a drawing whose elements carry step classes", () => {
    mkdirSync(join(docsDirectory, "diagrams"), { recursive: true });
    writeFileSync(
      join(docsDirectory, "diagrams", "flow.svg"),
      '<svg><g class="YQ== at-1"></g><g class="Yg== token-3"></g></svg>',
    );
    writeFileSync(
      join(docsDirectory, "diagrams", "still.svg"),
      '<svg><g class="YQ== focus"></g></svg>',
    );
    const image = (url: string) =>
      paragraph({ type: "image", url, alt: "A flow" });
    expect(
      outline(run(image("./diagrams/flow.svg"), image("./diagrams/still.svg"))),
    ).toEqual(["Steps count=4", "paragraph"]);
  });

  it("counts a Steps block across everything in it, nested blocks included", () => {
    const tree = run(
      jsx("mdxJsxFlowElement", "Steps", {}, [
        jsx("mdxJsxFlowElement", "Reveal", { at: "1" }),
        jsx("mdxJsxFlowElement", "Steps", {}, [
          jsx("mdxJsxFlowElement", "Reveal", { at: "2", until: "4" }),
        ]),
      ]),
    );
    expect(outline(tree)).toEqual(["Steps count=5"]);
    const [outer] = tree.children as {
      children: { attributes: unknown[] }[];
    }[];
    expect(outer?.children[1]?.attributes).toEqual([]);
  });

  it("keeps a count the author wrote when it is the larger", () => {
    const tree = run(
      jsx("mdxJsxFlowElement", "Steps", { count: "6" }, [
        jsx("mdxJsxFlowElement", "Reveal", { at: "1" }),
      ]),
    );
    expect(outline(tree)).toEqual(["Steps count=6"]);
  });

  it("shows a fenced d2 block as code, not as a drawing", () => {
    const tree = run({ type: "code", lang: "d2", value: "a: {class: at-1}" });
    expect(outline(tree)).toEqual(["code"]);
  });

  it("refuses a reveal whose step is not a number literal", () => {
    expect(() =>
      run(jsx("mdxJsxFlowElement", "Reveal", { at: "next" })),
    ).toThrow(/guide\.mdx:3: <Reveal at> is not a number/u);
  });

  it("leaves a slide alone", () => {
    const tree = {
      type: "root",
      children: [jsx("mdxJsxFlowElement", "Reveal", { at: "1" })],
    } as Root;
    plugin(tree, { path: "/decks/tour/1-start.mdx" } as never);
    expect(outline(tree)).toEqual(["mdxJsxFlowElement"]);
  });
});
