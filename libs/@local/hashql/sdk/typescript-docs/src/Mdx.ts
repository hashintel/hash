import remarkFrontmatter from "remark-frontmatter";
import remarkMdx from "remark-mdx";
import remarkStringify from "remark-stringify";
import { unified } from "unified";

import type { Root } from "mdast";

// remark-mdx escapes the characters MDX would read as JSX or expressions.
const processor = unified()
  .use(remarkStringify, { bullet: "-", fences: true })
  .use(remarkFrontmatter)
  .use(remarkMdx);

/** Serializes a page's mdast, frontmatter included, as MDX. */
export const stringify = (tree: Root): string => processor.stringify(tree);
