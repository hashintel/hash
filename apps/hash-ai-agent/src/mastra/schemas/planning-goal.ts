/**
 * Planning Fixture Types
 *
 * Types for test fixtures used in the planning pipeline.
 * These define the shape of goal inputs and expected plan characteristics.
 */

import type { StepType } from "./plan-spec";

/**
 * Input for the planner agent.
 */
export interface PlanningGoalInput {
  /** Unique identifier for this goal */
  id: string;
  /** The goal to decompose into a plan */
  goal: string;
  /** Additional context to inform planning */
  context: string;
}

/**
 * Expected characteristics of the generated plan.
 * Used for manual inspection and future automated scoring.
 */
export interface ExpectedPlanCharacteristics {
  /** Should the plan include hypotheses? */
  shouldHaveHypotheses: boolean;
  /** Should the plan include experiment steps? */
  shouldHaveExperiments: boolean;
  /** Should research steps be concurrent? */
  shouldHaveConcurrentResearch: boolean;
  /** Minimum expected step count */
  minSteps: number;
  /** Maximum expected step count (optional) */
  maxSteps?: number;
  /** Expected step types in the plan */
  expectedStepTypes: StepType[];
}

/**
 * A complete planning fixture with input and expected characteristics.
 */
export interface PlanningGoal {
  input: PlanningGoalInput;
  expected: ExpectedPlanCharacteristics;
}
