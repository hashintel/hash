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
  });

  test("names only packaged resources without duplicating universal guidance", () => {
    const instructions = sdcpnModellingSkill.instructions;
    expect(Object.keys(sdcpnModellingSkill.files ?? {})).not.toContain(
      "references/universal-elicitation.md",
    );
    for (const referenced of instructions.matchAll(
      /`((?:references|templates)\/[\w-]+\.md)`/gu,
    )) {
      expect(sdcpnModellingSkill.files).toHaveProperty(referenced[1]!);
    }
  });

  test("keeps packaged resources free of scenario nouns", () => {
    const profile = readSkillFile("references/profile.md");
    const workpiece = readSkillFile("templates/workpiece.md");
    const construction = readSkillFile("references/pn-construction.md");
    const checks = readSkillFile("references/checks.md");
    expect(profile).not.toMatch(/Vestera|truck fleet|semiconductor/iu);
    expect(workpiece).not.toMatch(/Vestera|truck fleet|semiconductor/iu);
    expect(construction).not.toMatch(/Vestera|truck fleet|semiconductor/iu);
    expect(checks).not.toMatch(/Vestera|truck fleet|semiconductor/iu);
  });

  test("names the mounted construction read tool", () => {
    const construction = readSkillFile("references/pn-construction.md");
    expect(construction).toContain("read_petrinaut_net");
  });

  test("reuses authoritative settlement carriage and limits settled locator reads to immediate construction", () => {
    const instructions = sdcpnModellingSkill.instructions;
    const construction = readSkillFile("references/pn-construction.md");

    expect(instructions).toContain(
      "submitted Markdown with its returned `revisionId` and `sha256` as authoritative",
    );
    expect(instructions).toContain(
      "Only when immediate construction needs settled-revision spans",
    );
    expect(construction).toContain(
      "Only when immediate construction needs settled-revision spans",
    );
    expect(construction).toContain(
      "`includeContent: false`, `includeSources: false`, and `locateTexts`",
    );
    expect(construction).not.toContain(
      "obtain the settled revision/hash and relevant passage spans",
    );
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
