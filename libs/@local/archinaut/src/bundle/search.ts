/**
 * The search index: every page of the bundle cut into its sections, each
 * reduced to the text a reader sees, so a host can search the docs without
 * a build step of its own and land on the section that matched. Plain
 * JSON and no ranking: which engine to search it with is the host's call.
 */

import { sectionsOf } from "./headings";

export const SEARCH_INDEX_VERSION = 1;

export interface SearchDocument {
  /** The page slug, plus `#` and the heading slug for a section below the lead. */
  id: string;
  slug: string;
  title: string;
  description: string;
  kind: "generated" | "authored";
  /** The section's heading, or null for the page's lead. */
  heading: { text: string; slug: string } | null;
  /** The section's text, with markdown and MDX syntax removed. */
  text: string;
}

export interface SearchIndex {
  version: number;
  documents: SearchDocument[];
}

const frontmatterPattern = /^---\n[\s\S]*?\n---\n?/u;

/**
 * An MDX section's lines as the text a reader sees: no ESM, no JSX, no
 * fences, no aside markers, no page title, and markdown reduced to its
 * text. Tags are removed after the lines are joined, since a component
 * with its props on several lines is one tag.
 */
export const plainTextOf = (lines: string[]): string =>
  lines
    .filter((line) => !/^\s*(import|export)\s/u.test(line))
    .filter((line) => !/^\s*(```|~~~)/u.test(line))
    .filter((line) => !/^\s*:::/u.test(line))
    .filter((line) => !/^\s*#\s/u.test(line))
    .map((line) =>
      line
        .replace(/!\[([^\]]*)\]\([^)]*\)/gu, "$1")
        .replace(/\[([^\]]*)\]\([^)]*\)/gu, "$1")
        .replace(/^\s*#{2,6}\s+/u, "")
        .replace(/^\s*(?:[-*+]|\d+\.)\s+/u, "")
        .replace(/^\s*>\s?/u, "")
        .replace(/\|/gu, " ")
        .replace(/^[\s:-]+$/u, ""),
    )
    .join(" ")
    .replace(/<\/?[A-Za-z][^>]*>/gu, " ")
    .replace(/\{[^{}]*\}/gu, " ")
    .replace(/[`*_~]/gu, "")
    .replace(/\s+/gu, " ")
    .trim();

export const buildSearchIndex = (
  pages: {
    slug: string;
    title: string;
    description: string;
    kind: "generated" | "authored";
    contents: string;
  }[],
): SearchIndex => ({
  version: SEARCH_INDEX_VERSION,
  documents: pages.flatMap((page) =>
    sectionsOf(page.contents.replace(frontmatterPattern, "")).flatMap(
      (section) => {
        const text = plainTextOf(section.lines);
        if (text === "" && section.heading === null) {
          return [];
        }
        return [
          {
            id:
              section.heading === null
                ? page.slug
                : `${page.slug}#${section.heading.slug}`,
            slug: page.slug,
            title: page.title,
            description: page.description,
            kind: page.kind,
            heading:
              section.heading === null
                ? null
                : { text: section.heading.text, slug: section.heading.slug },
            text,
          },
        ];
      },
    ),
  ),
});
