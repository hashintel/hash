/**
 * The search index: every page of the bundle cut into its sections, each
 * reduced to the text a reader sees, so a host can search the docs without
 * a build step of its own and land on the section that matched. Plain
 * JSON and no ranking: which engine to search it with is the host's call.
 */

import { sectionsOf } from "./headings";

import type { BundlePage } from "./shared/bundle-page";

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
 * A TeX span reduced to the names and numbers it mentions: commands,
 * braces and the characters that only shape the formula go, so a search
 * for `bins` finds the formula that sizes them.
 */
const texToWords = (tex: string): string =>
  tex.replace(/\\[a-zA-Z]+|\\.|[{}^_&]/gu, " ");

/**
 * The lines with their mathematics reduced to words: a `$$` fence goes,
 * the lines between two and every `$…$` span are reduced by `texToWords`.
 * Fenced code is left alone, since a `$` there is code.
 */
const reduceMath = (lines: string[]): string[] => {
  const result: string[] = [];
  let inFence = false;
  let inMath = false;
  for (const line of lines) {
    if (/^\s*(```|~~~)/u.test(line)) {
      inFence = !inFence;
    }
    if (inFence) {
      result.push(line);
      continue;
    }
    if (/^\s*\$\$\s*$/u.test(line)) {
      inMath = !inMath;
      continue;
    }
    result.push(
      inMath
        ? texToWords(line)
        : line
            .replace(/\$\$([^$]+)\$\$/gu, (_match, tex: string) =>
              texToWords(tex),
            )
            .replace(/\$([^$]+)\$/gu, (_match, tex: string) => texToWords(tex)),
    );
  }
  return result;
};

/**
 * An MDX section's lines as the text a reader sees: no ESM, no JSX, no
 * fences, no aside markers, no page title, markdown reduced to its text
 * and mathematics to its words. Tags are removed after the lines are
 * joined, since a component with its props on several lines is one tag.
 */
export const plainTextOf = (lines: string[]): string =>
  reduceMath(lines)
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

export const buildSearchIndex = (pages: BundlePage[]): SearchIndex => ({
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
