import type { Root, RootContent } from "mdast";
import type {
  MdxJsxAttribute,
  MdxJsxFlowElement,
  MdxJsxTextElement,
} from "mdast-util-mdx-jsx";
import type { VFile } from "vfile";

/**
 * Injects each docs `<Stage>`'s Code-tab source at MDX compile time: the JSX
 * authored inside the Stage is sliced verbatim from the MDX file (handlers,
 * expressions and formatting exactly as written) and passed to Stage as its
 * `code` prop. A `code` attribute written in the MDX wins; those Stages are
 * left alone.
 *
 * Demo-harness elements opt out of the shown code with a `data-harness`
 * attribute. Bare (`<DemoState data-harness>`) the element's tags disappear
 * and its children are spliced in their place, re-indented one level out;
 * `data-harness="omit"` drops the whole subtree. The attribute is consumed
 * here — it is stripped from every element before the MDX compiles, so no
 * component receives it at runtime. Harnesses the splice can't make copyable
 * (render props binding state into their children) keep explicit `code`
 * overrides instead.
 */

type JsxElement = MdxJsxFlowElement | MdxJsxTextElement;
type TreeNode = Root | RootContent;

interface RenderContext {
  source: string;
  file: VFile;
}

const stageName = "Stage";
const harnessAttribute = "data-harness";

const isJsxElement = (node: TreeNode): node is JsxElement =>
  node.type === "mdxJsxFlowElement" || node.type === "mdxJsxTextElement";

const findAttribute = (
  node: JsxElement,
  name: string,
): MdxJsxAttribute | undefined =>
  node.attributes.find(
    (attribute): attribute is MdxJsxAttribute =>
      attribute.type === "mdxJsxAttribute" && attribute.name === name,
  );

const harnessMode = (
  node: JsxElement,
  file: VFile,
): "unwrap" | "omit" | null => {
  const attribute = findAttribute(node, harnessAttribute);
  if (attribute === undefined) {
    return null;
  }
  if (attribute.value === null || attribute.value === undefined) {
    return "unwrap";
  }
  if (attribute.value === "omit") {
    return "omit";
  }
  return file.fail(
    `\`${harnessAttribute}\` must be bare (hide the element, keep its children) or "omit" (drop the subtree)`,
    node,
  );
};

const containsHarness = (node: TreeNode): boolean =>
  (isJsxElement(node) && findAttribute(node, harnessAttribute) !== undefined) ||
  ("children" in node && node.children.some(containsHarness));

const nodeSpan = (
  node: TreeNode,
  file: VFile,
): { start: number; end: number; column: number } => {
  const start = node.position?.start.offset;
  const end = node.position?.end.offset;
  const column = node.position?.start.column;
  if (start === undefined || end === undefined || column === undefined) {
    return file.fail("expected position information on MDX node");
  }
  return { start, end, column };
};

/**
 * Re-indents a source slice: the first line starts at the slice's own
 * position (its original indentation is not part of the slice), so it only
 * gains the target pad; continuation lines shed the slice's original
 * indentation before gaining it.
 */
const reindent = (
  text: string,
  sourceIndent: number,
  targetIndent: number,
): string[] => {
  const pad = " ".repeat(targetIndent);
  return text.split("\n").map((line, lineIndex) => {
    if (lineIndex === 0) {
      return pad + line;
    }
    if (line.trim() === "") {
      return "";
    }
    const leading = line.length - line.trimStart().length;
    return pad + line.slice(Math.min(leading, sourceIndent));
  });
};

const blankLineBetween = (
  source: string,
  previousEnd: number,
  nextStart: number,
): boolean => {
  const between = source.slice(previousEnd, nextStart);
  return between.split("\n").length > 2;
};

const renderChildren = (
  children: TreeNode[],
  indent: number,
  context: RenderContext,
): string[] => {
  const lines: string[] = [];
  let previousEnd: number | null = null;
  let pendingBlank = false;
  for (const child of children) {
    if (child.type === "text" && child.value.trim() === "") {
      // Whitespace-only text is the inter-sibling gap itself: leave its span
      // unconsumed so blankLineBetween still sees it.
      continue;
    }
    const rendered = renderNode(child, indent, context);
    const { start, end } = nodeSpan(child, context.file);
    const blankBefore: boolean =
      pendingBlank ||
      (previousEnd !== null &&
        blankLineBetween(context.source, previousEnd, start));
    previousEnd = end;
    if (rendered.length === 0) {
      // An omitted node's span is content, not gap: consume it so its own
      // lines don't read as a blank line, but carry a blank authored before
      // it forward to the next kept sibling.
      pendingBlank = blankBefore;
      continue;
    }
    if (lines.length > 0 && blankBefore) {
      lines.push("");
    }
    pendingBlank = false;
    lines.push(...rendered);
  }
  return lines;
};

const renderNode = (
  node: TreeNode,
  indent: number,
  context: RenderContext,
): string[] => {
  if (isJsxElement(node)) {
    const mode = harnessMode(node, context.file);
    if (mode === "omit") {
      return [];
    }
    if (mode === "unwrap") {
      return renderChildren(node.children, indent, context);
    }
  }
  const { start, end, column } = nodeSpan(node, context.file);
  if (!containsHarness(node)) {
    return reindent(context.source.slice(start, end), column - 1, indent);
  }
  // A harness element hides somewhere below a visible element: keep this
  // node's own tags (sliced from source) and splice the children between
  // them.
  if (isJsxElement(node)) {
    const firstChild = node.children.at(0);
    const lastChild = node.children.at(-1);
    if (firstChild === undefined || lastChild === undefined) {
      return reindent(context.source.slice(start, end), column - 1, indent);
    }
    const { start: firstStart } = nodeSpan(firstChild, context.file);
    const { end: lastEnd } = nodeSpan(lastChild, context.file);
    const opening = context.source.slice(start, firstStart).trimEnd();
    const closing = context.source.slice(lastEnd, end).trimStart();
    return [
      ...reindent(opening, column - 1, indent),
      ...renderChildren(node.children, indent + 2, context),
      " ".repeat(indent) + closing,
    ];
  }
  // Markdown wrapper (e.g. a paragraph) around a harness element: it has no
  // authored tags of its own, so render the children in place.
  return "children" in node
    ? renderChildren(node.children, indent, context)
    : reindent(context.source.slice(start, end), column - 1, indent);
};

const visitJsxElements = (
  node: TreeNode,
  visitor: (element: JsxElement) => void,
): void => {
  if (isJsxElement(node)) {
    visitor(node);
  }
  if ("children" in node) {
    for (const child of node.children) {
      visitJsxElements(child, visitor);
    }
  }
};

export const remarkStageCode = () => (tree: Root, file: VFile) => {
  const context: RenderContext = { source: String(file.value), file };
  visitJsxElements(tree, (element) => {
    if (element.type !== "mdxJsxFlowElement" || element.name !== stageName) {
      return;
    }
    if (findAttribute(element, "code") !== undefined) {
      return;
    }
    // `noop` is the serializable stand-in docs examples use for inline
    // handlers (see src/util/noop.ts), both as JSX attributes
    // (`onChange={noop}`) and object properties (`dismissible={{ onDismiss:
    // noop }}`); readers should copy the plain arrow it stands for.
    const code = renderChildren(element.children, 0, context)
      .join("\n")
      .replace(/=\{noop\}/g, "={() => {}}")
      .replace(/\b(on[A-Z]\w*): noop\b/g, "$1: () => {}");
    if (code !== "") {
      element.attributes.push({
        type: "mdxJsxAttribute",
        name: "code",
        value: code,
      });
    }
  });
  visitJsxElements(tree, (element) => {
    element.attributes = element.attributes.filter(
      (attribute) =>
        !(
          attribute.type === "mdxJsxAttribute" &&
          attribute.name === harnessAttribute
        ),
    );
  });
};
