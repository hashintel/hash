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
      "references/experiment-configuration.md",
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
    const experiment = readSkillFile("references/experiment-configuration.md");
    expect(profile).not.toMatch(/Vestera|truck fleet|semiconductor/iu);
    expect(workpiece).not.toMatch(/Vestera|truck fleet|semiconductor/iu);
    expect(construction).not.toMatch(/Vestera|truck fleet|semiconductor/iu);
    expect(checks).not.toMatch(/Vestera|truck fleet|semiconductor/iu);
    expect(experiment).not.toMatch(
      /Vestera|truck fleet|semiconductor|support desk|support operation|agents on duty|\bvans?\b|\bparcels?\b|\bSaturday\b|\bdepot\b/iu,
    );
  });

  describe("experiment readiness guidance", () => {
    const instructions = sdcpnModellingSkill.instructions;
    const experiment = readSkillFile("references/experiment-configuration.md");
    const construction = readSkillFile("references/pn-construction.md");

    test("is hooked into the Construct disposition, not a separate phase or keyword", () => {
      const construct = instructions.slice(
        instructions.indexOf("### Construct"),
        instructions.indexOf("### Check and deliver"),
      );
      expect(construct).toContain("references/experiment-configuration.md");
      expect(construct).toContain("ordinary construction");
      expect(construct).toContain(
        "Parameters or metrics in the net never trigger a proposal by themselves",
      );
      expect(instructions).not.toMatch(
        /asks? for an experiment|says? "optimi/iu,
      );
    });

    test("states readiness as the conjunction of workpiece meaning and net executability", () => {
      expect(experiment).toContain("**Readiness is the conjunction**");
      expect(experiment).toContain("Structure alone never triggers a proposal");
      expect(experiment).toContain(
        "The net alone never supplies the objective",
      );
      expect(experiment).toContain(
        "parameters and metrics recorded but no stated decision, there is nothing to propose",
      );
      for (const source of [
        "What the model must answer, compare, or support",
        "Goals, measures, constraints, and thresholds",
        "What the result must not claim",
        "definition.scenarios[]",
        "definition.metrics[]",
        "read_petrinaut_diagnostics",
      ]) {
        expect(experiment).toContain(source);
      }
    });

    test("teaches the request shape without a Brunch experiment schema or constraint claims", () => {
      for (const field of [
        'scenarioParameterValues[identifier] = { mode: "range", min, max }',
        "objectiveMetricId",
        "`scenarioId`",
        "`maxTime`, `dt`",
        "`runCount`, `runsPerStep`, `steps`, `seed`",
        "steps × runsPerStep ≤ 10,000",
      ]) {
        expect(experiment).toContain(field);
      }
      expect(experiment).toContain(
        "The request carries no constraints and no constraint policy",
      );
      expect(experiment).toContain("reported, not enforced");
      expect(experiment).toContain(
        "Never encode a hard restriction as an objective penalty",
      );
      expect(experiment).not.toMatch(/constraintPolicy|alpha|α/u);
    });

    test("names the draft tool, the honesty wording and the once-only rule", () => {
      expect(experiment).toContain("`draft_petrinaut_experiment`");
      expect(experiment).toContain(
        "{ experiment, declarations, basis, unsupported }",
      );
      expect(experiment).toContain(
        'Say "drafted for this session", not "added to the model"',
      );
      expect(experiment).toContain("you never call a run");
      expect(experiment).toContain("## Once, not repeatedly");
      expect(experiment).toContain('Treat an explicit "do not run"');
      expect(experiment).toContain("as authoritative");
      expect(experiment).toContain(
        "Run and Dismiss happen later in the card and are not reported",
      );
      expect(experiment).toContain(
        "do not infer any of those events or describe them as observed",
      );
      expect(experiment).not.toMatch(
        /After the person declines|experiment has completed/iu,
      );
      expect(experiment).toContain(
        "Do not apply a winning configuration to the model on your own",
      );
      expect(experiment).toContain(
        "Never open or pre-fill the experiment creation drawer",
      );
    });

    test("teaches scenarios and metrics as construction with the typed sweep domain", () => {
      expect(construction).toContain("`addScenario`");
      expect(construction).toContain("`addMetric`");
      expect(construction).toContain("a count is an `integer` parameter");
      expect(construction).toContain("`parameterOverrides`");
      expect(experiment).toContain("never rounding in code");
      expect(experiment).toContain("A `boolean` parameter rejects ranges");
    });
  });

  test("names the mounted construction read tool", () => {
    const construction = readSkillFile("references/pn-construction.md");
    expect(construction).toContain("read_petrinaut_net");
  });

  test("reuses settlement carriage and limits settled locator reads to spans the settlement did not return", () => {
    const instructions = sdcpnModellingSkill.instructions;
    const construction = readSkillFile("references/pn-construction.md");

    expect(instructions).toContain(
      "returned `revisionId`, `sha256` and `evidence[]` locators as authoritative",
    );
    for (const text of [instructions, construction]) {
      expect(text).toContain("evidence by literal text");
      expect(text).toContain(
        "Only when a basis needs a span that output did not return",
      );
      expect(text).not.toMatch(
        /includeSources|candidate Markdown|unsettled candidate|useful stretch/u,
      );
    }
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
