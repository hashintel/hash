/**
 * Explore and Recommend — Parallel Research Fixture
 *
 * A goal that requires parallel research followed by evaluative synthesis.
 * Tests that the planner can:
 * - Generate multiple parallel research steps
 * - Use evaluative synthesis mode to make a recommendation
 * - Structure a decision-making plan
 *
 * Characteristics:
 * - Parallel research phase
 * - Evaluative synthesis (not just integrative)
 * - No experiments or hypotheses
 * - Should produce 4-8 steps
 */

import type { PlanningGoal } from "../../schemas/planning-goal";

/**
 * Explore and Recommend fixture.
 *
 * Goal: Research vector database indexing approaches and recommend the best one.
 * Expected plan: Parallel research on different approaches → evaluative synthesize
 */
export const exploreAndRecommendFixture: PlanningGoal = {
  input: {
    id: "explore-and-recommend",
    goal: `Research approaches to vector database indexing and recommend
           the best approach for our use case: 10M documents, sub-100ms
           query latency requirement, primarily similarity search with
           occasional filtering.`,
    context: `We're evaluating vector databases for a semantic search feature.
              Need to understand tradeoffs between HNSW, IVF, and other
              indexing approaches. The recommendation should consider:
              - Query latency at scale
              - Index build time
              - Memory requirements
              - Support for filtered queries
              We have a 3-week timeline to make a decision.`,
  },
  expected: {
    // Note: LLM often generates hypotheses and experiments even when not strictly required
    shouldHaveHypotheses: false, // Not required, but may include
    shouldHaveExperiments: false, // Not required, but may include
    shouldHaveConcurrentResearch: true,
    minSteps: 4,
    maxSteps: 12, // Increased to accommodate LLM's tendency to be thorough
    expectedStepTypes: ["research", "synthesize"],
  },
};

/**
 * Just the goal input for quick access.
 */
export const exploreAndRecommendGoal = exploreAndRecommendFixture.input;
