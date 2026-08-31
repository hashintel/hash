/**
 * Rewrites a changed page's MDX so each differing block carries a marker.
 *
 * Markers are emitted *between* blocks rather than wrapping them: the shipped
 * `DiffMarker` component renders an invisible element and its stylesheet
 * decorates the next sibling, so the markdown itself is never nested inside
 * JSX and heading extraction, anchors and the table of contents behave exactly
 * as they do on an unannotated page. A removed run has no head block to mark,
 * so its marker is visible: it renders the removed source, collapsed.
 */

import { assetPathFrom } from "../emit/mdx";
import { DIFF_MARKER_MODULE } from "../emit/shipped-components";

import type { BlockDiff } from "./blocks";

/**
 * Splits a page into its frontmatter (empty when absent) and body, so blocks
 * can be diffed without the frontmatter counting as one of them.
 */
export const splitFrontmatter = (
  contents: string,
): { frontmatter: string; body: string } => {
  const match = /^---\n[\s\S]*?\n---\n/u.exec(contents);
  return match === null
    ? { frontmatter: "", body: contents }
    : { frontmatter: match[0], body: contents.slice(match[0].length) };
};

const marker = (status: "added" | "changed"): string =>
  `<DiffMarker status="${status}" />`;

const removedMarker = (baseBlocks: string[]): string =>
  `<DiffMarker status="removed" content={${JSON.stringify(baseBlocks.join("\n\n"))}} />`;

/**
 * Reassembles a page from its parts with markers inserted.
 *
 * Blocks are rejoined with single blank lines, which can differ from the
 * original spacing byte-for-byte but not in what MDX renders. Only pages that
 * actually get markers pass through here; an unchanged page keeps its
 * original bytes.
 */
export const annotatePageBlocks = (options: {
  slug: string;
  frontmatter: string;
  blocks: string[];
  diff: BlockDiff;
}): string => {
  const { slug, frontmatter, blocks, diff } = options;

  const importLine = `import { DiffMarker } from "${assetPathFrom(slug, `components/${DIFF_MARKER_MODULE}`)}";`;

  const parts: string[] = [];

  blocks.forEach((block, index) => {
    const removedHere = diff.removed.get(index);
    if (removedHere !== undefined) {
      parts.push(removedMarker(removedHere));
    }

    const status = diff.headStatuses[index] ?? "unchanged";
    if (status !== "unchanged") {
      parts.push(marker(status));
    }

    parts.push(block);
  });

  const removedAtEnd = diff.removed.get(blocks.length);
  if (removedAtEnd !== undefined) {
    parts.push(removedMarker(removedAtEnd));
  }

  return `${frontmatter}\n${importLine}\n\n${parts.join("\n\n")}\n`;
};
