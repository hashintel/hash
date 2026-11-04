/**
 * The sections of a page, as "On this page" and the search index see them:
 * every `##` and `###` outside a code fence opens one, with the id
 * `rehype-slug` will give the heading, so the manifest and the index carry
 * what a host needs without parsing the page again.
 */

import GithubSlugger from "github-slugger";

export interface PageHeading {
  /** 2 or 3. */
  depth: number;
  /** The id the heading element carries in the rendered page. */
  slug: string;
  text: string;
}

export interface PageSection {
  /** Null for the lead, before the first heading. */
  heading: PageHeading | null;
  /** The section's lines, as written, headings excluded. */
  lines: string[];
}

const headingPattern = /^(#{2,3})\s+(.+?)\s*#*\s*$/u;

/** Markdown inline syntax reduced to the text a reader sees. */
const plainText = (markdown: string): string =>
  markdown
    .replace(/!?\[([^\]]*)\]\([^)]*\)/gu, "$1")
    .replace(/<[^>]+>/gu, "")
    .replace(/[`*_~]/gu, "")
    .trim();

export const sectionsOf = (contents: string): PageSection[] => {
  const slugger = new GithubSlugger();
  const sections: PageSection[] = [{ heading: null, lines: [] }];
  let inFence = false;
  for (const line of contents.split("\n")) {
    if (/^\s*(```|~~~)/u.test(line)) {
      inFence = !inFence;
      sections.at(-1)?.lines.push(line);
      continue;
    }
    const match = inFence ? null : headingPattern.exec(line);
    if (match === null) {
      sections.at(-1)?.lines.push(line);
      continue;
    }
    const text = plainText(match[2] ?? "");
    sections.push({
      heading: {
        depth: (match[1] ?? "##").length,
        slug: slugger.slug(text),
        text,
      },
      lines: [],
    });
  }
  return sections;
};

export const headingsOf = (contents: string): PageHeading[] =>
  sectionsOf(contents).flatMap((section) =>
    section.heading === null ? [] : [section.heading],
  );
