import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test, vi } from "vitest";

import { writeArmArtifacts } from "../src/evaluations/matched-parity/artifacts.ts";
import { observedSpendFromMessages } from "../src/evaluations/matched-parity/browser-run.ts";
import {
  evaluationEnvironment,
  matchedParityArms,
  resolveMatchedParityConfiguration,
  type EvaluationArm,
} from "../src/evaluations/matched-parity/configuration.ts";
import { loadCompletedArm } from "../src/evaluations/matched-parity/resume.ts";
import {
  allowanceWarning,
  armArtifactDirectory,
  matchedParityPlan,
  runMatchedParityEvaluation,
} from "../src/evaluations/matched-parity/run.ts";
import {
  matchedParityScenarios,
  scenariosForArm,
  surpriseMePrompt,
} from "../src/evaluations/matched-parity/scenarios.ts";
import {
  deriveComparison,
  deriveMechanicalSummary,
  type MatchedParityArtifact,
} from "../src/evaluations/matched-parity/summary.ts";

const environment = {
  PETRINAUT_AI_MODEL: "gpt-5.5",
  BRUNCH_CHAT_MODEL: "openai/gpt-5.5",
  BRUNCH_CHAT_THINKING: "medium",
};

const configuration = resolveMatchedParityConfiguration(environment);
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

const artifact = (arm: EvaluationArm): MatchedParityArtifact => ({
  schemaVersion: 2,
  arm,
  mode: arm,
  configuration,
  diagnostics: { isValid: true, itemDiagnostics: [] },
  document: {
    title: "Single-server queue",
    sdcpn: {
      places: [
        {
          id: "waiting",
          name: "Waiting",
          x: 10,
          y: 20,
          visualizerCode:
            'export default Visualization(() => <svg viewBox="0 0 10 10" />);',
        },
      ],
      transitions: [
        { id: "serve", lambdaCode: "return input.Waiting.length > 0;" },
      ],
      scenarios: [{ id: "baseline", name: "Baseline" }],
      metrics: [
        {
          id: "throughput",
          name: "Throughput",
          code: "return state.places.Completed.count;",
        },
      ],
    },
  },
  elapsedMs: 1_000 + matchedParityArms.indexOf(arm) * 100,
  modelStepCount: 3,
  scenario: matchedParityScenarios[1]!,
  spend: { observedUsd: arm === "S" ? 1.25 : null },
  toolCalls: [
    { name: "addPlace", state: "output-available" },
    { name: "applyAutoLayout", state: "output-available" },
  ],
});

describe("matched parity evaluation configuration", () => {
  test.each([
    { ...environment, BRUNCH_CHAT_MODEL: "openai/a-different-model" },
    { ...environment, BRUNCH_CHAT_THINKING: "low" },
    {
      ...environment,
      PETRINAUT_AI_MODEL: "unknown-model",
      BRUNCH_CHAT_MODEL: "openai/unknown-model",
    },
  ])("refuses model or reasoning mismatch before inference", (mismatch) => {
    expect(() => resolveMatchedParityConfiguration(mismatch)).toThrow(
      /refused (?:.* mismatch|unavailable)/u,
    );
  });

  test("uses a positive USD 50 allowance and only requires an API key for paid execution", () => {
    expect(configuration.budgetUsd).toBe(50);
    expect(() =>
      resolveMatchedParityConfiguration(environment, { executePaid: true }),
    ).toThrow(/OPENAI_API_KEY/u);
    expect(
      resolveMatchedParityConfiguration(
        { ...environment, OPENAI_API_KEY: "operator-owned" },
        { executePaid: true },
      ).executePaid,
    ).toBe(true);
    for (const invalid of [0, -1, Number.NaN])
      expect(() =>
        resolveMatchedParityConfiguration(environment, { budgetUsd: invalid }),
      ).toThrow(/positive number/u);
  });

  test("pins five isolated identities and exact website overrides", () => {
    expect(matchedParityArms).toEqual(["S", "F", "I", "A", "B"]);
    expect(configuration.arms.S).toMatchObject({
      assistant: "stock",
      websiteMode: null,
    });
    for (const arm of ["F", "I", "A", "B"] as const)
      expect(evaluationEnvironment(configuration, arm)).toMatchObject({
        VITE_BRUNCH_EVALUATION_MODE: arm,
        VITE_PETRINAUT_DEFAULT_ASSISTANT: "brunch",
      });
    expect(
      evaluationEnvironment(configuration, "S").VITE_BRUNCH_EVALUATION_MODE,
    ).toBeUndefined();
    expect(configuration.arms.A).toMatchObject({
      assistant: configuration.arms.I.assistant,
      model: configuration.arms.I.model,
      reasoning: configuration.arms.I.reasoning,
    });
    expect(configuration.arms.B).toMatchObject({
      assistant: configuration.arms.I.assistant,
      model: configuration.arms.I.model,
      reasoning: configuration.arms.I.reasoning,
    });
    expect(matchedParityPlan(configuration).order).toHaveLength(10);
    const roots = matchedParityArms.map((arm) =>
      armArtifactDirectory("/tmp/run", "surprise-me", arm),
    );
    expect(new Set(roots).size).toBe(5);
    expect(roots).not.toContain("/tmp/run/surprise-me/stock");
    expect(roots).not.toContain("/tmp/run/surprise-me/brunch");
  });

  test("dry-run never invokes the paid executor", async () => {
    const execute =
      vi.fn<
        (
          config: typeof configuration,
          report: (message: string) => void,
        ) => Promise<void>
      >();
    const report = vi.fn<(message: string) => void>();
    await runMatchedParityEvaluation(configuration, { execute, report });
    expect(execute).not.toHaveBeenCalled();
    expect(report).toHaveBeenCalledWith(
      expect.stringContaining("No browser, provider, model, or inference"),
    );
  });

  test("warns before dispatching a paid executor without an authorization token", async () => {
    const paidConfiguration = resolveMatchedParityConfiguration(
      { ...environment, OPENAI_API_KEY: "operator-owned" },
      { executePaid: true },
    );
    const events: string[] = [];
    await runMatchedParityEvaluation(paidConfiguration, {
      execute: async () => {
        events.push("execute");
      },
      report: (message) => events.push(message),
    });
    expect(events.at(-2)).toMatch(/^WARNING before S:/u);
    expect(events.at(-1)).toBe("execute");
  });

  test("reports deterministic unknown-cost allowance warnings", () => {
    expect(
      allowanceWarning({
        arm: "A",
        budgetUsd: 50,
        knownObservedSpendUsd: 12.5,
        unknownSpendArmCount: 2,
      }),
    ).toBe(
      "WARNING before A: remaining known allowance USD 37.500000 of 50.000000. Estimated cost for the next arm is unknown, so sufficient allowance cannot be established. Observed provider cost so far is USD 12.500000; 2 completed arm(s) have unknown cost. Continuing may exceed the standing allowance; review this warning before launch.",
    );
  });

  test("uses provider-reported usage when present and otherwise stays unknown", () => {
    expect(observedSpendFromMessages([{ role: "assistant" }])).toBeNull();
    expect(
      observedSpendFromMessages([
        { usage: { cost: { total: 0.75 } } },
        { metadata: { usage: { cost: { total: 1.25 } } } },
      ]),
    ).toBe(2);
  });
});

describe("completed arm reuse", () => {
  const completedDirectory = async (arm: EvaluationArm = "S") => {
    const directory = await mkdtemp(join(tmpdir(), "matched-parity-resume-"));
    temporaryDirectories.push(directory);
    const retainedArtifact = artifact(arm);
    await writeArmArtifacts(directory, {
      artifact: retainedArtifact,
      rawDocument: {
        title: retainedArtifact.document.title,
        sdcpn: retainedArtifact.document.sdcpn,
      },
      rawTranscript: [
        { role: "assistant", parts: [{ type: "text", text: "done" }] },
      ],
      transcriptText: "Assistant: done",
    });
    return directory;
  };

  test("reuses only a matching complete retained arm and mode", async () => {
    const directory = await completedDirectory("A");
    const retained = await loadCompletedArm({
      arm: "A",
      configuration,
      directory,
      resumeCompleted: true,
      scenario: matchedParityScenarios[1]!,
    });
    expect(retained?.artifact).toEqual(artifact("A"));
    expect(retained?.transcriptText).toBe("Assistant: done\n");
  });

  test("refuses arm, scenario, mode configuration, and legacy labels", async () => {
    const directory = await completedDirectory("S");
    await expect(
      loadCompletedArm({
        arm: "F",
        configuration,
        directory,
        resumeCompleted: true,
        scenario: matchedParityScenarios[1]!,
      }),
    ).rejects.toThrow(/arm\/mode mismatch/u);

    await expect(
      loadCompletedArm({
        arm: "S",
        configuration,
        directory,
        resumeCompleted: true,
        scenario: { ...matchedParityScenarios[1]!, prompt: "A different task" },
      }),
    ).rejects.toThrow(/scenario mismatch/u);

    const artifactPath = join(directory, "artifact.json");
    await writeFile(
      artifactPath,
      `${JSON.stringify({ ...artifact("S"), arm: "stock", mode: undefined, schemaVersion: 1 })}\n`,
    );
    await expect(
      loadCompletedArm({
        arm: "S",
        configuration,
        directory,
        resumeCompleted: true,
        scenario: matchedParityScenarios[1]!,
      }),
    ).rejects.toThrow(/incomplete retained arm artifact/u);
  });

  test("refuses an incomplete retained arm instead of rerunning it", async () => {
    const directory = await mkdtemp(join(tmpdir(), "matched-parity-partial-"));
    temporaryDirectories.push(directory);
    await mkdir(directory, { recursive: true });
    await writeFile(
      join(directory, "artifact.json"),
      `${JSON.stringify(artifact("S"))}\n`,
    );
    await expect(
      loadCompletedArm({
        arm: "S",
        configuration,
        directory,
        resumeCompleted: true,
        scenario: matchedParityScenarios[1]!,
      }),
    ).rejects.toThrow(/incomplete retained arm artifact/u);
  });

  test("default mode never inspects or reuses retained files", async () => {
    const directory = await completedDirectory();
    await writeFile(join(directory, "artifact.json"), "not-json");
    await expect(
      loadCompletedArm({
        arm: "S",
        configuration,
        directory,
        resumeCompleted: false,
        scenario: matchedParityScenarios[1]!,
      }),
    ).resolves.toBeUndefined();
  });
});

describe("matched scenarios and summaries", () => {
  test("all five arms receive the same exact ordered scenarios", () => {
    for (const arm of matchedParityArms)
      expect(scenariosForArm(arm)).toEqual(matchedParityScenarios);
    expect(matchedParityScenarios[0]).toMatchObject({
      id: "surprise-me",
      prompt: surpriseMePrompt,
    });
    expect(surpriseMePrompt).toBe(
      "Pick an interesting domain and build a small but complete SDCPN end-to-end — use all available features (including place visualizers).",
    );
  });

  test("derives mechanical completeness and the three named effects", () => {
    expect(deriveMechanicalSummary(artifact("S"))).toMatchObject({
      mechanicallyComplete: true,
      toolCallCount: 2,
      scenarioCount: 1,
      metricCount: 1,
      visualizationCount: 1,
      diagnosticsClean: true,
      executableCodePresent: true,
      layoutObserved: true,
      observedSpendUsd: 1.25,
    });
    const artifacts = Object.fromEntries(
      matchedParityArms.map((arm) => [arm, artifact(arm)]),
    ) as Record<EvaluationArm, MatchedParityArtifact>;
    expect(deriveComparison(artifacts)).toMatchObject({
      scenario: { id: "scoped-executable-construction" },
      arms: {
        S: { arm: "S", mechanicallyComplete: true },
        B: { arm: "B", mechanicallyComplete: true },
      },
      effects: {
        stockToFlueTransportDrag: { from: "S", to: "F" },
        flueToIntegratedArchitectureDrag: { from: "F", to: "I" },
        declaredVsDeepConstruction: { from: "A", to: "B" },
      },
    });
  });
});
