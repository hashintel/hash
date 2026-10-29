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

// An MDX `import … from "<source>"` statement, as it appears in the hast tree.
const esmImport = (source: string): Root["children"][number] =>
  ({
    type: "mdxjsEsm",
    value: `import { Stage } from "${source}";`,
  }) as unknown as Root["children"][number];

const runNotProse = (children: Root["children"]): Root => {
  const tree: Root = { type: "root", children };
  rehypeMarkdownClass({ mode: "not-prose" })(tree);
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

describe("rehypeMarkdownClass not-prose mode", () => {
  it("wraps top-level doc blocks in a not-prose element, leaving markdown", () => {
    const block = jsxElement([paragraph("Inside")]);
    const prose = paragraph();
    const tree = runNotProse([
      esmImport("@hashintel/ds-components/docs/blocks/stage"),
      block,
      prose,
    ]);

    const wrapper = tree.children[1] as Element;
    expect(wrapper.tagName).toBe("div");
    expect(wrapper.properties["className"]).toEqual(["not-prose"]);
    expect(wrapper.properties["style"]).toBe("display: contents");
    expect(wrapper.children[0]).toBe(block);
    // Markdown siblings stay in place and are not stamped with `hash-md`.
    expect(tree.children[2]).toBe(prose);
    expect(prose.properties["className"]).toBeUndefined();
  });

  it("does not wrap blocks nested inside another block", () => {
    const inner = jsxElement([paragraph("Deep")]);
    const outer = jsxElement([inner]);
    runNotProse([esmImport("@hashintel/ds-components/button"), outer]);
    // The inner block is still a direct child of the outer block, not wrapped.
    expect(outer.children[0]).toBe(inner);
  });

  it("leaves pages that do not import the package untouched", () => {
    const block = jsxElement([paragraph("Inside")]);
    const tree = runNotProse([block, paragraph()]);
    expect(tree.children[0]).toBe(block);
  });
});
