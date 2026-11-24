import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { collectAuthoredContent } from "./content";

describe("collectAuthoredContent", () => {
  it("ships a component with the files in its folder, and leaves the tests behind", async () => {
    const repoRoot = mkdtempSync(join(tmpdir(), "archinaut-content-"));
    const components = join(repoRoot, "content/components");
    mkdirSync(join(components, "playground"), { recursive: true });
    for (const name of [
      "playground.tsx",
      "playground/encode.ts",
      "playground/encode.test.ts",
      "playground/playground.css",
      "playground/notes.md",
    ]) {
      writeFileSync(join(components, name), "");
    }

    const content = await collectAuthoredContent({
      repoRoot,
      contentDirectory: "content",
    });

    expect(
      content.components.map((component) => component.path).sort(),
    ).toEqual([
      "components/playground.tsx",
      "components/playground/encode.ts",
      "components/playground/playground.css",
    ]);
    expect(content.pages).toEqual([]);
  });
});
