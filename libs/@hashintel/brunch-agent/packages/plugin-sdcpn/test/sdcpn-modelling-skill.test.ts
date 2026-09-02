import { readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

const skillDirectory = new URL(
  "../src/skills/sdcpn-modelling/",
  import.meta.url,
);
const resourceFiles = [
  "instructions.md",
  "profile.md",
  "workpiece-template.md",
  "pn-construction.md",
  "checks.md",
] as const;

const readSkillFile = (fileName: string): string =>
  readFileSync(new URL(fileName, skillDirectory), "utf8");

describe("the authored sdcpn-modelling skill", () => {
  test("assembles one job skill from core and plugin-authored resources", () => {
    const skillModule = readSkillFile("skill.ts");
    expect(skillModule).toContain("defineSkill");
    expect(skillModule).toContain("universalElicitationReference");
    expect(skillModule).toContain('"references/universal-elicitation.md"');
    expect(resourceFiles.map(readSkillFile)).toHaveLength(5);
  });

  test("keeps reusable teaching separate from the scenario and payload contract", () => {
    const instructions = readSkillFile("instructions.md");
    const profile = readSkillFile("profile.md");
    const workpiece = readSkillFile("workpiece-template.md");
    const construction = readSkillFile("pn-construction.md");
    const checks = readSkillFile("checks.md");
    expect(instructions).toMatch(/ask exactly one focused question/u);
    expect(instructions).toMatch(
      /Read `templates\/workpiece\.md` only when first creating or materially revising\s+the workpiece/u,
    );
    expect(instructions).toMatch(
      /If it already answers\s+the question, answer without reading the elicitation references or interviewing/u,
    );
    expect(profile).not.toMatch(/Vestera|truck fleet|semiconductor/iu);
    expect(workpiece).toContain(
      "Every operational claim has one authoritative home",
    );
    expect(construction).toContain("Petrinaut tool sequence");
    expect(checks).toContain("Tool-schema acceptance");
    expect(checks).toContain("Agent-reviewed structural correspondence");
    expect(checks).toContain("Behavioral execution or stronger analysis");
    expect(construction).toContain("getLatestNetDefinition");
    expect(construction).not.toContain("```json");
    expect(construction).not.toContain("```pn-json");
  });

  test("routes elicitation, review, revision, and construction through the job skill", () => {
    const append = readFileSync(
      new URL("../src/APPEND_SYSTEM.md", import.meta.url),
      "utf8",
    );
    expect(append).toContain(
      "substantive elicitation, review, workpiece revision, or construction",
    );
    expect(append).toContain("Activate the `sdcpn-modelling` skill");
  });
});
