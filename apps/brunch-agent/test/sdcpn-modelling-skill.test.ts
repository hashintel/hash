import { readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

const skillDirectory = new URL(
  "../src/skills/sdcpn-modelling/",
  import.meta.url,
);
const resourceFiles = [
  "elicitation.md",
  "ir-template.md",
  "pn-construction.md",
  "checks.md",
] as const;

const readSkillFile = (fileName: string): string =>
  readFileSync(new URL(fileName, skillDirectory), "utf8");

describe("the authored sdcpn-modelling skill", () => {
  test("has spec-valid routing frontmatter and four supporting resources", () => {
    const skill = readSkillFile("SKILL.md");
    expect(skill).toMatch(/^---\nname: sdcpn-modelling\n/u);
    expect(skill).toMatch(/^description: .+Use when .+\n/mu);
    expect(skill).toContain("# Lifecycle");
    expect(resourceFiles.map(readSkillFile)).toHaveLength(4);
  });

  test("keeps reusable teaching separate from the scenario and payload contract", () => {
    const elicitation = readSkillFile("elicitation.md");
    const construction = readSkillFile("pn-construction.md");
    expect(elicitation).toContain("provenance: universal");
    expect(elicitation).not.toMatch(/Vestera|truck fleet|semiconductor/iu);
    expect(construction).toContain("Timed work");
    expect(construction).toContain("getLatestNetDefinition");
    expect(construction).not.toContain("```json");
    expect(construction).not.toContain("```pn-json");
  });
});
