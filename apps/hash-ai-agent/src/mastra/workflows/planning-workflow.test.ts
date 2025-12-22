/* eslint-disable no-console */
/**
 * Planning Workflow Tests
 *
 * Focused on the revision loop behavior (goal → plan → validate → revise).
 * Keeps fixtures-based planner testing in the planner agent suite.
 */

import { describe, expect, test } from "vitest";

import { planningWorkflow } from "./planning-workflow";

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Set RUN_LLM_SCORERS=true to run these LLM-dependent tests.
 */
const RUN_LLM_SCORERS = process.env.RUN_LLM_SCORERS === "true";
const describeIfLlm = RUN_LLM_SCORERS ? describe : describe.skip;

if (!RUN_LLM_SCORERS) {
  console.warn(
    "Skipping planning workflow tests; set RUN_LLM_SCORERS=true to enable.",
  );
}

// =============================================================================
// HELPERS
// =============================================================================

function logSectionHeader(title: string): void {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${title}`);
  console.log("=".repeat(60));
}

// =============================================================================
// TESTS
// =============================================================================

describeIfLlm("Planning Workflow with Revision Loop", () => {
  const WORKFLOW_TIMEOUT = 4 * 60 * 1000;

  test(
    "returns a valid plan within maxAttempts",
    async () => {
      logSectionHeader("REVISION WORKFLOW: simple goal");
      const goal = "Summarize three recent RAG papers for an internal review.";
      const context = "Focus on architecture and evaluation methodology.";

      const run = await planningWorkflow.createRun();
      const result = await run.start({
        inputData: {
          goal,
          context,
          maxAttempts: 3,
        },
      });

      console.log("\n=== Workflow Result ===");
      console.log(`  Status: ${result.status}`);

      expect(result.status).toBe("success");

      if (result.status === "success") {
        const output = result.result;
        console.log(`  Valid: ${output.valid}`);
        console.log(`  Attempts: ${output.attempts}`);
        console.log(`  Plan steps: ${output.plan.steps.length}`);

        expect(output.valid).toBe(true);
        expect(output.attempts).toBeLessThanOrEqual(3);
        expect(output.plan.steps.length).toBeGreaterThan(0);
      }
    },
    WORKFLOW_TIMEOUT,
  );

  test(
    "respects maxAttempts",
    async () => {
      logSectionHeader("REVISION WORKFLOW: maxAttempts");
      const goal = "Design an experiment to compare two retrieval methods.";
      const context = "Include confirmatory vs exploratory considerations.";

      const run = await planningWorkflow.createRun();
      const result = await run.start({
        inputData: {
          goal,
          context,
          maxAttempts: 1,
        },
      });

      console.log("\n=== Workflow Result ===");
      console.log(`  Status: ${result.status}`);

      expect(result.status).toBe("success");

      if (result.status === "success") {
        const output = result.result;
        console.log(`  Valid: ${output.valid}`);
        console.log(`  Attempts: ${output.attempts}`);
        console.log(`  Plan steps: ${output.plan.steps.length}`);

        expect(output.attempts).toBe(1);
      }
    },
    WORKFLOW_TIMEOUT,
  );
});
