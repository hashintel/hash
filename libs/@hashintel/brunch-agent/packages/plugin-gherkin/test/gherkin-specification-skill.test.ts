import { existsSync, readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

const skillDirectory = new URL(
  "../src/skills/gherkin-specification/",
  import.meta.url,
);

describe("the authored gherkin-specification skill directory", () => {
  test("names only resources in its directory and excludes the obsolete target vocabulary", () => {
    const skillMarkdown = readFileSync(
      new URL("SKILL.md", skillDirectory),
      "utf8",
    );
    expect(skillMarkdown).not.toContain("runbook-ir");
    for (const referenced of skillMarkdown.matchAll(
      /`((?:references|templates)\/[\w-]+\.md)`/gu,
    )) {
      expect(existsSync(new URL(referenced[1]!, skillDirectory))).toBe(true);
    }
  });
});
