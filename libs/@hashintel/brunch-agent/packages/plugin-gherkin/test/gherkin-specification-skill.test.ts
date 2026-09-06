import { readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

import { gherkinSpecificationSkill } from "../src/skills/gherkin-specification/skill";

const skillDirectory = new URL(
  "../src/skills/gherkin-specification/",
  import.meta.url,
);
const readSkillFile = (fileName: string): string =>
  readFileSync(new URL(fileName, skillDirectory), "utf8");

describe("the authored gherkin-specification skill directory", () => {
  test("is one Flue skill whose packaged paths equal the authored paths", () => {
    expect(gherkinSpecificationSkill.name).toBe("gherkin-specification");
    expect(Object.keys(gherkinSpecificationSkill.files ?? {}).sort()).toEqual([
      "references/gherkin-authoring-and-checks.md",
      "references/gherkin-elicitation.md",
      "templates/workpiece.md",
    ]);
    for (const path of Object.keys(gherkinSpecificationSkill.files ?? {})) {
      expect(gherkinSpecificationSkill.files?.[path]).toBe(readSkillFile(path));
    }
  });

  test("routes universal judgment to core's elicitation skill and names only packaged resources", () => {
    const instructions = gherkinSpecificationSkill.instructions;
    expect(instructions).toContain("Activate the `elicitation` skill");
    for (const referenced of instructions.matchAll(
      /`((?:references|templates)\/[\w-]+\.md)`/gu,
    )) {
      expect(gherkinSpecificationSkill.files).toHaveProperty(referenced[1]!);
    }
  });
});
