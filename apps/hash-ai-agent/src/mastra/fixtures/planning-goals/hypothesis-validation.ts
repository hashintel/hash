/**
 * Hypothesis Validation — Experiment-Based Fixture
 *
 * A goal that requires forming and testing hypotheses through experiments.
 * Tests that the planner can:
 * - Generate hypotheses from initial research
 * - Design experiments to test hypotheses
 * - Use confirmatory vs exploratory experiment modes appropriately
 * - Include preregistered commitments for confirmatory experiments
 *
 * Characteristics:
 * - Research → hypothesize (implicit) → experiment → synthesize
 * - Should include at least one hypothesis
 * - Should include at least one experiment step
 * - May include confirmatory experiments with preregistration
 * - Should produce 5-10 steps
 */

import type { PlanningGoal } from "../../schemas/planning-goal";

/**
 * Hypothesis Validation fixture.
 *
 * Goal: Test whether fine-tuning outperforms few-shot prompting for entity extraction.
 * Expected plan: Research → form hypothesis → design experiment → run → evaluate
 */
export const hypothesisValidationFixture: PlanningGoal = {
  input: {
    id: "hypothesis-validation",
    goal: `Test whether fine-tuning a small LLM (e.g., Llama 3 8B) on
           domain-specific data outperforms few-shot prompting with a
           larger model (e.g., GPT-4) for our entity extraction task.`,
    context: `We have 5,000 labeled examples of entity extraction from
              legal documents. Entities include: parties, dates, monetary
              amounts, contract terms, and obligations.

              Key considerations:
              - Accuracy (F1 score) is the primary metric
              - Inference cost matters for production (processing ~10K docs/day)
              - We need to justify the choice to stakeholders

              The experiment should be rigorous enough to defend the
              recommendation. We suspect fine-tuning might win on accuracy
              but need to verify this hypothesis.`,
  },
  expected: {
    shouldHaveHypotheses: true,
    shouldHaveExperiments: true,
    shouldHaveConcurrentResearch: false,
    minSteps: 5,
    maxSteps: 15,
    expectedStepTypes: ["research", "experiment", "synthesize"],
  },
};

/**
 * Just the goal input for quick access.
 */
export const hypothesisValidationGoal = hypothesisValidationFixture.input;
