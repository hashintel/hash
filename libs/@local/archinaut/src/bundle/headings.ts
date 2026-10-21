/**
 * The headings of a page, as "On this page" lists them: every `##` and
 * `###` outside a code fence, with the id `rehype-slug` will give it, so the
 * manifest carries what a host needs without parsing the page again.
 */

import GithubSlugger from "github-slugger";

export interface PageHeading {
  /** 2 or 3. */
  depth: number;
  /** The id the heading element carries in the rendered page. */
  slug: string;
  text: string;
}

const headingPattern = /^(#{2,3})\s+(.+?)\s*#*\s*$/u;

/** Markdown inline syntax reduced to the text a reader sees. */
const plainText = (markdown: string): string =>
  markdown
    .replace(/!?\[([^\]]*)\]\([^)]*\)/gu, "$1")
    .replace(/<[^>]+>/gu, "")
    .replace(/[`*_~]/gu, "")
    .trim();

export const headingsOf = (contents: string): PageHeading[] => {
  const slugger = new GithubSlugger();
  const headings: PageHeading[] = [];
  let inFence = false;
  for (const line of contents.split("\n")) {
    if (/^\s*(```|~~~)/u.test(line)) {
      inFence = !inFence;
      continue;
    }
    const match = inFence ? null : headingPattern.exec(line);
    if (match === null) {
      continue;
    }
    const text = plainText(match[2] ?? "");
    headings.push({
      depth: (match[1] ?? "##").length,
      slug: slugger.slug(text),
      text,
    });
  }
  return headings;
};
