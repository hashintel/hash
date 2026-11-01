import { describe, expect, it } from "vitest";

import { headingsOf } from "./headings";
import { buildSearchIndex, plainTextOf } from "./search";

const page = {
  path: "pages/architecture/core/handle.mdx",
  slug: "architecture/core/handle",
  order: 0,
  title: "handle",
  description: "The document handle.",
  kind: "generated" as const,
  contents: `---
title: handle
---
import Flow from "./flow.d2";

# handle

Stateful handle wrapping a **document**, see [the guide](./guide).

## What the API is

<Flow />

- \`subscribe\` returns an unsubscribe function
- \`apply\` takes a *patch*

### A \`code\` sub-heading

\`\`\`ts
const handle = open(doc);
\`\`\`

:::note[Careful]
Patches are ordered.
:::

## What the API is
`,
};

describe("buildSearchIndex", () => {
  const { documents } = buildSearchIndex([page]);

  it("cuts a page into its lead and its sections, with the headings' ids", () => {
    expect(documents.map((document) => document.id)).toEqual([
      "architecture/core/handle",
      "architecture/core/handle#what-the-api-is",
      "architecture/core/handle#a-code-sub-heading",
      "architecture/core/handle#what-the-api-is-1",
    ]);
    expect(
      documents.slice(1).map((document) => document.heading?.slug),
    ).toEqual(headingsOf(page.contents).map((heading) => heading.slug));
  });

  it("reduces MDX to the text a reader sees", () => {
    expect(documents[0]?.text).toBe(
      "Stateful handle wrapping a document, see the guide.",
    );
    expect(documents[1]?.text).toBe(
      "subscribe returns an unsubscribe function apply takes a patch",
    );
    expect(documents[2]?.text).toBe(
      "const handle = open(doc); Patches are ordered.",
    );
  });

  it("carries the page's title, description and kind on every section", () => {
    expect(documents.every((document) => document.title === "handle")).toBe(
      true,
    );
    expect(documents.every((document) => document.kind === "generated")).toBe(
      true,
    );
  });
});

describe("plainTextOf", () => {
  it("drops table rules and keeps cell text", () => {
    expect(plainTextOf(["| a | b |", "| --- | --- |", "| 1 | 2 |"])).toBe(
      "a b 1 2",
    );
  });

  it("reduces mathematics to the names it mentions, and leaves code alone", () => {
    expect(
      plainTextOf([
        "Bins are $\\mathit{bins} = \\min(1024, n)$ per metric, and the",
        "bound is $$\\prod_i \\binom{n_i}{w_i}$$ over the arcs.",
        "$$",
        "\\lfloor 16384 / (4\\,\\mathit{metricCount}) \\rfloor",
        "$$",
        "```ts",
        "const label = `$${amount}`;",
        "```",
      ]),
    ).toBe(
      "Bins are bins = (1024, n) per metric, and the bound is i n i w i over the arcs. 16384 / (4 metricCount ) const label = $$ ;",
    );
  });
});
