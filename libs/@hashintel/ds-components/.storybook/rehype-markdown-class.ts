import type { Element, ElementContent, Root, RootContent } from "hast";
// Registers the mdxJsxFlowElement/mdxJsxTextElement node types on hast's
// content maps.
import type {} from "mdast-util-mdx-jsx";

/**
 * Keeps a docs site's prose typography off the self-styled doc blocks the
 * published MDX imports (Stage, ReferenceLinks, DoList/DontList, PropsTable, …)
 * — those blocks ship their own styles, so prose must not leak into the
 * properties they leave unset (link underlines, list margins, the inline-code
 * box in Stage's Code tab). Two strategies are offered via `mode`:
 *
 * - `"class"` (default) — stamp the `hash-md` class on every element the MDX
 *   compiler derived from markdown. Literal JSX is a different node type and is
 *   never touched; markdown generated *inside* JSX children is skipped too, so
 *   component content never picks up docs typography. The consuming site scopes
 *   its prose rules to that class (Storybook's `docs.css` does this, which keeps
 *   it free of `:not()` guards). This is what ds-components' own Storybook uses.
 *
 * - `"not-prose"` — wrap each top-level doc block in a `not-prose` element
 *   (tailwind-typography's native opt-out, which excludes the wrapper and its
 *   subtree from prose), so the consumer needs no CSS changes at all. The
 *   wrapper uses `display: contents`, so it adds no box and changes no layout.
 *   The blocks don't forward `className`, hence a wrapper. Scoped to pages that
 *   import `@hashintel/ds-components` so a globally-registered plugin leaves
 *   non-docs pages untouched.
 *
 * Both modes also unwrap the paragraph MDX wraps around a JSX element's
 * multiline text children: inside a component that wrapper is an artifact, not
 * authored structure — a block element whose UA margins inflate fit-content
 * components (Chip) and whose element-ness defeats text-child detection
 * (BreadCrumbs label truncation). A lone paragraph unwraps; two or more are
 * kept as authored multi-paragraph content.
 */

const jsxNodeTypes = new Set(["mdxJsxFlowElement", "mdxJsxTextElement"]);
const flowJsxType = "mdxJsxFlowElement";

// addon-docs maps code to its own components and treats any extra className
// as "this is a fenced block" (and parses the language out of it), so code
// and pre must stay untagged.
const skippedTags = new Set(["code", "pre"]);

const markdownClass = "hash-md";

// A page is a design-system docs page when it imports the package (the doc
// blocks are imported as `@hashintel/ds-components/docs/blocks/<x>`); the
// `not-prose` wrapping is scoped to such pages.
const dsComponentsPackage = "@hashintel/ds-components";

const isWhitespaceText = (node: RootContent): boolean =>
  node.type === "text" && node.value.trim() === "";

const unwrapLoneParagraph = (node: { children: RootContent[] }): void => {
  const significant = node.children.filter((child) => !isWhitespaceText(child));
  const [only] = significant;
  if (
    significant.length === 1 &&
    only !== undefined &&
    only.type === "element" &&
    only.tagName === "p"
  ) {
    node.children = node.children.flatMap((child) =>
      child === only ? only.children : [child],
    );
  }
};

// ── "class" mode ───────────────────────────────────────────────────────────
const tagNode = (node: Root | RootContent, insideJsx: boolean): void => {
  if (node.type === "element" && !insideJsx && !skippedTags.has(node.tagName)) {
    node.properties["className"] = [
      ...(node.properties["className"] ?? []),
      markdownClass,
    ];
  }
  if (jsxNodeTypes.has(node.type) && "children" in node) {
    unwrapLoneParagraph(node);
  }
  const childInsideJsx = insideJsx || jsxNodeTypes.has(node.type);
  if ("children" in node) {
    for (const child of node.children) {
      tagNode(child, childInsideJsx);
    }
  }
};

// ── "not-prose" mode ─────────────────────────────────────────────────────────
const importsDsComponents = (tree: Root): boolean =>
  tree.children.some((node) => {
    const esm = node as { type: string; value?: unknown };
    return (
      esm.type === "mdxjsEsm" &&
      typeof esm.value === "string" &&
      esm.value.includes(dsComponentsPackage)
    );
  });

const notProseWrapper = (child: RootContent): Element => ({
  type: "element",
  tagName: "div",
  properties: { className: ["not-prose"], style: "display: contents" },
  children: [child as ElementContent],
});

const wrapTopLevelBlocks = (node: { children: RootContent[] }): void => {
  node.children = node.children.map((child) =>
    child.type === flowJsxType ? notProseWrapper(child) : child,
  );
};

const wrapBlocks = (node: Root | RootContent, insideJsx: boolean): void => {
  if (jsxNodeTypes.has(node.type) && "children" in node) {
    unwrapLoneParagraph(node);
  }
  if (!("children" in node)) {
    return;
  }
  const childInsideJsx = insideJsx || jsxNodeTypes.has(node.type);
  for (const child of node.children) {
    wrapBlocks(child, childInsideJsx);
  }
  // Wrap blocks that sit at the top level, not ones already inside a block —
  // `childInsideJsx` is true exactly when this node's children are inside one.
  if (!childInsideJsx) {
    wrapTopLevelBlocks(node);
  }
};

export type RehypeMarkdownClassOptions = {
  /**
   * How docs prose typography is kept off the self-styled doc blocks:
   * `"class"` (default) stamps `hash-md` on markdown; `"not-prose"` wraps the
   * blocks in a `not-prose` element so the consumer needs no CSS changes.
   */
  mode?: "class" | "not-prose";
};

export const rehypeMarkdownClass =
  (options?: RehypeMarkdownClassOptions) => (tree: Root) => {
    if (options?.mode === "not-prose") {
      if (importsDsComponents(tree)) {
        wrapBlocks(tree, false);
      }
      return;
    }
    tagNode(tree, false);
  };
