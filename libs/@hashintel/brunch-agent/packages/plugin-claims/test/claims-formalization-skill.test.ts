import { readFileSync } from "node:fs";

import { expect, test } from "vitest";

import { claimsFormalizationSkill } from "../src/skills/claims-formalization/skill";

const skillDirectory = new URL(
  "../src/skills/claims-formalization/",
  import.meta.url,
);
const readSkillFile = (fileName: string): string =>
  readFileSync(new URL(fileName, skillDirectory), "utf8");

test("the skill is a valid Flue skill whose packaged paths equal the authored paths", () => {
  expect(claimsFormalizationSkill.name).toBe("claims-formalization");
  expect(claimsFormalizationSkill.instructions).toContain(
    "Aligned to core as of",
  );
  expect(Object.keys(claimsFormalizationSkill.files ?? {}).sort()).toEqual([
    "references/cards-and-standing.md",
    "references/claims-elicitation.md",
    "templates/workpiece.md",
  ]);
  for (const path of Object.keys(claimsFormalizationSkill.files ?? {})) {
    expect(claimsFormalizationSkill.files?.[path]).toBe(readSkillFile(path));
  }
});
