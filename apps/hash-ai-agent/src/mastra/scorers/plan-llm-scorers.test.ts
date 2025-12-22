/* eslint-disable no-console */
/**
 * Plan LLM Scorers Tests
 *
 * Tests for LLM-based plan evaluation scorers using Mastra v1 API.
 * These tests make actual LLM calls and are slower than deterministic tests.
 * Set RUN_LLM_SCORERS=true to enable.
 *
 * Run with: RUN_LLM_SCORERS=true npx vitest run apps/hash-ai-agent/src/mastra/scorers/plan-llm-scorers.test.ts
 */

import { describe, expect, test } from "vitest";

import { generatePlan } from "../agents/planner-agent";
import type { PlanSpec } from "../schemas/plan-spec";
import { validatePlan } from "../utils/plan-validator";
import {
  goalAlignmentScorer,
  hypothesisTestabilityScorer,
  planGranularityScorer,
} from "./plan-llm-scorers";

const RUN_LLM_SCORERS = process.env.RUN_LLM_SCORERS === "true";
const describeIfLlm = RUN_LLM_SCORERS ? describe : describe.skip;

if (!RUN_LLM_SCORERS) {
  console.warn("Skipping plan LLM scorer tests; set RUN_LLM_SCORERS=true.");
}

// =============================================================================
// TEST HELPERS
// =============================================================================

/**
 * Creates a minimal plan for testing (no LLM call).
 */
function createMinimalTestPlan(): PlanSpec {
  return {
    id: "test-plan",
    goalSummary: "Summarize papers on RAG",
    requirements: [
      { id: "R1", description: "Find 3 recent RAG papers", priority: "must" },
      { id: "R2", description: "Create comparison table", priority: "should" },
    ],
    hypotheses: [],
    steps: [
      {
        type: "research",
        id: "S1",
        description: "Search for recent papers on RAG",
        dependencyIds: [],
        requirementIds: ["R1"],
        inputs: [],
        outputs: [{ name: "papers", description: "Found papers" }],
        query: "retrieval augmented generation recent papers 2024",
        stoppingRule: "Find 3 relevant papers",
        concurrent: true,
        executor: { kind: "agent", ref: "literature-searcher" },
      },
      {
        type: "synthesize",
        id: "S2",
        description: "Create comparison table from papers",
        dependencyIds: ["S1"],
        requirementIds: ["R1", "R2"],
        inputs: [{ name: "papers", description: "Papers" }],
        outputs: [{ name: "comparison", description: "Comparison table" }],
        mode: "integrative",
        concurrent: false,
        executor: { kind: "agent", ref: "result-synthesizer" },
      },
    ],
    unknownsMap: {
      knownKnowns: ["RAG is a well-established technique"],
      knownUnknowns: ["Which papers are most relevant"],
      unknownUnknowns: [
        {
          potentialSurprise:
            "RAG approaches may have fundamentally changed recently",
          detectionSignal: "Papers describe paradigm shifts",
        },
      ],
      communityCheck: "Others can verify paper selection criteria",
    },
  };
}

/**
 * Creates a plan with hypotheses and experiments for testability scoring.
 */
function createPlanWithHypotheses(): PlanSpec {
  return {
    id: "hypothesis-plan",
    goalSummary:
      "Test whether fine-tuning beats prompting for entity extraction",
    aimType: "explain",
    requirements: [
      {
        id: "R1",
        description: "Compare fine-tuned vs prompted models",
        priority: "must",
      },
    ],
    hypotheses: [
      {
        id: "H1",
        statement:
          "Fine-tuned Llama 3 8B will achieve >10% higher F1 than GPT-4 few-shot on our entity extraction task",
        assumptions: [
          "Domain data is representative",
          "F1 is appropriate metric",
        ],
        testableVia: "Controlled experiment with held-out test set",
        status: "untested",
      },
      {
        id: "H2",
        statement: "Fine-tuning will be good", // Deliberately vague/untestable
        assumptions: [],
        testableVia: "Somehow",
        status: "untested",
      },
    ],
    steps: [
      {
        type: "research",
        id: "S1",
        description: "Review fine-tuning best practices",
        dependencyIds: [],
        requirementIds: ["R1"],
        inputs: [],
        outputs: [{ name: "practices", description: "Best practices" }],
        query: "fine-tuning LLMs for entity extraction",
        stoppingRule: "Document 5 key practices",
        concurrent: true,
        executor: { kind: "agent", ref: "literature-searcher" },
      },
      {
        type: "experiment",
        id: "S2",
        description: "Run comparison experiment",
        dependencyIds: ["S1"],
        requirementIds: ["R1"],
        inputs: [],
        outputs: [{ name: "results", description: "Experiment results" }],
        mode: "confirmatory",
        hypothesisIds: ["H1"],
        procedure: "Fine-tune Llama, run both models on test set, compare F1",
        expectedOutcomes: [
          "H1 supported (fine-tuned wins)",
          "H1 refuted (prompting wins)",
        ],
        successCriteria: [
          "Statistical significance p<0.05",
          "Effect size >10%",
        ],
        preregisteredCommitments: [
          "Test set: 500 entities",
          "Primary metric: F1 score",
          "Significance threshold: p<0.05",
        ],
        concurrent: false,
        executor: { kind: "agent", ref: "experiment-runner" },
      },
    ],
    unknownsMap: {
      knownKnowns: ["Both approaches work to some degree"],
      knownUnknowns: ["Optimal fine-tuning hyperparameters"],
      unknownUnknowns: [
        {
          potentialSurprise: "Domain shift makes comparison invalid",
          detectionSignal: "High variance in results across entity types",
        },
      ],
      communityCheck: "Share data splits and model checkpoints",
    },
  };
}

// =============================================================================
// GOAL ALIGNMENT SCORER TESTS
// =============================================================================

describeIfLlm("goalAlignmentScorer", () => {
  const TIMEOUT = 60_000; // 60 seconds for LLM calls

  test("scores well-aligned plan highly", { timeout: TIMEOUT }, async () => {
    const goal =
      "Summarize 3 recent papers on RAG and create a comparison table";
    const plan = createMinimalTestPlan();

    // Run the scorer using v1 API
    const result = await goalAlignmentScorer.run({
      input: { goal, plan },
      output: { text: JSON.stringify(plan) },
    });

    console.log("\n=== Goal Alignment Score ===");
    console.log(`Score: ${result.score}`);
    console.log(`Reason: ${result.reason}`);

    // Well-aligned plan should score > 0.6
    expect(result.score).toBeGreaterThan(0.6);
  });

  test("scores misaligned plan lower", { timeout: TIMEOUT }, async () => {
    const goal = "Build a machine learning model to predict stock prices";
    const plan = createMinimalTestPlan(); // This plan is about RAG papers, not stocks

    const result = await goalAlignmentScorer.run({
      input: { goal, plan },
      output: { text: JSON.stringify(plan) },
    });

    console.log("\n=== Misaligned Plan Score ===");
    console.log(`Score: ${result.score}`);
    console.log(`Reason: ${result.reason}`);

    // Misaligned plan should score < 0.5
    expect(result.score).toBeLessThan(0.5);
  });
});

// =============================================================================
// PLAN GRANULARITY SCORER TESTS
// =============================================================================

describeIfLlm("planGranularityScorer", () => {
  const TIMEOUT = 60_000;

  test("evaluates step granularity", { timeout: TIMEOUT }, async () => {
    const goal = "Summarize 3 recent papers on RAG";
    const plan = createMinimalTestPlan();

    const result = await planGranularityScorer.run({
      input: { goal, plan },
      output: { text: JSON.stringify(plan) },
    });

    console.log("\n=== Granularity Score ===");
    console.log(`Score: ${result.score}`);
    console.log(`Reason: ${result.reason}`);

    // Score should be reasonable (0-1)
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(1);
  });
});

// =============================================================================
// HYPOTHESIS TESTABILITY SCORER TESTS
// =============================================================================

describeIfLlm("hypothesisTestabilityScorer", () => {
  const TIMEOUT = 60_000;

  test(
    "returns high score for plan without hypotheses",
    { timeout: TIMEOUT },
    async () => {
      const goal = "Summarize papers";
      const plan = createMinimalTestPlan(); // No hypotheses

      const result = await hypothesisTestabilityScorer.run({
        input: { goal, plan },
        output: { text: JSON.stringify(plan) },
      });

      console.log("\n=== Testability (No Hypotheses) ===");
      console.log(`Score: ${result.score}`);
      console.log(`Reason: ${result.reason}`);

      // Plan without hypotheses should get high score (N/A case)
      expect(result.score).toBe(1.0);
    },
  );

  test("evaluates hypothesis testability", { timeout: TIMEOUT }, async () => {
    const goal = "Test whether fine-tuning beats prompting";
    const plan = createPlanWithHypotheses();

    const result = await hypothesisTestabilityScorer.run({
      input: { goal, plan },
      output: { text: JSON.stringify(plan) },
    });

    console.log("\n=== Testability (With Hypotheses) ===");
    console.log(`Score: ${result.score}`);
    console.log(`Reason: ${result.reason}`);

    // Should be able to evaluate testability
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(1);
    // H1 is testable, H2 is not — score should be moderate
    expect(result.score).toBeLessThan(1.0);
  });
});

// =============================================================================
// INTEGRATION TEST WITH GENERATED PLAN
// =============================================================================

describeIfLlm("LLM Scorers with Generated Plan", () => {
  const TIMEOUT = 120_000; // 2 minutes for generation + scoring

  test("scores a generated plan", { timeout: TIMEOUT }, async () => {
    const goal =
      "Research the latest advances in retrieval-augmented generation and identify the top 3 most promising approaches for improving response accuracy";

    console.log("\n=== Generating Plan ===");
    const { plan } = await generatePlan({ goal });

    const validation = validatePlan(plan);
    console.log(`Validation: ${validation.valid ? "PASSED" : "FAILED"}`);

    if (!validation.valid) {
      console.log(
        "Errors:",
        validation.errors.map((err) => err.message),
      );
      // Still try to score even if validation fails
    }

    console.log(`Plan has ${plan.steps.length} steps`);

    // Run all LLM scorers
    console.log("\n=== Running LLM Scorers ===");

    const [alignmentResult, granularityResult] = await Promise.all([
      goalAlignmentScorer.run({
        input: { goal, plan },
        output: { text: JSON.stringify(plan) },
      }),
      planGranularityScorer.run({
        input: { goal, plan },
        output: { text: JSON.stringify(plan) },
      }),
    ]);

    console.log("\nGoal Alignment:");
    console.log(`  Score: ${alignmentResult.score.toFixed(2)}`);
    console.log(`  Reason: ${alignmentResult.reason}`);

    console.log("\nGranularity:");
    console.log(`  Score: ${granularityResult.score.toFixed(2)}`);
    console.log(`  Reason: ${granularityResult.reason}`);

    // Generated plan should be reasonably aligned
    expect(alignmentResult.score).toBeGreaterThan(0.5);
  });
});
