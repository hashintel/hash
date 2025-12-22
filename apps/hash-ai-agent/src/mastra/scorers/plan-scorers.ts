/**
 * Plan Scorers — Deterministic Evaluation
 *
 * Deterministic scorers for evaluating PlanSpec quality.
 * All scorers are pure functions (no LLM calls) for fast, reproducible evaluation.
 *
 * Scorers:
 * - plan-structure: DAG validity, connectivity, parallelism opportunity
 * - plan-coverage: Requirements/hypothesis coverage by steps
 * - experiment-rigor: Preregistration, controls, testability
 * - unknowns-coverage: Epistemic completeness of unknowns map
 *
 * Each scorer returns a normalized score [0, 1] and detailed breakdown.
 */

import type { PlanSpec, PlanStep, StepType } from "../schemas/plan-spec";
import { validatePlan } from "../utils/plan-validator";
import { analyzePlanTopology } from "../utils/topology-analyzer";

// =============================================================================
// SCORER RESULT TYPES
// =============================================================================

/**
 * Common result structure for all scorers.
 */
export interface ScorerResult<TDetails = Record<string, unknown>> {
  /** Normalized score [0, 1] */
  score: number;
  /** Human-readable explanation */
  reason: string;
  /** Detailed breakdown of scoring factors */
  details: TDetails;
}

// =============================================================================
// PLAN STRUCTURE SCORER
// =============================================================================

export interface PlanStructureDetails {
  /** Is the plan a valid DAG? */
  isValidDag: boolean;
  /** Number of validation errors */
  validationErrorCount: number;
  /** Total number of steps */
  stepCount: number;
  /** Number of entry points (steps with no dependencies) */
  entryPointCount: number;
  /** Number of exit points (steps with no dependents) */
  exitPointCount: number;
  /** Critical path length */
  criticalPathLength: number;
  /** Maximum parallelism (max steps that can run concurrently) */
  maxParallelism: number;
  /** Ratio of concurrent steps to total steps */
  parallelismRatio: number;
  /** Step type distribution */
  stepTypeDistribution: Record<StepType, number>;
}

/**
 * Score the structural quality of a plan.
 *
 * Evaluates:
 * - DAG validity (must be valid for non-zero score)
 * - Entry/exit point structure (single entry/exit is cleaner)
 * - Parallelism opportunity (higher is better for efficiency)
 * - Step type diversity (balanced plans score higher)
 *
 * Scoring weights:
 * - DAG validity: 40% (gate — if invalid, max score is 0.4)
 * - Structure (entry/exit): 20%
 * - Parallelism opportunity: 20%
 * - Step type balance: 20%
 */
export function scorePlanStructure(
  plan: PlanSpec,
): ScorerResult<PlanStructureDetails> {
  const validation = validatePlan(plan);
  const details: PlanStructureDetails = {
    isValidDag: validation.valid,
    validationErrorCount: validation.errors.length,
    stepCount: plan.steps.length,
    entryPointCount: 0,
    exitPointCount: 0,
    criticalPathLength: 0,
    maxParallelism: 0,
    parallelismRatio: 0,
    stepTypeDistribution: {
      research: 0,
      synthesize: 0,
      experiment: 0,
      develop: 0,
    },
  };

  // Count step types
  for (const step of plan.steps) {
    details.stepTypeDistribution[step.type]++;
  }

  // If invalid DAG, return early with partial score
  if (!validation.valid) {
    return {
      score: 0,
      reason: `Invalid plan structure: ${validation.errors.length} validation errors. First error: ${
        validation.errors[0]?.message ?? "unknown"
      }`,
      details,
    };
  }

  // Analyze topology for valid plans
  const topology = analyzePlanTopology(plan);
  details.entryPointCount = topology.entryPoints.length;
  details.exitPointCount = topology.exitPoints.length;
  details.criticalPathLength = topology.criticalPath.length;
  details.maxParallelism = Math.max(
    1,
    ...topology.parallelGroups.map((group) => group.concurrentStepIds.length),
  );

  // Calculate parallelism ratio
  const concurrentSteps = plan.steps.filter(
    (step) => step.concurrent !== false,
  );
  details.parallelismRatio =
    plan.steps.length > 0 ? concurrentSteps.length / plan.steps.length : 0;

  // Calculate component scores
  const dagScore = 1.0; // Valid if we got here

  // Structure score: prefer single entry, single exit
  const entryPenalty = Math.max(0, (details.entryPointCount - 1) * 0.1);
  const exitPenalty = Math.max(0, (details.exitPointCount - 1) * 0.1);
  const structureScore = Math.max(0, 1 - entryPenalty - exitPenalty);

  // Parallelism score: reward parallel opportunity
  const parallelismScore = Math.min(
    1,
    details.maxParallelism / Math.max(3, plan.steps.length / 2),
  );

  // Balance score: reward step type diversity
  const usedTypes = Object.values(details.stepTypeDistribution).filter(
    (count) => count > 0,
  ).length;
  const balanceScore = usedTypes / 4; // 4 possible step types

  // Weighted combination
  const score =
    0.4 * dagScore +
    0.2 * structureScore +
    0.2 * parallelismScore +
    0.2 * balanceScore;

  const reason =
    `Valid DAG with ${details.stepCount} steps. ` +
    `Entry points: ${details.entryPointCount}, Exit points: ${details.exitPointCount}. ` +
    `Max parallelism: ${details.maxParallelism}. ` +
    `Step types used: ${usedTypes}/4.`;

  return { score, reason, details };
}

// =============================================================================
// PLAN COVERAGE SCORER
// =============================================================================

export interface PlanCoverageDetails {
  /** Total requirements in plan */
  requirementCount: number;
  /** Requirements addressed by at least one step */
  coveredRequirementCount: number;
  /** Requirements not addressed by any step */
  uncoveredRequirements: string[];
  /** Total hypotheses in plan */
  hypothesisCount: number;
  /** Hypotheses tested by at least one experiment */
  testedHypothesisCount: number;
  /** Hypotheses not tested by any experiment */
  untestedHypotheses: string[];
  /** "must" requirements coverage ratio */
  mustCoverageRatio: number;
  /** "should" requirements coverage ratio */
  shouldCoverageRatio: number;
}

/**
 * Score how well the plan covers its requirements and hypotheses.
 *
 * Evaluates:
 * - Requirement coverage (all requirements should have addressing steps)
 * - Hypothesis testing (all hypotheses should be tested by experiments)
 * - Priority weighting (must > should > could)
 *
 * Scoring weights:
 * - Must requirements: 50%
 * - Should/could requirements: 20%
 * - Hypothesis coverage: 30%
 */
export function scorePlanCoverage(
  plan: PlanSpec,
): ScorerResult<PlanCoverageDetails> {
  const details: PlanCoverageDetails = {
    requirementCount: plan.requirements.length,
    coveredRequirementCount: 0,
    uncoveredRequirements: [],
    hypothesisCount: plan.hypotheses.length,
    testedHypothesisCount: 0,
    untestedHypotheses: [],
    mustCoverageRatio: 0,
    shouldCoverageRatio: 0,
  };

  // Find covered requirements
  const coveredReqIds = new Set<string>();
  for (const step of plan.steps) {
    for (const reqId of step.requirementIds) {
      coveredReqIds.add(reqId);
    }
  }

  // Categorize requirements by priority and coverage
  const mustReqs = plan.requirements.filter((req) => req.priority === "must");
  const shouldReqs = plan.requirements.filter(
    (req) => req.priority === "should",
  );
  const coveredMustCount = mustReqs.filter((req) =>
    coveredReqIds.has(req.id),
  ).length;
  const coveredShouldCount = shouldReqs.filter((req) =>
    coveredReqIds.has(req.id),
  ).length;

  details.coveredRequirementCount = coveredReqIds.size;
  details.uncoveredRequirements = plan.requirements
    .filter((req) => !coveredReqIds.has(req.id))
    .map((req) => req.id);
  details.mustCoverageRatio =
    mustReqs.length > 0 ? coveredMustCount / mustReqs.length : 1;
  details.shouldCoverageRatio =
    shouldReqs.length > 0 ? coveredShouldCount / shouldReqs.length : 1;

  // Find tested hypotheses
  const testedHypIds = new Set<string>();
  for (const step of plan.steps) {
    if (step.type === "experiment") {
      for (const hypId of step.hypothesisIds) {
        testedHypIds.add(hypId);
      }
    }
  }

  details.testedHypothesisCount = testedHypIds.size;
  details.untestedHypotheses = plan.hypotheses
    .filter((hyp) => !testedHypIds.has(hyp.id))
    .map((hyp) => hyp.id);

  // Calculate hypothesis coverage ratio
  const hypothesisCoverageRatio =
    plan.hypotheses.length > 0 ? testedHypIds.size / plan.hypotheses.length : 1;

  // Calculate weighted score
  const mustScore = details.mustCoverageRatio;
  const shouldScore = details.shouldCoverageRatio;
  const hypothesisScore = hypothesisCoverageRatio;

  const score = 0.5 * mustScore + 0.2 * shouldScore + 0.3 * hypothesisScore;

  const reason =
    `Requirements: ${details.coveredRequirementCount}/${details.requirementCount} covered ` +
    `(must: ${(details.mustCoverageRatio * 100).toFixed(0)}%, should: ${(
      details.shouldCoverageRatio * 100
    ).toFixed(0)}%). ` +
    `Hypotheses: ${details.testedHypothesisCount}/${details.hypothesisCount} tested.`;

  return { score, reason, details };
}

// =============================================================================
// EXPERIMENT RIGOR SCORER
// =============================================================================

export interface ExperimentRigorDetails {
  /** Total experiment steps */
  experimentCount: number;
  /** Confirmatory experiments with preregistration */
  preregisteredCount: number;
  /** Experiments with success criteria defined */
  withSuccessCriteriaCount: number;
  /** Experiments with expected outcomes defined */
  withExpectedOutcomesCount: number;
  /** Average number of preregistered commitments per confirmatory experiment */
  avgPreregisteredCommitments: number;
  /** Confirmatory vs exploratory ratio */
  confirmatoryRatio: number;
}

/**
 * Score the experimental rigor of a plan.
 *
 * Evaluates:
 * - Preregistration for confirmatory experiments (required)
 * - Success criteria definition
 * - Expected outcomes documentation
 * - Balance of confirmatory vs exploratory
 *
 * Plans without experiments get a score of 1.0 (not applicable).
 *
 * Scoring weights:
 * - Preregistration compliance: 40%
 * - Success criteria: 25%
 * - Expected outcomes: 20%
 * - Confirmatory balance: 15%
 */
export function scoreExperimentRigor(
  plan: PlanSpec,
): ScorerResult<ExperimentRigorDetails> {
  const experiments = plan.steps.filter(
    (step): step is PlanStep & { type: "experiment" } =>
      step.type === "experiment",
  );

  const details: ExperimentRigorDetails = {
    experimentCount: experiments.length,
    preregisteredCount: 0,
    withSuccessCriteriaCount: 0,
    withExpectedOutcomesCount: 0,
    avgPreregisteredCommitments: 0,
    confirmatoryRatio: 0,
  };

  // No experiments = N/A (perfect score)
  if (experiments.length === 0) {
    return {
      score: 1.0,
      reason: "No experiments in plan — rigor score not applicable.",
      details,
    };
  }

  // Analyze experiments
  const confirmatory = experiments.filter((exp) => exp.mode === "confirmatory");
  let totalPreregCommitments = 0;

  for (const exp of experiments) {
    if (exp.successCriteria.length > 0) {
      details.withSuccessCriteriaCount++;
    }
    if (exp.expectedOutcomes.length > 0) {
      details.withExpectedOutcomesCount++;
    }
    if (
      exp.mode === "confirmatory" &&
      exp.preregisteredCommitments &&
      exp.preregisteredCommitments.length > 0
    ) {
      details.preregisteredCount++;
      totalPreregCommitments += exp.preregisteredCommitments.length;
    }
  }

  details.confirmatoryRatio = confirmatory.length / experiments.length;
  details.avgPreregisteredCommitments =
    confirmatory.length > 0 ? totalPreregCommitments / confirmatory.length : 0;

  // Calculate component scores
  // Preregistration: confirmatory experiments should have it
  const preregScore =
    confirmatory.length > 0
      ? details.preregisteredCount / confirmatory.length
      : 1;

  // Success criteria: all experiments should have them
  const successCriteriaScore =
    details.withSuccessCriteriaCount / experiments.length;

  // Expected outcomes: all experiments should have them
  const outcomesScore = details.withExpectedOutcomesCount / experiments.length;

  // Confirmatory balance: having some confirmatory is good (0.3-0.7 is ideal)
  // Score peaks at 50% confirmatory
  const confirmatoryBalance =
    details.confirmatoryRatio > 0
      ? 1 - Math.abs(details.confirmatoryRatio - 0.5) * 2
      : 0.5; // No confirmatory = neutral

  const score =
    0.4 * preregScore +
    0.25 * successCriteriaScore +
    0.2 * outcomesScore +
    0.15 * confirmatoryBalance;

  const reason =
    `${experiments.length} experiments: ` +
    `${details.preregisteredCount}/${confirmatory.length} confirmatory preregistered, ` +
    `${details.withSuccessCriteriaCount}/${experiments.length} with success criteria, ` +
    `${details.withExpectedOutcomesCount}/${experiments.length} with expected outcomes.`;

  return { score, reason, details };
}

// =============================================================================
// UNKNOWNS COVERAGE SCORER
// =============================================================================

export interface UnknownsCoverageDetails {
  /** Number of known-knowns documented */
  knownKnownsCount: number;
  /** Number of known-unknowns documented */
  knownUnknownsCount: number;
  /** Number of unknown-unknowns with detection signals */
  unknownUnknownsCount: number;
  /** Whether community check is substantive (>20 chars) */
  hasCommunityCheck: boolean;
  /** Total epistemic coverage score */
  epistemicCompleteness: number;
}

/**
 * Score the epistemic completeness of the unknowns map.
 *
 * Evaluates:
 * - Known-knowns: What we're building on (should have some)
 * - Known-unknowns: Questions we need to answer (should have some)
 * - Unknown-unknowns: What would surprise us + detection signals (valuable)
 * - Community check: What others need to verify claims (important for science)
 *
 * Scoring weights:
 * - Known-knowns presence: 20%
 * - Known-unknowns presence: 25%
 * - Unknown-unknowns with signals: 30%
 * - Community check quality: 25%
 */
export function scoreUnknownsCoverage(
  plan: PlanSpec,
): ScorerResult<UnknownsCoverageDetails> {
  const { unknownsMap } = plan;

  // Unknown-unknowns: having 1-3 with detection signals is excellent
  // Check that each has both potentialSurprise and detectionSignal
  const validUnknownUnknowns = unknownsMap.unknownUnknowns.filter(
    (uu) => uu.potentialSurprise.length > 10 && uu.detectionSignal.length > 10,
  );

  const details: UnknownsCoverageDetails = {
    knownKnownsCount: unknownsMap.knownKnowns.length,
    knownUnknownsCount: unknownsMap.knownUnknowns.length,
    unknownUnknownsCount: validUnknownUnknowns.length,
    hasCommunityCheck: unknownsMap.communityCheck.length > 20,
    epistemicCompleteness: 0,
  };

  // Calculate component scores
  // Known-knowns: having 2-5 is good
  const knownKnownsScore = Math.min(1, details.knownKnownsCount / 3);

  // Known-unknowns: having 2-5 is good
  const knownUnknownsScore = Math.min(1, details.knownUnknownsCount / 3);

  const unknownUnknownsScore = Math.min(1, validUnknownUnknowns.length / 2);

  // Community check: should be substantive
  const communityCheckScore = details.hasCommunityCheck ? 1 : 0;

  const score =
    0.2 * knownKnownsScore +
    0.25 * knownUnknownsScore +
    0.3 * unknownUnknownsScore +
    0.25 * communityCheckScore;

  details.epistemicCompleteness = score;

  const reason =
    `Epistemic coverage: ${details.knownKnownsCount} known-knowns, ` +
    `${details.knownUnknownsCount} known-unknowns, ` +
    `${details.unknownUnknownsCount} unknown-unknowns with detection signals. ` +
    `Community check: ${details.hasCommunityCheck ? "present" : "missing/weak"}.`;

  return { score, reason, details };
}

// =============================================================================
// COMPOSITE SCORER
// =============================================================================

export interface CompositePlanScore {
  /** Overall weighted score */
  overall: number;
  /** Individual scorer results */
  structure: ScorerResult<PlanStructureDetails>;
  coverage: ScorerResult<PlanCoverageDetails>;
  experimentRigor: ScorerResult<ExperimentRigorDetails>;
  unknownsCoverage: ScorerResult<UnknownsCoverageDetails>;
}

/**
 * Calculate a composite score from all deterministic scorers.
 *
 * Default weights:
 * - Structure: 25% (valid DAG, parallelism)
 * - Coverage: 30% (requirements, hypotheses)
 * - Experiment rigor: 25% (preregistration, criteria)
 * - Unknowns: 20% (epistemic completeness)
 */
export function scorePlanComposite(
  plan: PlanSpec,
  weights?: {
    structure?: number;
    coverage?: number;
    experimentRigor?: number;
    unknownsCoverage?: number;
  },
): CompositePlanScore {
  const rawWeights = {
    structure: weights?.structure ?? 0.25,
    coverage: weights?.coverage ?? 0.3,
    experimentRigor: weights?.experimentRigor ?? 0.25,
    unknownsCoverage: weights?.unknownsCoverage ?? 0.2,
  };

  // Normalize weights to sum to 1.0
  const weightSum =
    rawWeights.structure +
    rawWeights.coverage +
    rawWeights.experimentRigor +
    rawWeights.unknownsCoverage;

  // Guard against division by zero (all weights are 0)
  const resolvedWeights =
    weightSum === 0
      ? {
          structure: 0.25,
          coverage: 0.3,
          experimentRigor: 0.25,
          unknownsCoverage: 0.2,
        }
      : {
          structure: rawWeights.structure / weightSum,
          coverage: rawWeights.coverage / weightSum,
          experimentRigor: rawWeights.experimentRigor / weightSum,
          unknownsCoverage: rawWeights.unknownsCoverage / weightSum,
        };

  const structure = scorePlanStructure(plan);
  const coverage = scorePlanCoverage(plan);
  const experimentRigor = scoreExperimentRigor(plan);
  const unknownsCoverage = scoreUnknownsCoverage(plan);

  const overall =
    resolvedWeights.structure * structure.score +
    resolvedWeights.coverage * coverage.score +
    resolvedWeights.experimentRigor * experimentRigor.score +
    resolvedWeights.unknownsCoverage * unknownsCoverage.score;

  return {
    overall,
    structure,
    coverage,
    experimentRigor,
    unknownsCoverage,
  };
}
