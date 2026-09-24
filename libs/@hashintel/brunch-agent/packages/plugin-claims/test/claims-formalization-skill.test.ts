import { existsSync, readFileSync } from "node:fs";

import { expect, test } from "vitest";

const skillDirectory = new URL(
  "../src/skills/claims-formalization/",
  import.meta.url,
);

test("the skill names only resources in its directory", () => {
  const skillMarkdown = readFileSync(
    new URL("SKILL.md", skillDirectory),
    "utf8",
  );
  for (const referenced of skillMarkdown.matchAll(
    /`((?:references|templates)\/[\w-]+\.md)`/gu,
  )) {
    expect(existsSync(new URL(referenced[1]!, skillDirectory))).toBe(true);
  }
});
