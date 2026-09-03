import { describe, expect, test } from "vitest";

import { elicitationSkill } from "../src/skills/elicitation/skill";

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
});
