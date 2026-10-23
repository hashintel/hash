/**
 * The ranking over the bundle's search documents: MiniSearch with the
 * title, heading and description weighted above the body, prefix matching
 * and a little fuzziness, the hits grouped under their pages in the order
 * the best hit of each page earned, each hit with an excerpt around its
 * first matched term.
 */

import type { SearchDocument } from "../../../src/bundle/search";
import type MiniSearch from "minisearch";

export interface ExcerptPart {
  text: string;
  matched: boolean;
}

export interface Hit {
  id: string;
  slug: string;
  heading: SearchDocument["heading"];
  score: number;
  excerpt: ExcerptPart[];
}

export interface HitGroup {
  slug: string;
  title: string;
  kind: SearchDocument["kind"];
  hits: Hit[];
}

export interface SearchEngine {
  search: (query: string) => HitGroup[];
}

const maxHits = 30;
const hitsPerPage = 3;
const excerptRadius = 70;

const escapeRegExp = (text: string): string =>
  text.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");

/** The text around the first matched term, the matches marked. */
export const excerptOf = (text: string, terms: string[]): ExcerptPart[] => {
  if (terms.length === 0 || text === "") {
    return [{ text: text.slice(0, 2 * excerptRadius), matched: false }];
  }
  const pattern = new RegExp(
    `\\b(${terms.map(escapeRegExp).join("|")})`,
    "giu",
  );
  const first = pattern.exec(text);
  const start = first === null ? 0 : Math.max(0, first.index - excerptRadius);
  const end = Math.min(text.length, start + 2 * excerptRadius + 20);
  const window = `${start > 0 ? "…" : ""}${text.slice(start, end)}${end < text.length ? "…" : ""}`;
  const parts: ExcerptPart[] = [];
  let cursor = 0;
  // `exec` above moved the pattern's cursor, and `matchAll` would start there.
  pattern.lastIndex = 0;
  for (const match of window.matchAll(pattern)) {
    if (match.index > cursor) {
      parts.push({ text: window.slice(cursor, match.index), matched: false });
    }
    parts.push({ text: match[0], matched: true });
    cursor = match.index + match[0].length;
  }
  if (cursor < window.length) {
    parts.push({ text: window.slice(cursor), matched: false });
  }
  return parts;
};

export const createEngine = (
  Engine: typeof MiniSearch,
  documents: SearchDocument[],
): SearchEngine => {
  const index = new Engine<SearchDocument>({
    fields: ["title", "headingText", "description", "text"],
    storeFields: ["slug", "title", "description", "kind", "heading", "text"],
    // The heading's text is indexed; the heading itself is stored whole.
    extractField: (document, field) =>
      field === "headingText"
        ? (document.heading?.text ?? "")
        : (document[field as keyof SearchDocument] as string),
    searchOptions: {
      boost: { title: 4, headingText: 3, description: 2 },
      prefix: true,
      fuzzy: 0.15,
      combineWith: "AND",
    },
  });
  index.addAll(documents);

  return {
    search: (query) => {
      if (query.trim() === "") {
        return [];
      }
      const groups = new Map<string, HitGroup>();
      let count = 0;
      for (const result of index.search(query)) {
        if (count >= maxHits) {
          break;
        }
        const document = result as unknown as SearchDocument & {
          score: number;
          terms: string[];
        };
        const group = groups.get(document.slug) ?? {
          slug: document.slug,
          title: document.title,
          kind: document.kind,
          hits: [],
        };
        if (group.hits.length >= hitsPerPage) {
          continue;
        }
        group.hits.push({
          id: document.id,
          slug: document.slug,
          heading: document.heading,
          score: document.score,
          excerpt: excerptOf(document.text, document.terms),
        });
        groups.set(document.slug, group);
        count += 1;
      }
      return [...groups.values()];
    },
  };
};
