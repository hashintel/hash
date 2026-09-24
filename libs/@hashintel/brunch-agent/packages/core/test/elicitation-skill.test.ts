import { readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

import { ELICITATION_SKILL_NAME, elicitationSkill } from "../src/agent";

const skillMarkdown = readFileSync(
  new URL("../src/skills/elicitation/SKILL.md", import.meta.url),
  "utf8",
);

describe("the authored elicitation skill", () => {
  test("is a Flue-packaged skill named by its own frontmatter", () => {
    expect(elicitationSkill.__flueSkillReference).toBe(true);
    expect(elicitationSkill.name).toBe("elicitation");
    expect(ELICITATION_SKILL_NAME).toBe(elicitationSkill.name);
  });

  test("loads its universal guidance on activation without a mandatory resource read", () => {
    expect(skillMarkdown).not.toContain("references/universal-elicitation.md");
  });
});
