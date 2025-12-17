/**
 * Decomposition Prompts — Test Fixtures
 *
 * Exports all planning fixtures for use in tests and experiments.
 * Fixtures are ordered by complexity (simplest first).
 */

// Re-export types
export type {
  ExpectedPlanCharacteristics,
  PlanningFixture,
  PlanningGoalInput,
} from "../../schemas/planning-fixture";

// Full complexity: Complete R&D cycle
export { ctDatabaseGoal, ctDatabaseGoalFixture } from "./ct-database-goal";

// Medium: Parallel research → evaluative synthesize
export {
  exploreAndRecommendFixture,
  exploreAndRecommendGoal,
} from "./explore-and-recommend";

// Complex: Research → experiment → synthesize (with hypotheses)
export {
  hypothesisValidationFixture,
  hypothesisValidationGoal,
} from "./hypothesis-validation";

// Simple: Linear research → synthesize
export { summarizePapersFixture, summarizePapersGoal } from "./summarize-papers";
