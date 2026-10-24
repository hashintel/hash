/**
 * Stamps the `hash-md` class on every element the MDX compiler derived from
 * markdown. Literal JSX is a different node type and is never touched — and
 * markdown generated *inside* JSX children (e.g. the paragraph MDX wraps
 * around a multiline JSX child) is skipped too, so component content never
 * picks up docs typography. The docs prose rules in docs.css hang off this
 * class alone, which keeps them free of :not() guards.
 */

type HastNode = {
  type: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
};

const jsxNodeTypes = new Set(["mdxJsxFlowElement", "mdxJsxTextElement"]);

// addon-docs maps code to its own components and treats any extra className
// as "this is a fenced block" (and parses the language out of it), so code
// and pre must stay untagged.
const skippedTags = new Set(["code", "pre"]);

const markdownClass = "hash-md";

const tagNode = (node: HastNode, insideJsx: boolean): void => {
  if (
    node.type === "element" &&
    !insideJsx &&
    !skippedTags.has(node.tagName ?? "")
  ) {
    node.properties ??= {};
    const existing = node.properties["className"];
    node.properties["className"] = Array.isArray(existing)
      ? [...(existing as unknown[]), markdownClass]
      : typeof existing === "string"
        ? [existing, markdownClass]
        : [markdownClass];
  }
  const childInsideJsx = insideJsx || jsxNodeTypes.has(node.type);
  for (const child of node.children ?? []) {
    tagNode(child, childInsideJsx);
  }
};

export const rehypeMarkdownClass = () => (tree: HastNode) => {
  tagNode(tree, false);
};
