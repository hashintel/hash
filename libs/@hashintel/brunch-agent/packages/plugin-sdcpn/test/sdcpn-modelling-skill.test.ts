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
      expect(experiment).toContain(
        "In integrated Brunch, the net supplies candidate executable inputs, judged from a verified current canonical `getLatestNetDefinition` result",
      );
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
        "getNetCompilationErrors",
      ]) {
        expect(experiment).toContain(source);
      }
      expect(experiment).toContain(
        "That diagnostic does not check saved scenario or metric compilation",
      );
      expect(experiment).toContain(
        "The separate legacy batched construction mode uses `mutate_petrinaut_net` and `read_petrinaut_diagnostics`",
      );
      expect(experiment).toContain("it does not mount the draft tool");
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
        "`dt` must be no greater than `maxTime`, and `maxTime / dt` must be at most 1,000,000; integer divisibility is not required",
      );
      expect(experiment).toContain(
        "The AI experiment request currently exposes no constraints or constraint policy",
      );
      expect(experiment).toContain("reported, not enforced");
      expect(experiment).toContain(
        "Never encode a hard restriction as an objective penalty",
      );
      expect(experiment).not.toMatch(/constraintPolicy|alpha|α/u);
    });

    test("names the draft tool, the honesty wording and the once-only rule", () => {
      expect(experiment).toContain("`draft_petrinaut_experiment`");
      expect(experiment).toContain("{ experiment, declarations, unsupported }");
      expect(experiment).toContain(
        "Do not put a basis table, locator, hash, revision or observation tool-call ID in the draft input",
      );
      expect(experiment).toContain(
        'Say "drafted for review, not run", not "added to the model"',
      );
      expect(experiment).toContain(
        "It does not run anything, save anything with the document or navigate",
      );
      expect(experiment).toContain(
        "call it directly only when the person explicitly requests immediate execution",
      );
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

  test("routes construction through the mounted canonical definition read", () => {
    const construction = readSkillFile("references/pn-construction.md");
    expect(construction).toContain("canonical definition-read tool");
    expect(construction).not.toContain("read_petrinaut_net");
  });

  test("keeps protocol correlation host-owned and canonical calls honest", () => {
    const instructions = sdcpnModellingSkill.instructions;
    const construction = readSkillFile("references/pn-construction.md");

    for (const text of [instructions, construction]) {
      expect(text).toMatch(/canonical/u);
      expect(text).not.toMatch(
        /mutate_petrinaut_net|baseHash|net-read-1|aaaaaaaa|bbbbbbbb/u,
      );
    }
    expect(instructions).toContain("The host owns protocol correlation");
    expect(construction).toContain(
      "The host owns immutable binding, protocol correlation, document-base checks, persistence, and record attachment",
    );
    expect(instructions).toContain(
      "do not make up or copy an observation call ID or hash",
    );
    expect(instructions).toContain(
      "The host attaches the verified read's correlation to the `query_workpiece` selector; submit only the model-visible selector fields",
    );
    expect(instructions).not.toContain(
      "schema still requires `observationToolCallId`",
    );
  });

  test("preserves explicit default authorization without copying the prompt-chip request", () => {
    const append = readFileSync(
      new URL("../src/prompts/APPEND_SYSTEM.md", import.meta.url),
      "utf8",
    );
    const instructions = sdcpnModellingSkill.instructions;
    const construction = readSkillFile("references/pn-construction.md");

    for (const text of [instructions, construction]) {
      expect(text).toMatch(/sensible defaults/u);
      expect(text).toMatch(/label/iu);
    }
    for (const text of [append, instructions, construction]) {
      expect(text).not.toContain(
        "Pick an interesting domain and build a small but complete SDCPN end-to-end",
      );
    }
  });

  test("preserves the detailed modelling, evidence, and delivery constraints", () => {
    const instructions = sdcpnModellingSkill.instructions;
    const construction = readSkillFile("references/pn-construction.md");

    expect(construction).toContain(
      "success, failure, cancellation, or recovery returns them when the workpiece says they become available",
    );
    expect(construction).toContain(
      "syntactic convenience does not override operational meaning",
    );
    expect(construction).toContain(
      "filling an empty workpiece concern from generic operations knowledge",
    );
    expect(construction).toContain(
      "treating a posted rule as practiced behavior",
    );
    expect(construction).toContain(
      "inventing release, recovery, retry, or branch semantics",
    );
    expect(instructions).toContain(
      "Mechanically verified linkage is not a full-support, relevance, template-completeness, semantic-fidelity or useful-explanation verdict",
    );
    expect(instructions).toContain(
      "Deliver the current workpiece in every branch",
    );
    expect(instructions).toContain("serialization-equivalent");
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
