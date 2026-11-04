import { describe, expect, it } from "vitest";

import { headingsOf } from "./headings";

describe("headingsOf", () => {
  it("lists second and third level headings with the ids the page will carry", () => {
    expect(
      headingsOf(
        "# Title\n\nIntro.\n\n## What the API is\n\nText.\n\n### A `code` sub-heading\n\n#### Too deep\n\n## What the API is\n",
      ),
    ).toEqual([
      { depth: 2, slug: "what-the-api-is", text: "What the API is" },
      { depth: 3, slug: "a-code-sub-heading", text: "A code sub-heading" },
      { depth: 2, slug: "what-the-api-is-1", text: "What the API is" },
    ]);
  });

  it("ignores headings inside code fences and strips links and emphasis", () => {
    expect(
      headingsOf(
        "## Real\n\n```md\n## Not a heading\n```\n\n## See [the handle](layer:core.handle) *now*\n",
      ),
    ).toEqual([
      { depth: 2, slug: "real", text: "Real" },
      { depth: 2, slug: "see-the-handle-now", text: "See the handle now" },
    ]);
  });
});
