import { describe, expect, test, vi } from "vitest";

import {
  paidAuthorizationValue,
  resolveMatchedParityConfiguration,
} from "../src/evaluations/matched-parity/configuration.ts";
import { runMatchedParityEvaluation } from "../src/evaluations/matched-parity/run.ts";
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

const artifact = (arm: "stock" | "brunch"): MatchedParityArtifact => ({
  arm,
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
  elapsedMs: arm === "stock" ? 1_000 : 1_200,
  modelStepCount: 3,
  scenario: matchedParityScenarios[1]!,
  toolCalls: [
    { name: "addPlace", state: "output-available" },
    { name: "applyAutoLayout", state: "output-available" },
  ],
});

describe("matched parity evaluation configuration", () => {
  test.each([
    {
      ...environment,
      BRUNCH_CHAT_MODEL: "openai/a-different-model",
    },
    {
      ...environment,
      BRUNCH_CHAT_THINKING: "low",
    },
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

  test("requires two explicit gates for paid execution", () => {
    expect(() =>
      resolveMatchedParityConfiguration(environment, { executePaid: true }),
    ).toThrow(/Paid execution requires/u);
    expect(
      resolveMatchedParityConfiguration(
        {
          ...environment,
          OPENAI_API_KEY: "real-key-is-operator-owned",
          MATCHED_PARITY_PAID_AUTHORIZATION: paidAuthorizationValue,
        },
        { executePaid: true },
      ).executePaid,
    ).toBe(true);
  });

  test("dry-run never invokes the paid executor", async () => {
    const execute = vi.fn<(config: typeof configuration) => Promise<void>>();
    const report = vi.fn<(message: string) => void>();
    await runMatchedParityEvaluation(configuration, { execute, report });
    expect(execute).not.toHaveBeenCalled();
    expect(report).toHaveBeenCalledWith(
      expect.stringContaining("No browser, provider, model, or inference"),
    );
  });
});

describe("matched scenarios and summaries", () => {
  test("Stock and canonical Brunch receive the same ordered scenarios", () => {
    expect(scenariosForArm("stock")).toEqual(scenariosForArm("brunch"));
    expect(matchedParityScenarios[0]).toMatchObject({
      id: "surprise-me",
      prompt: surpriseMePrompt,
    });
    expect(surpriseMePrompt).toBe(
      "Pick an interesting domain and build a small but complete SDCPN end-to-end — use all available features (including place visualizers).",
    );
  });

  test("derives only mechanical completeness and a matched comparison", () => {
    const stock = artifact("stock");
    const brunch = artifact("brunch");
    expect(deriveMechanicalSummary(stock)).toMatchObject({
      mechanicallyComplete: true,
      toolCallCount: 2,
      scenarioCount: 1,
      metricCount: 1,
      visualizationCount: 1,
      diagnosticsClean: true,
      executableCodePresent: true,
      layoutObserved: true,
    });
    expect(deriveComparison(stock, brunch)).toMatchObject({
      scenario: { id: "scoped-executable-construction" },
      stock: { arm: "stock", mechanicallyComplete: true },
      brunch: { arm: "brunch", mechanicallyComplete: true },
    });
  });
});
