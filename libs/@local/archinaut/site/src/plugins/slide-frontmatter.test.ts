import { describe, expect, it } from "vitest";

import { readSlideFrontmatter } from "./slide-frontmatter.mjs";

const read = (yaml: string) => readSlideFrontmatter(yaml, "tour/0-title.mdx");

describe("readSlideFrontmatter", () => {
  it("reads a title slide", () => {
    expect(
      read(
        [
          "layout: title",
          "title: A sample talk",
          "subtitle: One sentence on what the talk shows.",
          "author: Sam Speaker",
          "label: Petrinaut · 2026-11-03",
        ].join("\n"),
      ),
    ).toEqual({
      layout: "title",
      title: "A sample talk",
      subtitle: "One sentence on what the talk shows.",
      author: "Sam Speaker",
      label: "Petrinaut · 2026-11-03",
    });
  });

  it("reads notes by step, and nothing from an empty block", () => {
    expect(
      read(
        [
          "notes:",
          "  default: Start here.",
          "  byStep:",
          "    2: Then this.",
        ].join("\n"),
      ),
    ).toEqual({
      notes: { default: "Start here.", byStep: { 2: "Then this." } },
    });
    expect(read("")).toEqual({});
  });

  it("fails a typo, a subtitle off a title slide, and a title slide without a title", () => {
    expect(() => read("titel: Overview")).toThrow(/titel/u);
    expect(() => read("subtitle: Lost")).toThrow(/add `layout: title`/u);
    expect(() => read("layout: title")).toThrow(/needs a `title`/u);
    expect(() => read("label: 2026")).toThrow(/label/u);
    expect(() => read("notes:\n  byStep:\n    next: Say")).toThrow(
      /keyed by step number/u,
    );
  });

  it("names the slide when the YAML does not parse", () => {
    expect(() => read("title: [unclosed")).toThrow(
      /tour\/0-title\.mdx: the frontmatter is not YAML/u,
    );
  });
});
