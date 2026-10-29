import { describe, expect, it } from "vitest";

import { rehypeMarkdownClass } from "./rehype-markdown-class";

import type { Element, ElementContent, Root } from "hast";
import type { MdxJsxFlowElementHast } from "mdast-util-mdx-jsx";

const paragraph = (text = "Prose"): Element => ({
  type: "element",
  tagName: "p",
  properties: {},
  children: [{ type: "text", value: text }],
});

const jsxElement = (children: ElementContent[]): MdxJsxFlowElementHast => ({
  type: "mdxJsxFlowElement",
  name: "Stage",
  attributes: [],
  children,
});

const run = (children: Root["children"]): Root => {
  const tree: Root = { type: "root", children };
  rehypeMarkdownClass()(tree);
  return tree;
};

describe("rehypeMarkdownClass", () => {
  it("tags markdown-derived elements, including nested ones", () => {
    const item: Element = {
      type: "element",
      tagName: "li",
      properties: {},
      children: [{ type: "text", value: "Entry" }],
    };
    const list: Element = {
      type: "element",
      tagName: "ul",
      properties: {},
      children: [item],
    };
    run([list]);
    expect(list.properties["className"]).toEqual(["hash-md"]);
    expect(item.properties["className"]).toEqual(["hash-md"]);
  });

  it("appends to existing classes without replacing them", () => {
    const withClasses = paragraph();
    withClasses.properties["className"] = ["intro", "wide"];
    run([withClasses]);
    expect(withClasses.properties["className"]).toEqual([
      "intro",
      "wide",
      "hash-md",
    ]);
  });

  it("leaves JSX elements and markdown generated inside them untouched", () => {
    const insideJsx = paragraph("MDX wraps multiline JSX children");
    const sibling = paragraph();
    run([jsxElement([insideJsx]), sibling]);
    expect(insideJsx.properties["className"]).toBeUndefined();
    expect(sibling.properties["className"]).toEqual(["hash-md"]);
  });

  it("keeps code and pre untagged for addon-docs", () => {
    const code: Element = {
      type: "element",
      tagName: "code",
      properties: {},
      children: [{ type: "text", value: "const x = 1;" }],
    };
    const pre: Element = {
      type: "element",
      tagName: "pre",
      properties: {},
      children: [code],
    };
    run([pre]);
    expect(pre.properties["className"]).toBeUndefined();
    expect(code.properties["className"]).toBeUndefined();
  });
});
