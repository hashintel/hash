/* eslint-disable no-console */
/**
 * Planning Pipeline E2E Tests
 *
 * Tests the full planning pipeline:
 *   Goal → Planner Agent → PlanSpec → Validator → Scorers
 *
 * Runs all 4 fixtures through the pipeline and collects results for analysis.
 * This surfaces any schema/output mismatches before building the revision workflow.
 */

import { describe, expect, test } from "vitest";

import { generatePlan } from "../agents/planner-agent";
import {
  ctDatabaseGoalFixture,
  exploreAndRecommendFixture,
  hypothesisValidationFixture,
  type PlanningFixture,
  summarizePapersFixture,
} from "../fixtures/decomposition-prompts/fixtures";
import type { PlanSpec } from "../schemas/plan-spec";
import {
  type CompositePlanScore,
  scorePlanComposite,
} from "../scorers/plan-scorers";
import { validatePlan, type ValidationResult } from "../tools/plan-validator";
import {
  analyzePlanTopology,
  type TopologyAnalysis,
} from "../tools/topology-analyzer";
import { planningWorkflow } from "./planning-workflow";

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Set RUN_LLM_SCORERS=true to run LLM-based scorers (slower, costs API credits)
 */
const RUN_LLM_SCORERS = process.env.RUN_LLM_SCORERS === "true";

/**
 * All fixtures ordered by complexity (simplest first)
 */
const ALL_FIXTURES: PlanningFixture[] = [
  summarizePapersFixture,
  exploreAndRecommendFixture,
  hypothesisValidationFixture,
  ctDatabaseGoalFixture,
];

// =============================================================================
// RESULT TYPES
// =============================================================================

interface LlmScoreResult {
  score: number;
  reason: string;
}

interface PipelineResult {
  fixtureId: string;
  success: boolean;
  plan?: PlanSpec;
  validation?: ValidationResult;
  topology?: TopologyAnalysis;
  deterministicScores?: CompositePlanScore;
  llmScores?: {
    goalAlignment?: LlmScoreResult;
    granularity?: LlmScoreResult;
    testability?: LlmScoreResult;
  };
  error?: string;
  durationMs: number;
}

// =============================================================================
// HELPERS
// =============================================================================

function logSectionHeader(title: string): void {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${title}`);
  console.log("=".repeat(60));
}

function logSubsection(title: string): void {
  console.log(`\n--- ${title} ---`);
}

function logPlanSummary(plan: PlanSpec): void {
  console.log(`  ID: ${plan.id}`);
  console.log(`  Goal Summary: ${plan.goalSummary.slice(0, 80)}...`);
  console.log(`  Steps: ${plan.steps.length}`);
  console.log(`  Requirements: ${plan.requirements.length}`);
  console.log(`  Hypotheses: ${plan.hypotheses.length}`);

  const stepTypes = plan.steps.map((step) => step.type);
  const typeCounts = stepTypes.reduce(
    (acc, type) => {
      acc[type] = (acc[type] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );
  console.log(`  Step types: ${JSON.stringify(typeCounts)}`);
}

function logValidation(validation: ValidationResult): void {
  console.log(`  Valid: ${validation.valid}`);
  console.log(`  Errors: ${validation.errors.length}`);
  if (!validation.valid) {
    for (const error of validation.errors.slice(0, 5)) {
      console.log(`    [${error.code}] ${error.message}`);
    }
    if (validation.errors.length > 5) {
      console.log(`    ... and ${validation.errors.length - 5} more`);
    }
  }
}

function logTopology(topology: TopologyAnalysis): void {
  console.log(`  Entry points: [${topology.entryPoints.join(", ")}]`);
  console.log(`  Exit points: [${topology.exitPoints.join(", ")}]`);
  console.log(`  Critical path: ${topology.criticalPath.length} steps`);
  console.log(`  Parallel groups: ${topology.parallelGroups.length}`);
}

function logDeterministicScores(scores: CompositePlanScore): void {
  console.log(`  Overall: ${(scores.overall * 100).toFixed(1)}%`);
  console.log(`  Structure: ${(scores.structure.score * 100).toFixed(1)}%`);
  console.log(`  Coverage: ${(scores.coverage.score * 100).toFixed(1)}%`);
  console.log(
    `  Experiment Rigor: ${(scores.experimentRigor.score * 100).toFixed(1)}%`,
  );
  console.log(
    `  Unknowns Coverage: ${(scores.unknownsCoverage.score * 100).toFixed(1)}%`,
  );
}

function checkExpectedCharacteristics(
  plan: PlanSpec,
  fixture: PlanningFixture,
): string[] {
  const issues: string[] = [];
  const { expected } = fixture;

  // Check step count
  if (plan.steps.length < expected.minSteps) {
    issues.push(`Too few steps: ${plan.steps.length} < ${expected.minSteps}`);
  }
  if (expected.maxSteps && plan.steps.length > expected.maxSteps) {
    issues.push(`Too many steps: ${plan.steps.length} > ${expected.maxSteps}`);
  }

  // Check hypotheses
  const hasHypotheses = plan.hypotheses.length > 0;
  if (expected.shouldHaveHypotheses && !hasHypotheses) {
    issues.push("Expected hypotheses but found none");
  }
  if (!expected.shouldHaveHypotheses && hasHypotheses) {
    issues.push(`Unexpected hypotheses: ${plan.hypotheses.length}`);
  }

  // Check experiments
  const experimentSteps = plan.steps.filter(
    (step) => step.type === "experiment",
  );
  if (expected.shouldHaveExperiments && experimentSteps.length === 0) {
    issues.push("Expected experiment steps but found none");
  }
  if (!expected.shouldHaveExperiments && experimentSteps.length > 0) {
    issues.push(`Unexpected experiment steps: ${experimentSteps.length}`);
  }

  // Check step types
  const actualTypes = new Set(plan.steps.map((step) => step.type));
  for (const expectedType of expected.expectedStepTypes) {
    if (!actualTypes.has(expectedType)) {
      issues.push(`Missing expected step type: ${expectedType}`);
    }
  }

  return issues;
}

// =============================================================================
// LLM SCORER RUNNER
// =============================================================================

async function runLlmScorers(
  fixture: PlanningFixture,
  plan: PlanSpec,
): Promise<NonNullable<PipelineResult["llmScores"]>> {
  // Dynamic import to avoid loading if not needed
  const {
    goalAlignmentScorer,
    planGranularityScorer,
    hypothesisTestabilityScorer,
  } = await import("../scorers/plan-llm-scorers");

  const scorerInput = { goal: fixture.input.goal, plan };
  const scorerOutput = { text: JSON.stringify(plan) };
  const results: NonNullable<PipelineResult["llmScores"]> = {};

  try {
    const alignmentResult = await goalAlignmentScorer.run({
      input: scorerInput,
      output: scorerOutput,
    });
    results.goalAlignment = {
      score: alignmentResult.score,
      reason: alignmentResult.reason ?? "",
    };
  } catch (error) {
    console.error(`  Goal alignment scorer failed: ${String(error)}`);
  }

  try {
    const granularityResult = await planGranularityScorer.run({
      input: scorerInput,
      output: scorerOutput,
    });
    results.granularity = {
      score: granularityResult.score,
      reason: granularityResult.reason ?? "",
    };
  } catch (error) {
    console.error(`  Granularity scorer failed: ${String(error)}`);
  }

  try {
    const testabilityResult = await hypothesisTestabilityScorer.run({
      input: scorerInput,
      output: scorerOutput,
    });
    results.testability = {
      score: testabilityResult.score,
      reason: testabilityResult.reason ?? "",
    };
  } catch (error) {
    console.error(`  Testability scorer failed: ${String(error)}`);
  }

  return results;
}

// =============================================================================
// MAIN TEST RUNNER
// =============================================================================

async function runPipelineForFixture(
  fixture: PlanningFixture,
): Promise<PipelineResult> {
  const startTime = Date.now();
  const result: PipelineResult = {
    fixtureId: fixture.input.id,
    success: false,
    durationMs: 0,
  };

  try {
    // Step 1: Generate plan
    logSubsection("Generating Plan");
    const genResult = await generatePlan({
      goal: fixture.input.goal,
      context: fixture.input.context,
    });
    result.plan = genResult.plan;
    logPlanSummary(genResult.plan);

    // Step 2: Validate plan
    logSubsection("Validation");
    result.validation = validatePlan(genResult.plan);
    logValidation(result.validation);

    if (!result.validation.valid) {
      result.error = `Validation failed: ${result.validation.errors[0]?.message}`;
      result.durationMs = Date.now() - startTime;
      return result;
    }

    // Step 3: Analyze topology
    logSubsection("Topology Analysis");
    result.topology = analyzePlanTopology(genResult.plan);
    logTopology(result.topology);

    // Step 4: Run deterministic scorers
    logSubsection("Deterministic Scores");
    result.deterministicScores = scorePlanComposite(genResult.plan);
    logDeterministicScores(result.deterministicScores);

    // Step 5: Check expected characteristics
    logSubsection("Expected Characteristics Check");
    const charIssues = checkExpectedCharacteristics(genResult.plan, fixture);
    if (charIssues.length > 0) {
      console.log("  Issues:");
      for (const issue of charIssues) {
        console.log(`    ⚠️  ${issue}`);
      }
    } else {
      console.log("  ✅ All expected characteristics met");
    }

    // Step 6: Run LLM scorers (if enabled)
    if (RUN_LLM_SCORERS) {
      logSubsection("LLM Scores");
      const llmScores = await runLlmScorers(fixture, genResult.plan);
      result.llmScores = llmScores;
      if (llmScores.goalAlignment) {
        console.log(
          `  Goal Alignment: ${(llmScores.goalAlignment.score * 100).toFixed(1)}%`,
        );
      }
      if (llmScores.granularity) {
        console.log(
          `  Granularity: ${(llmScores.granularity.score * 100).toFixed(1)}%`,
        );
      }
      if (llmScores.testability) {
        console.log(
          `  Testability: ${(llmScores.testability.score * 100).toFixed(1)}%`,
        );
      }
    } else {
      console.log(
        "\n  (LLM scorers skipped — set RUN_LLM_SCORERS=true to enable)",
      );
    }

    result.success = true;
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
    console.error(`\n  ❌ Error: ${result.error}`);
  }

  result.durationMs = Date.now() - startTime;
  return result;
}

// =============================================================================
// TESTS
// =============================================================================

describe("Planning Pipeline E2E", () => {
  // Timeout for LLM calls: 2 minutes per fixture
  const FIXTURE_TIMEOUT = 2 * 60 * 1000;

  describe("Individual Fixtures", () => {
    test.each(ALL_FIXTURES)(
      "generates valid plan for: $input.id",
      async (fixture) => {
        logSectionHeader(`FIXTURE: ${fixture.input.id}`);
        console.log(`Goal: ${fixture.input.goal.slice(0, 100)}...`);

        const result = await runPipelineForFixture(fixture);

        console.log(`\n  Duration: ${(result.durationMs / 1000).toFixed(1)}s`);

        // Assertions
        expect(result.plan).toBeDefined();
        expect(result.validation?.valid).toBe(true);
        expect(result.plan?.steps.length).toBeGreaterThan(0);

        // Check minimum expected step types are present
        const actualTypes = new Set(
          result.plan?.steps.map((step) => step.type) ?? [],
        );
        for (const expectedType of fixture.expected.expectedStepTypes) {
          expect(actualTypes.has(expectedType)).toBe(true);
        }
      },
      FIXTURE_TIMEOUT,
    );
  });

  describe("Summary Report", () => {
    test(
      "runs all fixtures and generates summary",
      async () => {
        logSectionHeader("RUNNING ALL FIXTURES");

        const results: PipelineResult[] = [];

        for (const fixture of ALL_FIXTURES) {
          logSectionHeader(`FIXTURE: ${fixture.input.id}`);
          console.log(`Goal: ${fixture.input.goal.slice(0, 100)}...`);

          const result = await runPipelineForFixture(fixture);
          results.push(result);

          console.log(
            `\n  Duration: ${(result.durationMs / 1000).toFixed(1)}s`,
          );
          console.log(
            `  Result: ${result.success ? "✅ SUCCESS" : "❌ FAILED"}`,
          );
        }

        // Generate summary
        logSectionHeader("SUMMARY REPORT");

        const successful = results.filter((res) => res.success);
        const failed = results.filter((res) => !res.success);

        console.log(`\nTotal: ${results.length} fixtures`);
        console.log(`Successful: ${successful.length}`);
        console.log(`Failed: ${failed.length}`);

        if (failed.length > 0) {
          console.log("\nFailures:");
          for (const result of failed) {
            console.log(`  - ${result.fixtureId}: ${result.error}`);
          }
        }

        // Score summary for successful plans
        if (successful.length > 0) {
          console.log("\nDeterministic Scores:");
          console.log(
            "  Fixture                     | Overall | Structure | Coverage | Rigor | Unknowns",
          );
          console.log(`  ${"-".repeat(85)}`);

          for (const result of successful) {
            if (result.deterministicScores) {
              const scores = result.deterministicScores;
              const row = [
                result.fixtureId.padEnd(28),
                `${(scores.overall * 100).toFixed(0)}%`.padStart(7),
                `${(scores.structure.score * 100).toFixed(0)}%`.padStart(9),
                `${(scores.coverage.score * 100).toFixed(0)}%`.padStart(8),
                `${(scores.experimentRigor.score * 100).toFixed(0)}%`.padStart(
                  5,
                ),
                `${(scores.unknownsCoverage.score * 100).toFixed(0)}%`.padStart(
                  8,
                ),
              ];
              console.log(`  ${row.join(" | ")}`);
            }
          }
        }

        // Total duration
        const totalDuration = results.reduce(
          (sum, res) => sum + res.durationMs,
          0,
        );
        console.log(`\nTotal duration: ${(totalDuration / 1000).toFixed(1)}s`);

        // Expect at least some success
        expect(successful.length).toBeGreaterThan(0);
      },
      ALL_FIXTURES.length * FIXTURE_TIMEOUT,
    );
  });
});

// =============================================================================
// REVISION WORKFLOW TESTS
// =============================================================================

describe("Planning Workflow with Revision Loop", () => {
  // Timeout for workflow with potential revisions: 4 minutes
  const WORKFLOW_TIMEOUT = 4 * 60 * 1000;

  test(
    "ct-database-goal passes after revision",
    async () => {
      logSectionHeader("REVISION WORKFLOW: ct-database-goal");
      console.log(`Goal: ${ctDatabaseGoalFixture.input.goal.slice(0, 100)}...`);

      const run = await planningWorkflow.createRun();
      const result = await run.start({
        inputData: {
          goal: ctDatabaseGoalFixture.input.goal,
          context: ctDatabaseGoalFixture.input.context,
          maxAttempts: 3,
        },
      });

      console.log("\n=== Workflow Result ===");
      console.log(`  Status: ${result.status}`);

      // Assert workflow completed successfully
      expect(result.status).toBe("success");

      if (result.status === "success") {
        const output = result.result;
        console.log(`  Valid: ${output.valid}`);
        console.log(`  Attempts: ${output.attempts}`);
        console.log(`  Plan steps: ${output.plan.steps.length}`);

        if (output.errors && output.errors.length > 0) {
          console.log(`  Errors: ${output.errors.length}`);
          for (const error of output.errors.slice(0, 3)) {
            console.log(`    - [${error.code}] ${error.message}`);
          }
        }

        // Assertions
        expect(output.valid).toBe(true);
        expect(output.attempts).toBeLessThanOrEqual(3);
        expect(output.plan.steps.length).toBeGreaterThan(0);
      }
    },
    WORKFLOW_TIMEOUT,
  );

  test(
    "simple fixture passes on first attempt",
    async () => {
      logSectionHeader("REVISION WORKFLOW: summarize-papers");
      console.log(
        `Goal: ${summarizePapersFixture.input.goal.slice(0, 100)}...`,
      );

      const run = await planningWorkflow.createRun();
      const result = await run.start({
        inputData: {
          goal: summarizePapersFixture.input.goal,
          context: summarizePapersFixture.input.context,
          maxAttempts: 3,
        },
      });

      console.log("\n=== Workflow Result ===");
      console.log(`  Status: ${result.status}`);

      if (result.status === "success") {
        const output = result.result;
        console.log(`  Valid: ${output.valid}`);
        console.log(`  Attempts: ${output.attempts}`);
        console.log(`  Plan steps: ${output.plan.steps.length}`);

        // Simple fixture should pass on first attempt
        expect(output.valid).toBe(true);
        expect(output.attempts).toBe(1);
      } else {
        expect(result.status).toBe("success");
      }
    },
    WORKFLOW_TIMEOUT,
  );

  test(
    "runs all fixtures through revision workflow",
    async () => {
      logSectionHeader("REVISION WORKFLOW: All Fixtures");

      interface WorkflowResult {
        fixtureId: string;
        valid: boolean;
        attempts: number;
        stepCount: number;
        errors?: Array<{ code: string; message: string }>;
        durationMs: number;
      }

      const results: WorkflowResult[] = [];

      for (const fixture of ALL_FIXTURES) {
        console.log(`\n--- ${fixture.input.id} ---`);
        const startTime = Date.now();

        const run = await planningWorkflow.createRun();
        const result = await run.start({
          inputData: {
            goal: fixture.input.goal,
            context: fixture.input.context,
            maxAttempts: 3,
          },
        });

        const durationMs = Date.now() - startTime;

        if (result.status === "success") {
          const output = result.result;
          results.push({
            fixtureId: fixture.input.id,
            valid: output.valid,
            attempts: output.attempts,
            stepCount: output.plan.steps.length,
            errors: output.errors?.map((err) => ({
              code: String(err.code),
              message: err.message,
            })),
            durationMs,
          });
          console.log(
            `  Valid: ${output.valid}, Attempts: ${output.attempts}, Steps: ${output.plan.steps.length}, Duration: ${(durationMs / 1000).toFixed(1)}s`,
          );
        } else {
          results.push({
            fixtureId: fixture.input.id,
            valid: false,
            attempts: 0,
            stepCount: 0,
            errors: [
              { code: "WORKFLOW_FAILED", message: "Workflow did not complete" },
            ],
            durationMs,
          });
          console.log(`  FAILED: Workflow did not complete`);
        }
      }

      // Summary
      logSectionHeader("REVISION WORKFLOW SUMMARY");
      console.log(
        "\n  Fixture                     | Valid | Attempts | Steps | Duration",
      );
      console.log(`  ${"-".repeat(70)}`);

      for (const result of results) {
        const row = [
          result.fixtureId.padEnd(28),
          (result.valid ? "YES" : "NO").padStart(5),
          String(result.attempts).padStart(8),
          String(result.stepCount).padStart(5),
          `${(result.durationMs / 1000).toFixed(1)}s`.padStart(8),
        ];
        console.log(`  ${row.join(" | ")}`);
      }

      const totalDuration = results.reduce(
        (sum, res) => sum + res.durationMs,
        0,
      );
      const validCount = results.filter((res) => res.valid).length;
      console.log(
        `\n  Total: ${validCount}/${results.length} valid, ${(totalDuration / 1000).toFixed(1)}s`,
      );

      // All fixtures should eventually pass
      expect(validCount).toBe(results.length);
    },
    ALL_FIXTURES.length * WORKFLOW_TIMEOUT,
  );
});
