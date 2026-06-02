import { describe, expect, test } from "vitest";

import { petrinautDocNames } from "@hashintel/petrinaut-core";

import { petrinautDocsContent, stripImages } from "./petrinaut-docs-content";

describe("stripImages", () => {
  test("removes HTML <img> tags", () => {
    const input = `Before
<img width="160" height="58" alt="add-place" src="https://example.com/x.png" />
After`;
    expect(stripImages(input)).toBe("Before\n\nAfter");
  });

  test("removes markdown image references", () => {
    const input = "Before\n![drawing-arc](https://example.com/arc.gif)\nAfter";
    expect(stripImages(input)).toBe("Before\n\nAfter");
  });

  test("collapses runs of blank lines left behind", () => {
    const input =
      'Para1\n\n<img alt="a" src="a" />\n\n<img alt="b" src="b" />\n\nPara2';
    const output = stripImages(input);
    expect(output).not.toMatch(/<img/);
    expect(output).not.toMatch(/\n{3,}/);
  });

  test("preserves non-image content", () => {
    const input = "# Title\n\nSome **bold** text and a [link](https://x.test).";
    expect(stripImages(input)).toBe(input);
  });
});

describe("petrinautDocsContent", () => {
  test("has an entry for every doc name and no embedded images", () => {
    for (const name of petrinautDocNames) {
      const content = petrinautDocsContent[name];
      expect(content.length).toBeGreaterThan(0);
      expect(content).not.toMatch(/<img\b/i);
      expect(content).not.toMatch(/!\[[^\]]*]\([^)]*\)/);
    }
  });
});
