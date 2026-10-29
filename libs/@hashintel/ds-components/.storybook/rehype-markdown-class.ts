import type { Root, RootContent } from "hast";
// Registers the mdxJsxFlowElement/mdxJsxTextElement node types on hast's
// content maps.
import type {} from "mdast-util-mdx-jsx";

/**
 * Stamps the `hash-md` class on every element the MDX compiler derived from
 * markdown. Literal JSX is a different node type and is never touched — and
 * markdown generated *inside* JSX children (e.g. the paragraph MDX wraps
 * around a multiline JSX child) is skipped too, so component content never
 * picks up docs typography. The docs prose rules in docs.css hang off this
 * class alone, which keeps them free of :not() guards.
 *
 * It also unwraps the paragraph MDX wraps around a JSX element's multiline
 * text children: inside a component that wrapper is an artifact, not authored
 * structure — a block element whose UA margins inflate fit-content components
 * (Chip) and whose element-ness defeats text-child detection (BreadCrumbs
 * label truncation). A lone paragraph unwraps; two or more are kept as
 * authored multi-paragraph content.
 */

const jsxNodeTypes = new Set(["mdxJsxFlowElement", "mdxJsxTextElement"]);

// addon-docs maps code to its own components and treats any extra className
// as "this is a fenced block" (and parses the language out of it), so code
// and pre must stay untagged.
const skippedTags = new Set(["code", "pre"]);

const markdownClass = "hash-md";

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

export const rehypeMarkdownClass = () => (tree: Root) => {
  tagNode(tree, false);
};
