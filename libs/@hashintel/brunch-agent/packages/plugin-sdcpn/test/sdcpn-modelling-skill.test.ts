import { readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

import { sdcpnModellingSkill } from "../src/skills/sdcpn-modelling/skill";

const skillDirectory = new URL(
  "../src/skills/sdcpn-modelling/",
  import.meta.url,
);
const readSkillFile = (fileName: string): string =>
  readFileSync(new URL(fileName, skillDirectory), "utf8");

describe("the authored sdcpn-modelling skill directory", () => {
  test("is one Flue skill whose packaged paths equal the authored paths", () => {
    expect(sdcpnModellingSkill.name).toBe("sdcpn-modelling");
    expect(sdcpnModellingSkill.description).toContain("process model");
    expect(Object.keys(sdcpnModellingSkill.files ?? {}).sort()).toEqual([
      "references/checks.md",
      "references/pn-construction.md",
      "references/profile.md",
      "templates/workpiece.md",
    ]);
    for (const path of Object.keys(sdcpnModellingSkill.files ?? {})) {
      expect(sdcpnModellingSkill.files?.[path]).toBe(readSkillFile(path));
    }
    expect(sdcpnModellingSkill.instructions).not.toMatch(/^---/u);
    expect(sdcpnModellingSkill.instructions).toContain(
      "# Capability-aware lifecycle",
    );
  });

  test("routes universal judgment to core's elicitation skill instead of packaging it", () => {
    const instructions = sdcpnModellingSkill.instructions;
    expect(instructions).toContain("Activate the `elicitation` skill");
    expect(Object.keys(sdcpnModellingSkill.files ?? {})).not.toContain(
      "references/universal-elicitation.md",
    );
    for (const referenced of instructions.matchAll(
      /`((?:references|templates)\/[\w-]+\.md)`/gu,
    )) {
      expect(sdcpnModellingSkill.files).toHaveProperty(referenced[1]!);
    }
  });

  test("keeps reusable teaching free of scenario nouns and target vocabulary leaks", () => {
    const profile = readSkillFile("references/profile.md");
    const workpiece = readSkillFile("templates/workpiece.md");
    const construction = readSkillFile("references/pn-construction.md");
    const checks = readSkillFile("references/checks.md");
    expect(profile).not.toMatch(/Vestera|truck fleet|semiconductor/iu);
    expect(workpiece).toContain(
      "Every operational claim has one authoritative home",
    );
    expect(checks).toContain("Tool-schema acceptance");
    expect(checks).toContain("Agent-reviewed structural correspondence");
    expect(checks).toContain("Behavioral execution or stronger analysis");
    expect(construction).toContain("getLatestNetDefinition");
    expect(construction).not.toContain("```json");
    expect(construction).not.toContain("```pn-json");
  });

  test("the always-on append routes to the job skill and stays compact", () => {
    const append = readFileSync(
      new URL("../src/prompts/APPEND_SYSTEM.md", import.meta.url),
      "utf8",
    );
    expect(append).toContain("Activate the `sdcpn-modelling` skill");
    expect(append).not.toContain("references/");
    expect(append).not.toContain("templates/");
    expect(append.split(/\s+/u).length).toBeLessThan(300);
  });
});
