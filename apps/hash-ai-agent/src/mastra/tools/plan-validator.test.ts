/**
 * Plan Validator Unit Tests — Negative Fixtures
 *
 * Tests that the validator correctly catches each type of structural error.
 * No LLM calls — pure deterministic validation tests.
 *
 * Each test creates an invalid PlanSpec and verifies that:
 * 1. The validator returns valid: false
 * 2. The correct error code is present
 * 3. Error messages contain expected context
 */

import { describe, expect, test } from "vitest";

import type { PlanSpec } from "../schemas/plan-spec";
import {
  getErrorsByCode,
  hasError,
  validatePlan,
  type ValidationErrorCode,
} from "./plan-validator";

// =============================================================================
// TEST HELPERS
// =============================================================================

/**
 * Creates a minimal valid plan that can be modified to create invalid variants.
 */
function createBasePlan(): PlanSpec {
  return {
    id: "test-plan",
    goalSummary: "Test goal for validation",
    requirements: [
      {
        id: "R1",
        description: "Test requirement",
        priority: "must",
      },
    ],
    hypotheses: [],
    steps: [
      {
        type: "research",
        id: "S1",
        description: "Research step",
        dependencyIds: [],
        requirementIds: ["R1"],
        inputs: [],
        outputs: [{ name: "findings", description: "Research findings" }],
        query: "Test query",
        stoppingRule: "Find 3 relevant sources",
        concurrent: true,
        executor: { kind: "agent", ref: "literature-searcher" },
      },
    ],
    unknownsMap: {
      knownKnowns: ["We know the test framework works"],
      knownUnknowns: ["We don't know all edge cases"],
      unknownUnknowns: [
        {
          potentialSurprise: "Unexpected validation behavior",
          detectionSignal: "Tests fail in unexpected ways",
        },
      ],
      communityCheck: "Other developers can review test coverage",
    },
  };
}

/**
 * Helper to assert a plan fails validation with a specific error code.
 */
function expectError(plan: PlanSpec, code: ValidationErrorCode): void {
  const result = validatePlan(plan);
  expect(result.valid).toBe(false);
  expect(hasError(result, code)).toBe(true);
}

// =============================================================================
// NEGATIVE FIXTURE TESTS
// =============================================================================

describe("Plan Validator — Negative Fixtures", () => {
  // ---------------------------------------------------------------------------
  // Empty Plan
  // ---------------------------------------------------------------------------

  describe("EMPTY_PLAN", () => {
    test("rejects plan with no steps", () => {
      const plan = createBasePlan();
      plan.steps = [];

      expectError(plan, "EMPTY_PLAN");

      const result = validatePlan(plan);
      expect(result.summary.stepCount).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Duplicate IDs
  // ---------------------------------------------------------------------------

  describe("DUPLICATE_STEP_ID", () => {
    test("rejects plan with duplicate step IDs", () => {
      const plan = createBasePlan();
      // Add a second step with the same ID
      plan.steps.push({
        type: "research",
        id: "S1", // Duplicate!
        description: "Another research step",
        dependencyIds: [],
        requirementIds: ["R1"],
        inputs: [],
        outputs: [],
        query: "Another query",
        stoppingRule: "Find sources",
        concurrent: true,
        executor: { kind: "agent", ref: "literature-searcher" },
      });

      expectError(plan, "DUPLICATE_STEP_ID");

      const result = validatePlan(plan);
      const errors = getErrorsByCode(result, "DUPLICATE_STEP_ID");
      expect(errors[0]?.context).toBe("S1");
    });
  });

  describe("DUPLICATE_HYPOTHESIS_ID", () => {
    test("rejects plan with duplicate hypothesis IDs", () => {
      const plan = createBasePlan();
      plan.hypotheses = [
        {
          id: "H1",
          statement: "Hypothesis 1",
          assumptions: [],
          testableVia: "Experiment",
          status: "untested",
        },
        {
          id: "H1", // Duplicate!
          statement: "Hypothesis 2",
          assumptions: [],
          testableVia: "Another experiment",
          status: "untested",
        },
      ];

      expectError(plan, "DUPLICATE_HYPOTHESIS_ID");
    });
  });

  describe("DUPLICATE_REQUIREMENT_ID", () => {
    test("rejects plan with duplicate requirement IDs", () => {
      const plan = createBasePlan();
      plan.requirements.push({
        id: "R1", // Duplicate!
        description: "Another requirement",
        priority: "should",
      });

      expectError(plan, "DUPLICATE_REQUIREMENT_ID");
    });
  });

  // ---------------------------------------------------------------------------
  // Invalid References
  // ---------------------------------------------------------------------------

  describe("INVALID_STEP_REFERENCE", () => {
    test("rejects step with dependencyIds referencing non-existent step", () => {
      const plan = createBasePlan();
      plan.steps[0]!.dependencyIds = ["S99"]; // Non-existent

      expectError(plan, "INVALID_STEP_REFERENCE");

      const result = validatePlan(plan);
      const errors = getErrorsByCode(result, "INVALID_STEP_REFERENCE");
      expect(errors[0]?.details?.invalidRef).toBe("S99");
    });
  });

  describe("INVALID_HYPOTHESIS_REFERENCE", () => {
    test("rejects experiment step referencing non-existent hypothesis", () => {
      const plan = createBasePlan();
      plan.hypotheses = [
        {
          id: "H1",
          statement: "Test hypothesis",
          assumptions: [],
          testableVia: "Experiment",
          status: "untested",
        },
      ];
      plan.steps.push({
        type: "experiment",
        id: "S2",
        description: "Run experiment",
        dependencyIds: ["S1"],
        requirementIds: ["R1"],
        inputs: [],
        outputs: [],
        mode: "exploratory",
        hypothesisIds: ["H1", "H99"], // H99 doesn't exist
        procedure: "Test procedure",
        expectedOutcomes: ["Outcome A"],
        successCriteria: ["Criterion A"],
        concurrent: true,
        executor: { kind: "agent", ref: "experiment-runner" },
      });

      expectError(plan, "INVALID_HYPOTHESIS_REFERENCE");

      const result = validatePlan(plan);
      const errors = getErrorsByCode(result, "INVALID_HYPOTHESIS_REFERENCE");
      expect(errors[0]?.details?.invalidRef).toBe("H99");
    });
  });

  describe("INVALID_REQUIREMENT_REFERENCE", () => {
    test("rejects step referencing non-existent requirement", () => {
      const plan = createBasePlan();
      plan.steps[0]!.requirementIds = ["R1", "R99"]; // R99 doesn't exist

      expectError(plan, "INVALID_REQUIREMENT_REFERENCE");

      const result = validatePlan(plan);
      const errors = getErrorsByCode(result, "INVALID_REQUIREMENT_REFERENCE");
      expect(errors[0]?.details?.invalidRef).toBe("R99");
    });
  });

  // ---------------------------------------------------------------------------
  // Invalid Executor References
  // ---------------------------------------------------------------------------

  describe("INVALID_EXECUTOR_REFERENCE", () => {
    test("rejects step with unknown agent executor", () => {
      const plan = createBasePlan();
      plan.steps[0]!.executor = { kind: "agent", ref: "unknown-agent" };

      expectError(plan, "INVALID_EXECUTOR_REFERENCE");

      const result = validatePlan(plan);
      const errors = getErrorsByCode(result, "INVALID_EXECUTOR_REFERENCE");
      expect(errors[0]?.details?.invalidRef).toBe("unknown-agent");
    });
  });

  describe("EXECUTOR_CANNOT_HANDLE_STEP", () => {
    test("rejects research step assigned to develop-only agent", () => {
      const plan = createBasePlan();
      // documentation-writer can only handle "develop" steps
      plan.steps[0]!.executor = { kind: "agent", ref: "documentation-writer" };

      expectError(plan, "EXECUTOR_CANNOT_HANDLE_STEP");

      const result = validatePlan(plan);
      const errors = getErrorsByCode(result, "EXECUTOR_CANNOT_HANDLE_STEP");
      expect(errors[0]?.details?.agent).toBe("documentation-writer");
      expect(errors[0]?.details?.stepType).toBe("research");
    });

    test("rejects experiment step assigned to research-only agent", () => {
      const plan = createBasePlan();
      plan.hypotheses = [
        {
          id: "H1",
          statement: "Hypothesis",
          assumptions: [],
          testableVia: "Experiment",
          status: "untested",
        },
      ];
      plan.steps.push({
        type: "experiment",
        id: "S2",
        description: "Run experiment",
        dependencyIds: [],
        requirementIds: ["R1"],
        inputs: [],
        outputs: [],
        mode: "exploratory",
        hypothesisIds: ["H1"],
        procedure: "Test procedure",
        expectedOutcomes: ["Outcome"],
        successCriteria: ["Criterion"],
        concurrent: true,
        // paper-summarizer can only handle "research"
        executor: { kind: "agent", ref: "paper-summarizer" },
      });

      expectError(plan, "EXECUTOR_CANNOT_HANDLE_STEP");
    });
  });

  // ---------------------------------------------------------------------------
  // Experiment Rigor
  // ---------------------------------------------------------------------------

  describe("MISSING_PREREGISTERED_COMMITMENTS", () => {
    test("rejects confirmatory experiment without preregistered commitments", () => {
      const plan = createBasePlan();
      plan.hypotheses = [
        {
          id: "H1",
          statement: "Hypothesis",
          assumptions: [],
          testableVia: "Experiment",
          status: "untested",
        },
      ];
      plan.steps.push({
        type: "experiment",
        id: "S2",
        description: "Confirmatory experiment",
        dependencyIds: [],
        requirementIds: ["R1"],
        inputs: [],
        outputs: [],
        mode: "confirmatory", // Requires preregistration!
        hypothesisIds: ["H1"],
        procedure: "Test procedure",
        expectedOutcomes: ["Outcome"],
        successCriteria: ["Criterion"],
        // Missing preregisteredCommitments!
        concurrent: true,
        executor: { kind: "agent", ref: "experiment-runner" },
      });

      expectError(plan, "MISSING_PREREGISTERED_COMMITMENTS");
    });

    test("rejects confirmatory experiment with empty preregistered commitments", () => {
      const plan = createBasePlan();
      plan.hypotheses = [
        {
          id: "H1",
          statement: "Hypothesis",
          assumptions: [],
          testableVia: "Experiment",
          status: "untested",
        },
      ];
      plan.steps.push({
        type: "experiment",
        id: "S2",
        description: "Confirmatory experiment",
        dependencyIds: [],
        requirementIds: ["R1"],
        inputs: [],
        outputs: [],
        mode: "confirmatory",
        hypothesisIds: ["H1"],
        procedure: "Test procedure",
        expectedOutcomes: ["Outcome"],
        successCriteria: ["Criterion"],
        preregisteredCommitments: [], // Empty array!
        concurrent: true,
        executor: { kind: "agent", ref: "experiment-runner" },
      });

      expectError(plan, "MISSING_PREREGISTERED_COMMITMENTS");
    });

    test("accepts exploratory experiment without preregistered commitments", () => {
      const plan = createBasePlan();
      plan.hypotheses = [
        {
          id: "H1",
          statement: "Hypothesis",
          assumptions: [],
          testableVia: "Experiment",
          status: "untested",
        },
      ];
      plan.steps.push({
        type: "experiment",
        id: "S2",
        description: "Exploratory experiment",
        dependencyIds: [],
        requirementIds: ["R1"],
        inputs: [],
        outputs: [],
        mode: "exploratory", // Exploratory doesn't require preregistration
        hypothesisIds: ["H1"],
        procedure: "Test procedure",
        expectedOutcomes: ["Outcome"],
        successCriteria: ["Criterion"],
        // No preregisteredCommitments — OK for exploratory
        concurrent: true,
        executor: { kind: "agent", ref: "experiment-runner" },
      });

      const result = validatePlan(plan);
      expect(hasError(result, "MISSING_PREREGISTERED_COMMITMENTS")).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Synthesize Mode
  // ---------------------------------------------------------------------------

  describe("MISSING_EVALUATE_AGAINST", () => {
    test("rejects evaluative synthesize without evaluateAgainst criteria", () => {
      const plan = createBasePlan();
      plan.steps.push({
        type: "synthesize",
        id: "S2",
        description: "Evaluate results",
        dependencyIds: ["S1"],
        requirementIds: ["R1"],
        inputs: [],
        outputs: [],
        mode: "evaluative", // Requires evaluateAgainst!
        // Missing evaluateAgainst!
        concurrent: false,
        executor: { kind: "agent", ref: "progress-evaluator" },
      });

      expectError(plan, "MISSING_EVALUATE_AGAINST");
    });

    test("rejects evaluative synthesize with empty evaluateAgainst", () => {
      const plan = createBasePlan();
      plan.steps.push({
        type: "synthesize",
        id: "S2",
        description: "Evaluate results",
        dependencyIds: ["S1"],
        requirementIds: ["R1"],
        inputs: [],
        outputs: [],
        mode: "evaluative",
        evaluateAgainst: [], // Empty array!
        concurrent: false,
        executor: { kind: "agent", ref: "progress-evaluator" },
      });

      expectError(plan, "MISSING_EVALUATE_AGAINST");
    });

    test("accepts integrative synthesize without evaluateAgainst", () => {
      const plan = createBasePlan();
      plan.steps.push({
        type: "synthesize",
        id: "S2",
        description: "Combine findings",
        dependencyIds: ["S1"],
        requirementIds: ["R1"],
        inputs: [],
        outputs: [],
        mode: "integrative", // Integrative doesn't require evaluateAgainst
        // No evaluateAgainst — OK for integrative
        concurrent: false,
        executor: { kind: "agent", ref: "result-synthesizer" },
      });

      const result = validatePlan(plan);
      expect(hasError(result, "MISSING_EVALUATE_AGAINST")).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Cycle Detection
  // ---------------------------------------------------------------------------

  describe("CYCLE_DETECTED", () => {
    test("rejects plan with self-referencing step", () => {
      const plan = createBasePlan();
      plan.steps[0]!.dependencyIds = ["S1"]; // Self-reference

      expectError(plan, "CYCLE_DETECTED");

      const result = validatePlan(plan);
      const errors = getErrorsByCode(result, "CYCLE_DETECTED");
      expect(errors[0]?.details?.cycle).toBeDefined();
    });

    test("rejects plan with two-step cycle", () => {
      const plan = createBasePlan();
      plan.steps.push({
        type: "synthesize",
        id: "S2",
        description: "Synthesize",
        dependencyIds: ["S1"],
        requirementIds: ["R1"],
        inputs: [],
        outputs: [],
        mode: "integrative",
        concurrent: false,
        executor: { kind: "agent", ref: "result-synthesizer" },
      });
      // Create cycle: S1 -> S2 -> S1
      plan.steps[0]!.dependencyIds = ["S2"];

      expectError(plan, "CYCLE_DETECTED");

      const result = validatePlan(plan);
      const errors = getErrorsByCode(result, "CYCLE_DETECTED");
      const cycle = errors[0]?.details?.cycle as string[];
      // Cycle should contain both S1 and S2
      expect(cycle).toContain("S1");
      expect(cycle).toContain("S2");
    });

    test("rejects plan with three-step cycle", () => {
      const plan = createBasePlan();
      plan.steps.push(
        {
          type: "research",
          id: "S2",
          description: "Research 2",
          dependencyIds: ["S1"],
          requirementIds: ["R1"],
          inputs: [],
          outputs: [],
          query: "Query 2",
          stoppingRule: "Rule 2",
          concurrent: true,
          executor: { kind: "agent", ref: "literature-searcher" },
        },
        {
          type: "research",
          id: "S3",
          description: "Research 3",
          dependencyIds: ["S2"],
          requirementIds: ["R1"],
          inputs: [],
          outputs: [],
          query: "Query 3",
          stoppingRule: "Rule 3",
          concurrent: true,
          executor: { kind: "agent", ref: "literature-searcher" },
        },
      );
      // Create cycle: S1 -> S2 -> S3 -> S1
      plan.steps[0]!.dependencyIds = ["S3"];

      expectError(plan, "CYCLE_DETECTED");
    });

    test("accepts valid DAG with diamond dependency pattern", () => {
      const plan = createBasePlan();
      // Diamond pattern: S1 -> S2 -> S4
      //                  S1 -> S3 -> S4
      // This is valid (not a cycle)
      plan.steps = [
        {
          type: "research",
          id: "S1",
          description: "Initial research",
          dependencyIds: [],
          requirementIds: ["R1"],
          inputs: [],
          outputs: [{ name: "findings", description: "Findings" }],
          query: "Initial query",
          stoppingRule: "Find sources",
          concurrent: true,
          executor: { kind: "agent", ref: "literature-searcher" },
        },
        {
          type: "research",
          id: "S2",
          description: "Branch A",
          dependencyIds: ["S1"],
          requirementIds: ["R1"],
          inputs: [],
          outputs: [],
          query: "Branch A query",
          stoppingRule: "Find sources",
          concurrent: true,
          executor: { kind: "agent", ref: "literature-searcher" },
        },
        {
          type: "research",
          id: "S3",
          description: "Branch B",
          dependencyIds: ["S1"],
          requirementIds: ["R1"],
          inputs: [],
          outputs: [],
          query: "Branch B query",
          stoppingRule: "Find sources",
          concurrent: true,
          executor: { kind: "agent", ref: "literature-searcher" },
        },
        {
          type: "synthesize",
          id: "S4",
          description: "Combine branches",
          dependencyIds: ["S2", "S3"],
          requirementIds: ["R1"],
          inputs: [],
          outputs: [],
          mode: "integrative",
          concurrent: false,
          executor: { kind: "agent", ref: "result-synthesizer" },
        },
      ];

      const result = validatePlan(plan);
      expect(hasError(result, "CYCLE_DETECTED")).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Multiple Errors
  // ---------------------------------------------------------------------------

  describe("Multiple errors", () => {
    test("catches all errors in a plan with multiple issues", () => {
      const plan: PlanSpec = {
        id: "broken-plan",
        goalSummary: "A plan with many issues",
        requirements: [
          { id: "R1", description: "Req 1", priority: "must" },
          { id: "R1", description: "Req 2", priority: "must" }, // Duplicate
        ],
        hypotheses: [],
        steps: [
          {
            type: "research",
            id: "S1",
            description: "Research",
            dependencyIds: ["S99"], // Invalid reference
            requirementIds: ["R99"], // Invalid reference
            inputs: [],
            outputs: [],
            query: "Query",
            stoppingRule: "Rule",
            concurrent: true,
            executor: { kind: "agent", ref: "unknown-agent" }, // Invalid executor
          },
        ],
        unknownsMap: {
          knownKnowns: [],
          knownUnknowns: [],
          unknownUnknowns: [],
          communityCheck: "",
        },
      };

      const result = validatePlan(plan);
      expect(result.valid).toBe(false);

      // Should have multiple error types
      expect(hasError(result, "DUPLICATE_REQUIREMENT_ID")).toBe(true);
      expect(hasError(result, "INVALID_STEP_REFERENCE")).toBe(true);
      expect(hasError(result, "INVALID_REQUIREMENT_REFERENCE")).toBe(true);
      expect(hasError(result, "INVALID_EXECUTOR_REFERENCE")).toBe(true);

      // Summary should reflect error count
      expect(result.summary.errorCount).toBeGreaterThanOrEqual(4);
    });
  });

  // ---------------------------------------------------------------------------
  // Valid Plan (Sanity Check)
  // ---------------------------------------------------------------------------

  describe("Valid plans", () => {
    test("accepts a minimal valid plan", () => {
      const plan = createBasePlan();
      const result = validatePlan(plan);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.summary.errorCount).toBe(0);
    });

    test("accepts a complex valid plan", () => {
      const plan: PlanSpec = {
        id: "complex-valid-plan",
        goalSummary: "A complex but valid plan",
        aimType: "explain",
        requirements: [
          { id: "R1", description: "Understand X", priority: "must" },
          { id: "R2", description: "Test hypothesis", priority: "should" },
        ],
        hypotheses: [
          {
            id: "H1",
            statement: "X causes Y",
            assumptions: ["A exists", "B is measurable"],
            testableVia: "Controlled experiment",
            status: "untested",
          },
        ],
        steps: [
          {
            type: "research",
            id: "S1",
            description: "Literature review",
            dependencyIds: [],
            requirementIds: ["R1"],
            inputs: [],
            outputs: [{ name: "papers", description: "Relevant papers" }],
            query: "X and Y relationship",
            stoppingRule: "10 relevant papers",
            concurrent: true,
            executor: { kind: "agent", ref: "literature-searcher" },
          },
          {
            type: "synthesize",
            id: "S2",
            description: "Summarize findings",
            dependencyIds: ["S1"],
            requirementIds: ["R1"],
            inputs: [{ name: "papers", description: "Papers" }],
            outputs: [{ name: "summary", description: "Literature summary" }],
            mode: "integrative",
            concurrent: false,
            executor: { kind: "agent", ref: "result-synthesizer" },
          },
          {
            type: "experiment",
            id: "S3",
            description: "Test hypothesis",
            dependencyIds: ["S2"],
            requirementIds: ["R2"],
            inputs: [{ name: "summary", description: "Summary" }],
            outputs: [{ name: "results", description: "Experiment results" }],
            mode: "confirmatory",
            hypothesisIds: ["H1"],
            procedure: "Controlled A/B test",
            expectedOutcomes: ["H1 supported", "H1 refuted"],
            successCriteria: ["p < 0.05", "Effect size > 0.3"],
            preregisteredCommitments: [
              "Sample size: 100",
              "Analysis: t-test",
              "Stopping rule: fixed sample",
            ],
            concurrent: true,
            executor: { kind: "agent", ref: "experiment-runner" },
          },
          {
            type: "synthesize",
            id: "S4",
            description: "Evaluate results",
            dependencyIds: ["S3"],
            requirementIds: ["R1", "R2"],
            inputs: [{ name: "results", description: "Results" }],
            outputs: [{ name: "conclusion", description: "Final conclusion" }],
            mode: "evaluative",
            evaluateAgainst: [
              "Does the evidence support H1?",
              "What is the effect size?",
              "Are there confounding factors?",
            ],
            concurrent: false,
            executor: { kind: "agent", ref: "progress-evaluator" },
          },
        ],
        unknownsMap: {
          knownKnowns: ["X and Y are measurable", "Prior studies exist"],
          knownUnknowns: ["Exact mechanism", "Boundary conditions"],
          unknownUnknowns: [
            {
              potentialSurprise: "Relationship is non-linear",
              detectionSignal: "Poor model fit with linear assumptions",
            },
          ],
          communityCheck: "Share data and analysis code for replication",
        },
        estimatedComplexity: "medium",
      };

      const result = validatePlan(plan);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.summary.stepCount).toBe(4);
      expect(result.summary.hypothesisCount).toBe(1);
      expect(result.summary.requirementCount).toBe(2);
    });
  });
});
