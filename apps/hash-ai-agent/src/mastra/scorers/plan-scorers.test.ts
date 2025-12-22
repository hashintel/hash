/**
 * Plan Scorers Unit Tests
 *
 * Tests for deterministic plan scoring functions.
 * All tests use hand-crafted plans to verify scoring logic.
 */

import { describe, expect, test } from "vitest";

import type { PlanSpec } from "../schemas/plan-spec";
import {
  scoreExperimentRigor,
  scorePlanComposite,
  scorePlanCoverage,
  scorePlanStructure,
  scoreUnknownsCoverage,
} from "./plan-scorers";

// =============================================================================
// TEST HELPERS
// =============================================================================

/**
 * Creates a minimal valid plan for testing.
 */
function createMinimalPlan(): PlanSpec {
  return {
    id: "test-plan",
    goalSummary: "Test goal",
    requirements: [
      { id: "R1", description: "Requirement 1", priority: "must" },
    ],
    hypotheses: [],
    steps: [
      {
        type: "research",
        id: "S1",
        description: "Research",
        dependencyIds: [],
        requirementIds: ["R1"],
        inputs: [],
        outputs: [{ name: "findings", description: "Findings" }],
        query: "Query",
        stoppingRule: "Rule",
        concurrent: true,
        executor: { kind: "agent", ref: "literature-searcher" },
      },
    ],
    unknownsMap: {
      knownKnowns: ["Fact 1", "Fact 2"],
      knownUnknowns: ["Question 1", "Question 2"],
      unknownUnknowns: [
        {
          potentialSurprise: "Something unexpected could happen here",
          detectionSignal: "We would notice via this observable signal",
        },
      ],
      communityCheck: "Others can verify by examining our data and methodology",
    },
  };
}

/**
 * Creates a complex plan with all step types for testing.
 */
function createComplexPlan(): PlanSpec {
  return {
    id: "complex-plan",
    goalSummary: "Complex research goal",
    aimType: "explain",
    requirements: [
      { id: "R1", description: "Must requirement", priority: "must" },
      { id: "R2", description: "Should requirement", priority: "should" },
      { id: "R3", description: "Could requirement", priority: "could" },
    ],
    hypotheses: [
      {
        id: "H1",
        statement: "Hypothesis 1",
        assumptions: ["Assumption"],
        testableVia: "Experiment",
        status: "untested",
      },
      {
        id: "H2",
        statement: "Hypothesis 2",
        assumptions: [],
        testableVia: "Experiment",
        status: "untested",
      },
    ],
    steps: [
      {
        type: "research",
        id: "S1",
        description: "Initial research",
        dependencyIds: [],
        requirementIds: ["R1"],
        inputs: [],
        outputs: [{ name: "findings", description: "Findings" }],
        query: "Initial query",
        stoppingRule: "Find 5 sources",
        concurrent: true,
        executor: { kind: "agent", ref: "literature-searcher" },
      },
      {
        type: "research",
        id: "S2",
        description: "Parallel research",
        dependencyIds: [],
        requirementIds: ["R2"],
        inputs: [],
        outputs: [{ name: "data", description: "Data" }],
        query: "Parallel query",
        stoppingRule: "Collect data",
        concurrent: true,
        executor: { kind: "agent", ref: "literature-searcher" },
      },
      {
        type: "synthesize",
        id: "S3",
        description: "Combine findings",
        dependencyIds: ["S1", "S2"],
        requirementIds: ["R1", "R2"],
        inputs: [
          { name: "findings", description: "From S1" },
          { name: "data", description: "From S2" },
        ],
        outputs: [{ name: "synthesis", description: "Combined understanding" }],
        mode: "integrative",
        concurrent: false,
        executor: { kind: "agent", ref: "result-synthesizer" },
      },
      {
        type: "experiment",
        id: "S4",
        description: "Test hypothesis",
        dependencyIds: ["S3"],
        requirementIds: ["R1"],
        inputs: [{ name: "synthesis", description: "From S3" }],
        outputs: [{ name: "results", description: "Experiment results" }],
        mode: "confirmatory",
        hypothesisIds: ["H1"],
        procedure: "Test procedure",
        expectedOutcomes: ["H1 supported", "H1 refuted"],
        successCriteria: ["p < 0.05"],
        preregisteredCommitments: ["Sample size: 100", "Analysis: t-test"],
        concurrent: true,
        executor: { kind: "agent", ref: "experiment-runner" },
      },
      {
        type: "develop",
        id: "S5",
        description: "Build prototype",
        dependencyIds: ["S4"],
        requirementIds: ["R3"],
        inputs: [{ name: "results", description: "From S4" }],
        outputs: [{ name: "prototype", description: "Working prototype" }],
        specification: "Build X based on findings",
        deliverables: ["Code", "Tests"],
        concurrent: false,
        executor: { kind: "agent", ref: "code-writer" },
      },
    ],
    unknownsMap: {
      knownKnowns: ["We know X", "We know Y", "We know Z"],
      knownUnknowns: ["What is A?", "How does B work?", "Why does C happen?"],
      unknownUnknowns: [
        {
          potentialSurprise: "The relationship might be non-linear",
          detectionSignal: "Model residuals show systematic pattern",
        },
        {
          potentialSurprise: "External factor could confound results",
          detectionSignal: "Effect size varies unexpectedly across groups",
        },
      ],
      communityCheck:
        "Provide data, code, and preregistration for independent replication",
    },
    estimatedComplexity: "high",
  };
}

// =============================================================================
// PLAN STRUCTURE SCORER TESTS
// =============================================================================

describe("scorePlanStructure", () => {
  test("scores valid DAG structure highly", () => {
    const plan = createMinimalPlan();
    const result = scorePlanStructure(plan);

    expect(result.score).toBeGreaterThan(0);
    expect(result.details.isValidDag).toBe(true);
    expect(result.details.validationErrorCount).toBe(0);
  });

  test("returns zero score for invalid DAG", () => {
    const plan = createMinimalPlan();
    plan.steps[0]!.dependencyIds = ["S1"]; // Self-cycle

    const result = scorePlanStructure(plan);

    expect(result.score).toBe(0);
    expect(result.details.isValidDag).toBe(false);
    expect(result.reason).toContain("Invalid plan structure");
  });

  test("rewards parallel opportunity", () => {
    const sequentialPlan = createMinimalPlan();
    sequentialPlan.steps.push({
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

    const parallelPlan = createMinimalPlan();
    parallelPlan.steps.push({
      type: "research",
      id: "S2",
      description: "Parallel research",
      dependencyIds: [], // No dependency — can run in parallel
      requirementIds: ["R1"],
      inputs: [],
      outputs: [],
      query: "Query 2",
      stoppingRule: "Rule",
      concurrent: true,
      executor: { kind: "agent", ref: "literature-searcher" },
    });

    const seqResult = scorePlanStructure(sequentialPlan);
    const parResult = scorePlanStructure(parallelPlan);

    // Parallel plan should have higher parallelism ratio
    expect(parResult.details.maxParallelism).toBeGreaterThanOrEqual(
      seqResult.details.maxParallelism,
    );
  });

  test("counts step type distribution", () => {
    const plan = createComplexPlan();
    const result = scorePlanStructure(plan);

    expect(result.details.stepTypeDistribution.research).toBe(2);
    expect(result.details.stepTypeDistribution.synthesize).toBe(1);
    expect(result.details.stepTypeDistribution.experiment).toBe(1);
    expect(result.details.stepTypeDistribution.develop).toBe(1);
  });
});

// =============================================================================
// PLAN COVERAGE SCORER TESTS
// =============================================================================

describe("scorePlanCoverage", () => {
  test("scores full coverage highly", () => {
    const plan = createMinimalPlan();
    const result = scorePlanCoverage(plan);

    expect(result.score).toBeGreaterThan(0.8);
    expect(result.details.mustCoverageRatio).toBe(1);
    expect(result.details.uncoveredRequirements).toHaveLength(0);
  });

  test("penalizes uncovered requirements", () => {
    const plan = createMinimalPlan();
    plan.requirements.push({
      id: "R2",
      description: "Uncovered requirement",
      priority: "must",
    });

    const result = scorePlanCoverage(plan);

    expect(result.details.uncoveredRequirements).toContain("R2");
    expect(result.details.mustCoverageRatio).toBe(0.5);
    expect(result.score).toBeLessThan(1);
  });

  test("weighs must requirements more than should", () => {
    // Plan with uncovered "must"
    const mustUncoveredPlan = createMinimalPlan();
    mustUncoveredPlan.requirements[0]!.priority = "must";
    mustUncoveredPlan.steps[0]!.requirementIds = []; // Don't cover it

    // Plan with uncovered "should"
    const shouldUncoveredPlan = createMinimalPlan();
    shouldUncoveredPlan.requirements.push({
      id: "R2",
      description: "Should req",
      priority: "should",
    });
    // R1 is covered, R2 is not

    const mustResult = scorePlanCoverage(mustUncoveredPlan);
    const shouldResult = scorePlanCoverage(shouldUncoveredPlan);

    // Uncovered "must" should hurt more than uncovered "should"
    expect(mustResult.score).toBeLessThan(shouldResult.score);
  });

  test("penalizes untested hypotheses", () => {
    const plan = createMinimalPlan();
    plan.hypotheses = [
      {
        id: "H1",
        statement: "Hypothesis",
        assumptions: [],
        testableVia: "Experiment",
        status: "untested",
      },
    ];
    // No experiment step to test H1

    const result = scorePlanCoverage(plan);

    expect(result.details.untestedHypotheses).toContain("H1");
    expect(result.details.testedHypothesisCount).toBe(0);
  });

  test("rewards tested hypotheses", () => {
    const plan = createComplexPlan();
    const result = scorePlanCoverage(plan);

    expect(result.details.testedHypothesisCount).toBe(1); // H1 is tested by S4
    expect(result.details.untestedHypotheses).toContain("H2"); // H2 is not tested
  });
});

// =============================================================================
// EXPERIMENT RIGOR SCORER TESTS
// =============================================================================

describe("scoreExperimentRigor", () => {
  test("returns perfect score for plans without experiments", () => {
    const plan = createMinimalPlan();
    const result = scoreExperimentRigor(plan);

    expect(result.score).toBe(1.0);
    expect(result.reason).toContain("not applicable");
  });

  test("rewards preregistered confirmatory experiments", () => {
    const plan = createComplexPlan();
    const result = scoreExperimentRigor(plan);

    expect(result.details.experimentCount).toBe(1);
    expect(result.details.preregisteredCount).toBe(1);
    expect(result.score).toBeGreaterThan(0.5);
  });

  test("penalizes confirmatory experiments without preregistration", () => {
    const plan = createMinimalPlan();
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
      description: "Experiment",
      dependencyIds: ["S1"],
      requirementIds: ["R1"],
      inputs: [],
      outputs: [],
      mode: "confirmatory",
      hypothesisIds: ["H1"],
      procedure: "Procedure",
      expectedOutcomes: ["Outcome"],
      successCriteria: ["Criterion"],
      // No preregisteredCommitments!
      concurrent: true,
      executor: { kind: "agent", ref: "experiment-runner" },
    });

    const result = scoreExperimentRigor(plan);

    expect(result.details.preregisteredCount).toBe(0);
    expect(result.score).toBeLessThan(0.8);
  });

  test("allows exploratory experiments without preregistration", () => {
    const plan = createMinimalPlan();
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
      dependencyIds: ["S1"],
      requirementIds: ["R1"],
      inputs: [],
      outputs: [],
      mode: "exploratory", // Exploratory doesn't need preregistration
      hypothesisIds: ["H1"],
      procedure: "Procedure",
      expectedOutcomes: ["Outcome"],
      successCriteria: ["Criterion"],
      concurrent: true,
      executor: { kind: "agent", ref: "experiment-runner" },
    });

    const result = scoreExperimentRigor(plan);

    // Should not be penalized for lack of preregistration
    expect(result.score).toBeGreaterThan(0.6);
  });

  test("rewards experiments with success criteria", () => {
    const withCriteria = createMinimalPlan();
    const withoutCriteria = createMinimalPlan();

    const experimentWithCriteria = {
      type: "experiment" as const,
      id: "S2",
      description: "Experiment",
      dependencyIds: ["S1"],
      requirementIds: ["R1"],
      inputs: [],
      outputs: [],
      mode: "exploratory" as const,
      hypothesisIds: [] as string[],
      procedure: "Procedure",
      expectedOutcomes: ["Outcome"],
      successCriteria: ["Criterion 1", "Criterion 2"],
      concurrent: true,
      executor: { kind: "agent" as const, ref: "experiment-runner" },
    };

    const experimentWithoutCriteria = {
      ...experimentWithCriteria,
      successCriteria: [] as string[],
    };

    withCriteria.steps.push(experimentWithCriteria);
    withoutCriteria.steps.push(experimentWithoutCriteria);

    const withResult = scoreExperimentRigor(withCriteria);
    const withoutResult = scoreExperimentRigor(withoutCriteria);

    expect(withResult.details.withSuccessCriteriaCount).toBe(1);
    expect(withoutResult.details.withSuccessCriteriaCount).toBe(0);
    expect(withResult.score).toBeGreaterThan(withoutResult.score);
  });
});

// =============================================================================
// UNKNOWNS COVERAGE SCORER TESTS
// =============================================================================

describe("scoreUnknownsCoverage", () => {
  test("rewards comprehensive unknowns map", () => {
    const plan = createComplexPlan();
    const result = scoreUnknownsCoverage(plan);

    expect(result.score).toBeGreaterThan(0.8);
    expect(result.details.knownKnownsCount).toBe(3);
    expect(result.details.knownUnknownsCount).toBe(3);
    expect(result.details.unknownUnknownsCount).toBe(2);
    expect(result.details.hasCommunityCheck).toBe(true);
  });

  test("penalizes empty unknowns map", () => {
    const plan = createMinimalPlan();
    plan.unknownsMap = {
      knownKnowns: [],
      knownUnknowns: [],
      unknownUnknowns: [],
      communityCheck: "",
    };

    const result = scoreUnknownsCoverage(plan);

    expect(result.score).toBe(0);
    expect(result.details.hasCommunityCheck).toBe(false);
  });

  test("requires substantive detection signals in unknown-unknowns", () => {
    const plan = createMinimalPlan();
    plan.unknownsMap.unknownUnknowns = [
      {
        potentialSurprise: "Short", // Too short
        detectionSignal: "Short", // Too short
      },
    ];

    const result = scoreUnknownsCoverage(plan);

    // Should not count the weak unknown-unknown
    expect(result.score).toBeLessThan(1);
  });

  test("rewards presence of community check", () => {
    const withCheck = createMinimalPlan();
    const withoutCheck = createMinimalPlan();
    withoutCheck.unknownsMap.communityCheck = ""; // Empty

    const withResult = scoreUnknownsCoverage(withCheck);
    const withoutResult = scoreUnknownsCoverage(withoutCheck);

    expect(withResult.details.hasCommunityCheck).toBe(true);
    expect(withoutResult.details.hasCommunityCheck).toBe(false);
    expect(withResult.score).toBeGreaterThan(withoutResult.score);
  });
});

// =============================================================================
// COMPOSITE SCORER TESTS
// =============================================================================

describe("scorePlanComposite", () => {
  test("combines all scorer results", () => {
    const plan = createComplexPlan();
    const result = scorePlanComposite(plan);

    expect(result.overall).toBeGreaterThan(0);
    expect(result.overall).toBeLessThanOrEqual(1);
    expect(result.structure.score).toBeDefined();
    expect(result.coverage.score).toBeDefined();
    expect(result.experimentRigor.score).toBeDefined();
    expect(result.unknownsCoverage.score).toBeDefined();
  });

  test("overall is weighted average of components", () => {
    const plan = createComplexPlan();
    const result = scorePlanComposite(plan);

    // Default weights: structure 0.25, coverage 0.3, experimentRigor 0.25, unknowns 0.2
    const expectedOverall =
      0.25 * result.structure.score +
      0.3 * result.coverage.score +
      0.25 * result.experimentRigor.score +
      0.2 * result.unknownsCoverage.score;

    expect(result.overall).toBeCloseTo(expectedOverall, 5);
  });

  test("accepts custom weights", () => {
    const plan = createComplexPlan();

    const result = scorePlanComposite(plan, {
      structure: 0.5,
      coverage: 0.5,
      experimentRigor: 0,
      unknownsCoverage: 0,
    });

    const expectedOverall =
      0.5 * result.structure.score + 0.5 * result.coverage.score;

    expect(result.overall).toBeCloseTo(expectedOverall, 5);
  });

  test("normalizes partial weights to keep overall score in [0, 1]", () => {
    const plan = createComplexPlan();

    // Partial weights that would sum to 1.45 without normalization
    const result = scorePlanComposite(plan, { structure: 0.7 });

    expect(result.overall).toBeGreaterThanOrEqual(0);
    expect(result.overall).toBeLessThanOrEqual(1);
  });

  test("minimal plan scores reasonably", () => {
    const plan = createMinimalPlan();
    const result = scorePlanComposite(plan);

    // Minimal plan should still get a reasonable score
    expect(result.overall).toBeGreaterThan(0.5);
  });

  test("complex plan scores higher than minimal", () => {
    const minimal = createMinimalPlan();
    const complex = createComplexPlan();

    const minResult = scorePlanComposite(minimal);
    const complexResult = scorePlanComposite(complex);

    expect(complexResult.overall).toBeGreaterThan(minResult.overall);

    // Complex plan has more step types, better coverage
    expect(complexResult.structure.details.stepTypeDistribution).not.toEqual(
      minResult.structure.details.stepTypeDistribution,
    );
  });
});
