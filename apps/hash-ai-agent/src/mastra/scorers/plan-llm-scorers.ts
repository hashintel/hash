/**
 * Plan LLM Scorers — Qualitative Evaluation
 *
 * LLM-based scorers for evaluating subjective plan qualities that
 * cannot be computed deterministically.
 *
 * Scorers:
 * - goal-alignment: Does the plan actually address the stated goal?
 * - plan-granularity: Are steps appropriately sized?
 * - hypothesis-testability: Are hypotheses actually testable?
 *
 * Uses Mastra v1 createScorer API from @mastra/evals.
 */

import { createScorer } from "@mastra/core/evals";
import { z } from "zod";

import { DEFAULT_MODEL } from "../constants";

// =============================================================================
// GOAL ALIGNMENT SCORER
// =============================================================================

const GOAL_ALIGNMENT_INSTRUCTIONS = `You are an expert at evaluating research and development plans.
Your task is to assess whether a plan adequately addresses its stated goal.

Consider:
1. Does the plan cover all explicit requirements in the goal?
2. Does the plan address implicit requirements that a reasonable person would expect?
3. Are there gaps that would prevent achieving the goal?
4. Are there steps that seem unnecessary or tangential?

Be rigorous but fair. A good plan doesn't need to be perfect, but it should
have a clear path to achieving the goal without major gaps.`;

const zGoalAlignmentAnalysis = z.object({
  /** Does the plan address the core goal? */
  addressesCoreGoal: z.boolean(),
  /** What aspects of the goal are well-covered? */
  coveredAspects: z.array(z.string()),
  /** What aspects of the goal are missing or weak? */
  missingAspects: z.array(z.string()),
  /** Are there steps that seem irrelevant to the goal? */
  irrelevantSteps: z.array(z.string()),
  /** Overall alignment score 0-10 */
  alignmentScore: z.number().min(0).max(10),
  /** Brief explanation of the score */
  explanation: z.string(),
});

/**
 * Scorer for evaluating how well a plan addresses its stated goal.
 *
 * Input should be: { goal: string, plan: PlanSpec }
 * Output should be: The plan object (or stringified plan)
 */
export const goalAlignmentScorer = createScorer({
  id: "goal-alignment",
  description: "Evaluates how well the plan addresses the stated goal",
  judge: {
    model: DEFAULT_MODEL,
    instructions: GOAL_ALIGNMENT_INSTRUCTIONS,
  },
})
  .analyze({
    description: "Analyze how well the plan addresses the goal",
    outputSchema: zGoalAlignmentAnalysis,
    createPrompt: ({ run }) => {
      // Safely extract goal and plan from input
      const rawInput = run.input as unknown;
      let goal = "Unknown goal";
      let plan: unknown = run.output as unknown;

      if (Array.isArray(rawInput)) {
        const first = rawInput[0] as { content?: string } | undefined;
        goal = first?.content ?? "";
        plan = run.output as unknown;
      } else if (rawInput && typeof rawInput === "object") {
        const obj = rawInput as { goal?: unknown; plan?: unknown };
        if (typeof obj.goal === "string" && obj.goal.trim() !== "") {
          goal = obj.goal;
        }
        plan = obj.plan ?? (run.output as unknown);
      }

      let planJson: string;
      if (typeof plan === "string") {
        planJson = plan;
      } else if (plan == null) {
        planJson = "No plan was provided.";
      } else {
        try {
          planJson = JSON.stringify(plan, null, 2);
        } catch {
          planJson = "Plan could not be serialized.";
        }
      }

      return `Evaluate how well this plan addresses its goal.

## Goal
${goal}

## Plan
${planJson}

Analyze the alignment between the goal and the plan. Consider:
1. What aspects of the goal are explicitly addressed by plan steps?
2. What aspects are missing or weakly addressed?
3. Are there any steps that seem irrelevant to the goal?
4. Would executing this plan achieve the stated goal?

Provide your analysis as JSON.`;
    },
  })
  .generateScore(({ results }) => {
    const analysis = results.analyzeStepResult;
    // Normalize 0-10 score to 0-1
    return analysis.alignmentScore / 10;
  })
  .generateReason(({ results, score }) => {
    const { coveredAspects, missingAspects, irrelevantSteps, explanation } =
      results.analyzeStepResult;
    return (
      `Score: ${(score * 10).toFixed(1)}/10. ${explanation} ` +
      `Covered: ${coveredAspects.length} aspects. ` +
      `${missingAspects.length > 0 ? `Missing: ${missingAspects.join(", ")}. ` : ""}` +
      `${irrelevantSteps.length > 0 ? `Irrelevant steps: ${irrelevantSteps.join(", ")}.` : ""}`
    );
  });

// =============================================================================
// PLAN GRANULARITY SCORER
// =============================================================================

const GRANULARITY_INSTRUCTIONS = `You are an expert at evaluating research and development plans.
Your task is to assess whether steps are appropriately granular.

Good step granularity means:
1. Each step has ONE clear objective that can be evaluated
2. Steps are not so large that they hide complexity or decision points
3. Steps are not so small that they create unnecessary coordination overhead
4. The granularity is consistent across the plan

Signs of TOO COARSE:
- Step description mentions multiple distinct activities
- Step could reasonably be done by different executors
- Step contains implicit decision points

Signs of TOO FINE:
- Multiple consecutive steps could naturally be one activity
- Steps have trivial outputs that only make sense in combination
- Breaking down further provides no meaningful checkpoints`;

const zGranularityAnalysis = z.object({
  /** Steps that are too coarse (should be broken down) */
  tooCoarseSteps: z.array(
    z.object({
      stepId: z.string(),
      reason: z.string(),
    }),
  ),
  /** Steps that are too fine (could be combined) */
  tooFineSteps: z.array(
    z.object({
      stepIds: z.array(z.string()),
      reason: z.string(),
    }),
  ),
  /** Number of steps with appropriate granularity */
  appropriateStepCount: z.number(),
  /** Overall granularity score 0-10 */
  granularityScore: z.number().min(0).max(10),
  /** Brief explanation */
  explanation: z.string(),
});

/**
 * Scorer for evaluating step granularity.
 *
 * Input should be: { goal: string, plan: PlanSpec }
 */
export const planGranularityScorer = createScorer({
  id: "plan-granularity",
  description: "Evaluates whether plan steps are appropriately sized",
  judge: {
    model: DEFAULT_MODEL,
    instructions: GRANULARITY_INSTRUCTIONS,
  },
})
  .analyze({
    description: "Analyze step granularity",
    outputSchema: zGranularityAnalysis,
    createPrompt: ({ run }) => {
      // Safely extract goal and plan from input
      const rawInput = run.input as unknown;
      let goal = "Unknown goal";
      let plan: unknown = run.output as unknown;

      if (Array.isArray(rawInput)) {
        const first = rawInput[0] as { content?: string } | undefined;
        goal = first?.content ?? "";
        plan = run.output as unknown;
      } else if (rawInput && typeof rawInput === "object") {
        const obj = rawInput as { goal?: unknown; plan?: unknown };
        if (typeof obj.goal === "string" && obj.goal.trim() !== "") {
          goal = obj.goal;
        }
        plan = obj.plan ?? (run.output as unknown);
      }

      let planJson: string;
      if (typeof plan === "string") {
        planJson = plan;
      } else if (plan == null) {
        planJson = "No plan was provided.";
      } else {
        try {
          planJson = JSON.stringify(plan, null, 2);
        } catch {
          planJson = "Plan could not be serialized.";
        }
      }

      return `Evaluate the granularity of steps in this plan.

## Goal
${goal}

## Plan
${planJson}

Analyze each step's granularity:
1. Which steps are too coarse and should be broken down?
2. Which groups of steps are too fine and could be combined?
3. How many steps have appropriate granularity?

Consider the goal's complexity when judging — a simple goal needs fewer steps.

Provide your analysis as JSON.`;
    },
  })
  .generateScore(({ results }) => {
    const analysis = results.analyzeStepResult;
    return analysis.granularityScore / 10;
  })
  .generateReason(({ results, score }) => {
    const { tooCoarseSteps, tooFineSteps, appropriateStepCount, explanation } =
      results.analyzeStepResult;
    return (
      `Score: ${(score * 10).toFixed(1)}/10. ${explanation} ` +
      `Appropriate: ${appropriateStepCount} steps. ` +
      `${tooCoarseSteps.length > 0 ? `Too coarse: ${tooCoarseSteps.map((step) => step.stepId).join(", ")}. ` : ""}` +
      `${tooFineSteps.length > 0 ? `Could combine: ${tooFineSteps.length} groups.` : ""}`
    );
  });

// =============================================================================
// HYPOTHESIS TESTABILITY SCORER
// =============================================================================

const TESTABILITY_INSTRUCTIONS = `You are an expert in scientific methodology and experimental design.
Your task is to evaluate whether hypotheses are truly testable and whether
experiments are well-designed to test them.

A TESTABLE hypothesis:
1. Makes specific, falsifiable predictions
2. Has clear criteria for support/refutation
3. Is not trivially true or unfalsifiable
4. Can be tested with available methods

A WELL-DESIGNED experiment:
1. Has clear connection to the hypothesis being tested
2. Could produce results that would change our beliefs
3. Has appropriate controls (for confirmatory)
4. Has preregistered commitments that prevent post-hoc rationalization

Be rigorous. Many "hypotheses" are actually just goals or questions.
A real hypothesis makes a prediction that could be wrong.`;

const zTestabilityAnalysis = z.object({
  /** Analysis of each hypothesis */
  hypothesisAnalysis: z.array(
    z.object({
      hypothesisId: z.string(),
      statement: z.string(),
      isTestable: z.boolean(),
      testabilityIssues: z.array(z.string()),
      suggestedImprovement: z.string().optional(),
    }),
  ),
  /** Are experiments well-designed to test the hypotheses? */
  experimentQuality: z.object({
    wellDesigned: z.array(z.string()),
    poorlyDesigned: z.array(
      z.object({
        stepId: z.string(),
        issues: z.array(z.string()),
      }),
    ),
  }),
  /** Overall testability score 0-10 */
  testabilityScore: z.number().min(0).max(10),
  /** Brief explanation */
  explanation: z.string(),
});

/**
 * Scorer for evaluating hypothesis testability.
 *
 * Plans without hypotheses get a score of 1.0 (not applicable).
 * Input should be: { goal: string, plan: PlanSpec }
 */
export const hypothesisTestabilityScorer = createScorer({
  id: "hypothesis-testability",
  description:
    "Evaluates whether hypotheses are testable and experiments are well-designed",
  judge: {
    model: DEFAULT_MODEL,
    instructions: TESTABILITY_INSTRUCTIONS,
  },
})
  .preprocess(({ run }) => {
    // Safely extract goal and plan from input
    const rawInput = run.input as unknown;
    let goal = "Unknown goal";
    let plan: unknown = run.output as unknown;

    if (Array.isArray(rawInput)) {
      const first = rawInput[0] as { content?: string } | undefined;
      goal = first?.content ?? "";
      plan = run.output as unknown;
    } else if (rawInput && typeof rawInput === "object") {
      const obj = rawInput as { goal?: unknown; plan?: unknown };
      if (typeof obj.goal === "string" && obj.goal.trim() !== "") {
        goal = obj.goal;
      }
      plan = obj.plan ?? (run.output as unknown);
    }

    // Safely parse plan if it's a string
    type PlanLike = {
      hypotheses?: Array<{ id: string; statement: string }>;
      steps?: Array<{ type: string; id: string }>;
    };
    let planObj: PlanLike = {};

    if (typeof plan === "string") {
      try {
        const parsed: unknown = JSON.parse(plan);
        if (parsed && typeof parsed === "object") {
          planObj = parsed as PlanLike;
        }
      } catch {
        // Leave planObj as empty object
      }
    } else if (plan && typeof plan === "object") {
      planObj = plan as PlanLike;
    }

    const hasHypotheses = (planObj.hypotheses?.length ?? 0) > 0;
    const hasExperiments =
      planObj.steps?.some((step) => step.type === "experiment") ?? false;

    // Safely serialize planJson
    let planJson: string;
    if (typeof plan === "string") {
      planJson = plan;
    } else if (plan == null) {
      planJson = "No plan was provided.";
    } else {
      try {
        planJson = JSON.stringify(plan, null, 2);
      } catch {
        planJson = "Plan could not be serialized.";
      }
    }

    return {
      goal,
      plan,
      planJson,
      hasHypotheses,
      hasExperiments,
    };
  })
  .analyze({
    description: "Analyze hypothesis testability and experiment design",
    outputSchema: zTestabilityAnalysis,
    createPrompt: ({ results }) => {
      const { goal, planJson, hasHypotheses, hasExperiments } =
        results.preprocessStepResult as {
          goal: string;
          planJson: string;
          hasHypotheses: boolean;
          hasExperiments: boolean;
        };

      if (!hasHypotheses) {
        // Return a prompt that will produce a "not applicable" result
        return `This plan has no hypotheses to evaluate.

Return JSON with:
- hypothesisAnalysis: [] (empty array)
- experimentQuality: { wellDesigned: [], poorlyDesigned: [] }
- testabilityScore: 10 (since there's nothing to evaluate)
- explanation: "No hypotheses to evaluate - score not applicable."`;
      }

      return `Evaluate the testability of hypotheses and quality of experiments in this plan.

## Goal
${goal}

## Plan
${planJson}

${!hasExperiments ? "Note: This plan has hypotheses but no experiments to test them.\n" : ""}

For each hypothesis, evaluate:
1. Is it stated in falsifiable terms?
2. Does it make a specific prediction?
3. What would it take to refute it?

For each experiment, evaluate:
1. Does it clearly test the referenced hypotheses?
2. Could the results change our beliefs?
3. Are there appropriate controls and preregistration?

Provide your analysis as JSON.`;
    },
  })
  .generateScore(({ results }) => {
    const analysis = results.analyzeStepResult;
    return analysis.testabilityScore / 10;
  })
  .generateReason(({ results, score }) => {
    const { hypothesisAnalysis, experimentQuality, explanation } =
      results.analyzeStepResult;

    const testableCount = hypothesisAnalysis.filter(
      (hyp: { isTestable: boolean }) => hyp.isTestable,
    ).length;
    const totalHypotheses = hypothesisAnalysis.length;
    const wellDesignedCount = experimentQuality.wellDesigned.length;
    const poorlyDesignedCount = experimentQuality.poorlyDesigned.length;

    if (totalHypotheses === 0) {
      return "No hypotheses in plan — testability score not applicable.";
    }

    return (
      `Score: ${(score * 10).toFixed(1)}/10. ${explanation} ` +
      `Testable hypotheses: ${testableCount}/${totalHypotheses}. ` +
      `Well-designed experiments: ${wellDesignedCount}. ` +
      `${poorlyDesignedCount > 0 ? `Poorly designed: ${poorlyDesignedCount}.` : ""}`
    );
  });

// =============================================================================
// EXPORTS
// =============================================================================

/**
 * All LLM-based plan scorers.
 */
export const planLlmScorers = {
  goalAlignment: goalAlignmentScorer,
  planGranularity: planGranularityScorer,
  hypothesisTestability: hypothesisTestabilityScorer,
};
