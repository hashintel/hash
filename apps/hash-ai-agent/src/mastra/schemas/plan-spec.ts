/**
 * PlanSpec Schema — MVP Implementation
 *
 * Defines the Intermediate Representation (IR) for decomposed research & development plans.
 * This schema represents the output of the planner agent and input to validation/scoring.
 *
 * MVP scope:
 * - 4 step types: research, synthesize, experiment, develop
 * - No decision points (deferred to v2)
 * - Epistemically rigorous unknowns map
 * - Confirmatory vs exploratory experiment modes
 *
 * @see docs/PLAN-task-decomposition.md for full design documentation
 */

import { z } from "zod";

/**
 * Classification of the goal's primary aim.
 *
 * Different aim types require different plan structures and success criteria:
 * - describe: Focus on completeness and accuracy of characterization
 * - explain: Identify causal mechanisms, rule out alternatives
 * - predict: Build and validate predictive models
 * - intervene: All of above plus implementation for measurable change
 *
 * Note: These are not mutually exclusive, so this is a weak signal for inference.
 * Included as optional enrichment — evaluate usefulness over time.
 */
export const zAimType = z.enum(["describe", "explain", "predict", "intervene"]);
export type AimType = z.infer<typeof zAimType>;

/**
 * A requirement extracted from the goal.
 *
 * Requirements are prioritized using MoSCoW method:
 * - must: Critical for success, plan fails without it
 * - should: Important but not critical
 * - could: Nice to have, include if resources allow
 */
export const zRequirement = z.object({
  id: z.string().describe("Unique identifier (e.g., 'R1', 'R2')"),
  description: z.string().describe("What needs to be achieved"),
  priority: z
    .enum(["must", "should", "could"])
    .describe("MoSCoW priority level"),
});
export type Requirement = z.infer<typeof zRequirement>;

/**
 * A testable hypothesis.
 *
 * Hypotheses are first-class citizens, not buried in experiment descriptions.
 * This makes the scientific structure of the plan visible and enables:
 * - Tracking hypothesis status across experiments
 * - Validating that experiments reference valid hypotheses
 * - Scoring hypothesis testability
 */
export const zHypothesisStatus = z.enum([
  "untested",
  "testing",
  "supported",
  "refuted",
  "inconclusive",
]);
export type HypothesisStatus = z.infer<typeof zHypothesisStatus>;

export const zHypothesis = z.object({
  id: z.string().describe("Unique identifier (e.g., 'H1', 'H2')"),
  statement: z.string().describe("The hypothesis statement"),
  assumptions: z
    .array(z.string())
    .describe("Assumptions the hypothesis depends on"),
  testableVia: z
    .string()
    .describe("How this hypothesis can be tested (what experiment/evidence)"),
  status: zHypothesisStatus.default("untested"),
});

export type Hypothesis = z.infer<typeof zHypothesis>;

// =============================================================================
// UNKNOWNS MAP (Epistemically Rigorous)
// =============================================================================

/**
 * An unknown-unknown: something that would surprise us.
 *
 * The detectionSignal field forces explicit consideration of how we'd notice
 * if our assumptions are wrong — a key scientific practice.
 */
export const zUnknownUnknown = z.object({
  potentialSurprise: z.string().describe("What would surprise us"),
  detectionSignal: z
    .string()
    .describe("How would we notice? What would be the signal?"),
});

export type UnknownUnknown = z.infer<typeof zUnknownUnknown>;

/**
 * Epistemically rigorous unknowns partition.
 *
 * Based on scientific uncertainty principles:
 * - knownKnowns: High-confidence facts we're building on
 * - knownUnknowns: Explicit questions we know we need to answer
 * - unknownUnknowns: What would surprise us + detection signals
 * - communityCheck: What others need to scrutinize our claims
 *
 * The partition forces the planner to surface uncertainty rather than
 * hallucinate confidence. The communityCheck ensures plans include what
 * others would need to verify claims (science depends on communal scrutiny).
 */
export const zUnknownsMap = z.object({
  knownKnowns: z
    .array(z.string())
    .describe("High-confidence facts we're building on"),
  knownUnknowns: z
    .array(z.string())
    .describe("Explicit questions we know we need to answer"),
  unknownUnknowns: z
    .array(zUnknownUnknown)
    .describe("What would surprise us and how we'd detect it"),
  communityCheck: z
    .string()
    .describe("What others would need to see to scrutinize our claims"),
});

export type UnknownsMap = z.infer<typeof zUnknownsMap>;

/**
 * A step artifact describing step inputs/outputs.
 *
 * Contracts enable validation that steps are properly connected
 * and that data flows correctly through the plan.
 */
export const zStepArtifact = z.object({
  name: z.string().describe("Name of the data artifact"),
  description: z.string().describe("What this data represents"),
});

export type StepArtifact = z.infer<typeof zStepArtifact>;

/**
 * Criteria for evaluating step success.
 */
export const zEvalCriteria = z.object({
  successCondition: z.string().describe("What constitutes success"),
  failureCondition: z
    .string()
    .optional()
    .describe("What constitutes failure (if different from !success)"),
});

export type EvalCriteria = z.infer<typeof zEvalCriteria>;

/**
 * Binding to an executor that will perform the step.
 *
 * Executors can be:
 * - agent: An LLM agent with specific capabilities
 * - tool: A deterministic tool/function
 * - workflow: A sub-workflow
 * - human: Requires human intervention
 */
export const zExecutor = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("agent"),
    ref: z.string().describe("Agent identifier from AVAILABLE_AGENTS"),
  }),
  z.object({
    kind: z.literal("tool"),
    ref: z.string().describe("Tool identifier"),
  }),
  z.object({
    kind: z.literal("workflow"),
    ref: z.string().describe("Workflow identifier"),
  }),
  z.object({
    kind: z.literal("human"),
    instructions: z
      .string()
      .optional()
      .describe("Instructions for human executor"),
  }),
]);

export type Executor = z.infer<typeof zExecutor>;

// =============================================================================
// STEP TYPES
// =============================================================================

/**
 * Step types supported in the PlanSpec.
 */
export const STEP_TYPES = [
  "research",
  "synthesize",
  "experiment",
  "develop",
] as const;
export const zStepType = z.enum(STEP_TYPES);
export type StepType = z.infer<typeof zStepType>;

/**
 * Common fields shared by all step types.
 */
export const zBaseStep = z.object({
  type: zStepType,
  id: z.string().describe("Unique identifier (e.g., 'S1', 'S2')"),
  description: z.string().describe("What this step accomplishes"),
  dependencyIds: z
    .array(z.string())
    .default([])
    .describe("Step IDs that must complete before this step"),
  concurrent: z
    .boolean()
    .default(true)
    .describe("Whether this step may run concurrently with other ready steps"),
  requirementIds: z
    .array(z.string())
    .describe("Requirement IDs this step addresses"),
  inputs: z.array(zStepArtifact).describe("Data this step consumes"),
  outputs: z.array(zStepArtifact).describe("Data this step produces"),
  evalCriteria: zEvalCriteria
    .optional()
    .describe("How to evaluate step success"),
  executor: zExecutor.describe("Who/what performs this step"),
});

// -----------------------------------------------------------------------------
// Research Step
// -----------------------------------------------------------------------------

/**
 * A research step for gathering existing knowledge.
 *
 * Each research step should have a clear stopping rule defining what "done"
 * means.
 */
export const zResearchStep = zBaseStep.extend({
  type: zStepType.extract(["research"]),
  query: z.string().describe("The research question or search query"),
  stoppingRule: z
    .string()
    .describe(
      'What "done" means for this research (e.g., "3 relevant papers found")',
    ),
});
export type ResearchStep = z.infer<typeof zResearchStep>;

// -----------------------------------------------------------------------------
// Synthesize Step
// -----------------------------------------------------------------------------

/**
 * A synthesize step for combining or evaluating results.
 *
 * When mode is 'evaluative', this subsumes the old "assess" step type.
 * Evaluative synthesis judges results against specific criteria.
 */
export const zSynthesizeStep = zBaseStep.extend({
  type: zStepType.extract(["synthesize"]),
  mode: z
    .enum(["integrative", "evaluative"])
    .describe("integrative (combine) or evaluative (judge)"),
  evaluateAgainst: z
    .array(z.string())
    .optional()
    .describe("Criteria to evaluate against (required if mode is evaluative)"),
});
export type SynthesizeStep = z.infer<typeof zSynthesizeStep>;

// -----------------------------------------------------------------------------
// Experiment Step
// -----------------------------------------------------------------------------

/**
 * Experiment modes.
 *
 * - exploratory: Hypothesis generation, flexible analysis, pattern discovery
 * - confirmatory: Preregistered design, locked analysis plan, testing specific predictions
 *
 * The distinction reduces "researcher degrees of freedom" — confirmatory experiments
 * with preregistered commitments are more credible because decisions are locked
 * before seeing outcomes.
 */
export const zExperimentMode = z.enum(["exploratory", "confirmatory"]);
export type ExperimentMode = z.infer<typeof zExperimentMode>;

/**
 * An experiment step for testing hypotheses.
 *
 * Confirmatory experiments SHOULD have preregisteredCommitments — decisions
 * locked before seeing outcomes. This is validated by the experiment-rigor scorer.
 */
export const zExperimentStep = zBaseStep.extend({
  type: zStepType.extract(["experiment"]),
  mode: zExperimentMode.describe("exploratory or confirmatory"),
  hypothesisIds: z.array(z.string()).describe("Hypothesis IDs being tested"),
  procedure: z.string().describe("How the experiment will be conducted"),
  expectedOutcomes: z
    .array(z.string())
    .describe("Possible outcomes and their interpretations"),
  successCriteria: z
    .array(z.string())
    .describe("What constitutes experimental success"),
  preregisteredCommitments: z
    .array(z.string())
    .optional()
    .describe(
      "Decisions locked before seeing outcomes (required for confirmatory)",
    ),
});
export type ExperimentStep = z.infer<typeof zExperimentStep>;

// -----------------------------------------------------------------------------
// Develop Step
// -----------------------------------------------------------------------------

/**
 * A develop step for building/implementing something.
 */
export const zDevelopStep = zBaseStep.extend({
  type: zStepType.extract(["develop"]),
  specification: z.string().describe("What to build/implement"),
  deliverables: z.array(z.string()).describe("Concrete outputs to produce"),
});
export type DevelopStep = z.infer<typeof zDevelopStep>;

// =============================================================================
// PLAN STEP (Discriminated Union)
// =============================================================================

/**
 * A plan step — one of the 4 MVP step types.
 */
export const zPlanStep = z.discriminatedUnion("type", [
  zResearchStep,
  zSynthesizeStep,
  zExperimentStep,
  zDevelopStep,
]);
export type PlanStep = z.infer<typeof zPlanStep>;

// =============================================================================
// PLAN SPEC (Full IR)
// =============================================================================

/**
 * Estimated complexity of the plan.
 */
export const zComplexity = z.enum(["low", "medium", "high", "very-high"]);
export type Complexity = z.infer<typeof zComplexity>;

/**
 * The full PlanSpec — Intermediate Representation for decomposed plans.
 *
 * This is the output of the planner agent and the input to validation/scoring.
 * It captures:
 * - Goal summary and optional aim type classification
 * - Requirements extracted from the goal
 * - Hypotheses to be tested
 * - Steps forming a DAG (directed acyclic graph)
 * - Epistemically rigorous unknowns map
 * - Estimated complexity
 *
 * MVP scope: No decision points (deferred to v2).
 */
export const zPlanSpec = z.object({
  id: z.string().describe("Unique identifier for this plan"),
  goalSummary: z
    .string()
    .describe("Concise summary of the goal being addressed"),

  // Optional enrichment — aim type classification
  aimType: zAimType
    .optional()
    .describe("Primary aim type: describe, explain, predict, or intervene"),

  // Core plan elements
  requirements: z
    .array(zRequirement)
    .describe("Requirements extracted from the goal"),
  hypotheses: z
    .array(zHypothesis)
    .describe("Hypotheses to be tested (may be empty for pure research)"),
  steps: z.array(zPlanStep).describe("Steps forming a DAG"),
  unknownsMap: zUnknownsMap.describe(
    "Epistemically rigorous unknowns partition",
  ),

  // Metadata
  estimatedComplexity: zComplexity
    .optional()
    .describe("Estimated complexity of the plan"),
});
export type PlanSpec = z.infer<typeof zPlanSpec>;
