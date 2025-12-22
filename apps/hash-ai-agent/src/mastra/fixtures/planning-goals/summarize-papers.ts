/**
 * Summarize Papers — Simplest Planning Fixture
 *
 * A minimal goal for testing the planning pipeline.
 * This is the "black triangle" fixture — the simplest case that exercises
 * the full goal → plan → validate flow.
 *
 * Characteristics:
 * - Linear flow (no complex branching)
 * - No experiments or hypotheses needed
 * - Parallel research → synthesize pattern
 * - Should produce 3-6 steps
 */

import type { PlanningGoal } from "../../schemas/planning-goal";

/**
 * Summarize Papers fixture — the simplest planning goal.
 *
 * Goal: Summarize 3 papers on RAG and produce a comparison table.
 * Expected plan: Parallel research → synthesize
 */
export const summarizePapersFixture: PlanningGoal = {
  input: {
    id: "summarize-papers",
    goal: `Summarize 3 recent papers on retrieval-augmented generation (RAG)
           and produce a comparison table of their approaches.`,
    context: `We need to understand the current landscape of RAG techniques
              for an internal tech review. Focus on papers from the last 2 years.
              The comparison should cover: architecture, retrieval method,
              performance claims, and limitations.`,
  },
  expected: {
    shouldHaveHypotheses: false,
    shouldHaveExperiments: false,
    shouldHaveConcurrentResearch: true,
    minSteps: 3,
    maxSteps: 6,
    expectedStepTypes: ["research", "synthesize"],
  },
};

/**
 * Just the goal input for quick access.
 */
export const summarizePapersGoal = summarizePapersFixture.input;
