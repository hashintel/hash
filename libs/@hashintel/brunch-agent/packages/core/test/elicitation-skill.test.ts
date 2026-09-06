import { describe, expect, test } from "vitest";

import { elicitationSkill } from "../src/skills/elicitation/skill";
import { skillFromMarkdown } from "../src/skills/skill-markdown";

describe("the authored elicitation skill", () => {
  test("loads its universal guidance on activation without a mandatory resource read", () => {
    expect(elicitationSkill.name).toBe("elicitation");
    expect(elicitationSkill.files).toBeUndefined();
    expect(elicitationSkill.instructions).toContain("# Adaptive elicitation");
    expect(elicitationSkill.instructions).toContain("## Directives");
    expect(elicitationSkill.instructions).toContain("## Operations");
    expect(elicitationSkill.instructions).toContain("## Coverage");
    expect(elicitationSkill.instructions).toContain("## Verification");
    expect(elicitationSkill.instructions).not.toContain(
      "references/universal-elicitation.md",
    );
  });

  test("parses frontmatter fields without interpreting field names as patterns", () => {
    const skill = skillFromMarkdown(
      "---\r\nname: example\r\ndescription: Example skill\r\n---\r\nDo the work.\r\n",
    );

    expect(skill).toMatchObject({
      name: "example",
      description: "Example skill",
      instructions: "Do the work.",
    });
  });
});
