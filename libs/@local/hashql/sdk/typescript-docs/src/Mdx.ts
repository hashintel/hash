import { Function, String } from "effect";
import remarkFrontmatter from "remark-frontmatter";
import remarkMdx from "remark-mdx";
import remarkStringify from "remark-stringify";
import { unified } from "unified";
import * as Yaml from "yaml";

import type { Root } from "mdast";

// remark-mdx escapes the characters MDX would read as JSX or expressions.
const processor = unified()
  .use(remarkStringify, { bullet: "-", fences: true })
  .use(remarkFrontmatter)
  .use(remarkMdx);

/** A page's frontmatter, which Fumadocs reads its title from. */
export interface Frontmatter {
  readonly title: string;
}

/** Serializes a page's mdast as MDX, under its frontmatter. */
export const stringify: {
  (frontmatter: Frontmatter): (tree: Root) => string;
  (tree: Root, frontmatter: Frontmatter): string;
} = Function.dual(2, (tree: Root, frontmatter: Frontmatter): string =>
  processor.stringify({
    ...tree,
    children: [
      { type: "yaml", value: String.trimEnd(Yaml.stringify(frontmatter)) },
      ...tree.children,
    ],
  }),
);
