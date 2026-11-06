import { describe, expect, it } from "vitest";

import { remarkSchemeLinks } from "./scheme-links.mjs";

import type { Root } from "mdast";

const linkTo = (url: string): Root => ({
  type: "root",
  children: [
    {
      type: "paragraph",
      children: [
        {
          type: "link",
          url,
          children: [{ type: "text", value: "x" }],
          position: {
            start: { line: 3, column: 1 },
            end: { line: 3, column: 9 },
          },
        },
      ],
    },
  ],
});

const urlOf = (tree: Root): string => {
  const [paragraph] = tree.children;
  const [link] = paragraph?.type === "paragraph" ? paragraph.children : [];
  return link?.type === "link" ? link.url : "";
};

const plugin = remarkSchemeLinks({
  slugs: new Set(["architecture/core/simulation", "two-execution-paths"]),
  docsDirectory: "/site/content/docs/",
});

describe("remarkSchemeLinks", () => {
  it("resolves layer and doc links in a slide, keeping the fragment", () => {
    const layer = linkTo("layer:core.simulation#memory");
    plugin(layer, { path: "/decks/tour/1.mdx" } as never);
    expect(urlOf(layer)).toBe("/architecture/core/simulation#memory");
    const doc = linkTo("doc:two-execution-paths");
    plugin(doc, { path: "/decks/tour/1.mdx" } as never);
    expect(urlOf(doc)).toBe("/two-execution-paths");
  });

  it("fails a slide whose link no page answers to", () => {
    expect(() =>
      plugin(linkTo("layer:core.nope"), { path: "/decks/tour/1.mdx" } as never),
    ).toThrow(/1\.mdx:3: layer:core\.nope/u);
  });

  it("leaves docs pages to the bundle", () => {
    const tree = linkTo("layer:core.nope");
    plugin(tree, { path: "/site/content/docs/a.mdx" } as never);
    expect(urlOf(tree)).toBe("layer:core.nope");
  });
});
