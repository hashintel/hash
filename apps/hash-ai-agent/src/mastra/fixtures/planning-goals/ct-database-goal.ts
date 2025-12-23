/**
 * CT Database Goal — Full Complexity Fixture
 *
 * The most complex fixture, spanning the full R&D lifecycle:
 * research, hypothesis formation, experimentation, and development.
 *
 * Tests that the planner can:
 * - Handle ambitious, open-ended research goals
 * - Generate multiple hypotheses
 * - Design both exploratory and confirmatory experiments
 * - Plan development steps based on experimental findings
 * - Surface significant unknowns honestly
 * - Create a realistic phased plan
 *
 * Characteristics:
 * - Full R&D cycle: research → hypothesize → experiment → develop
 * - Multiple hypotheses expected
 * - Mix of exploratory and confirmatory experiments
 * - Should include development steps
 * - Significant unknowns to surface
 * - Should produce 8-15+ steps
 */

import type { PlanningGoal } from "../../schemas/planning-goal";

/**
 * CT Database Goal fixture — the aspirational target.
 *
 * Goal: Create a category-theory native database.
 * Expected plan: Multi-phase R&D with research, experimentation, and development.
 */
export const ctDatabaseGoalFixture: PlanningGoal = {
  input: {
    id: "ct-database-goal",
    goal: `Create a backend language and database that is natively aligned
           with category-theoretical expressions. This should support
           objects, morphisms, functors, and natural transformations as
           first-class concepts, with query performance competitive with
           traditional databases.`,
    context: `We're exploring whether category theory (CT) primitives can
              serve as a more natural foundation for data modeling than
              relational or document models.

              Key unknowns:
              - Can CT concepts be efficiently indexed and queried?
              - What's the right level of abstraction for practical use?
              - How do we handle the impedance mismatch with existing systems?
              - Is there prior art we can build on?

              This is a long-term research project (6-12 months). We need
              to validate feasibility before committing significant resources.

              The plan should include:
              1. Literature review of CT in databases and programming languages
              2. Feasibility experiments (can we represent and query CT structures?)
              3. Performance benchmarking against traditional approaches
              4. Prototype development if experiments are promising

              We're particularly interested in how functors could enable
              schema migrations and how natural transformations could
              express data transformations.`,
  },
  expected: {
    shouldHaveHypotheses: true,
    shouldHaveExperiments: true,
    shouldHaveConcurrentResearch: true,
    minSteps: 8,
    maxSteps: 20,
    expectedStepTypes: ["research", "experiment", "synthesize", "develop"],
  },
};

/**
 * Just the goal input for quick access.
 */
export const ctDatabaseGoal = ctDatabaseGoalFixture.input;
