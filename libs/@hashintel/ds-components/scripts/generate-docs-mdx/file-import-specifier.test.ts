import path from "node:path";

import { describe, expect, it } from "vitest";

import { fileImportSpecifier } from "./file-import-specifier";

describe("fileImportSpecifier", () => {
  it("returns a file:// URL rather than a bare resolved path", () => {
    const specifier = fileImportSpecifier(
      path.join(".build", "docs-mdx-check", "banner.mjs"),
    );
    expect(specifier.startsWith("file://")).toBe(true);
    expect(specifier.endsWith("/banner.mjs")).toBe(true);
  });
});
