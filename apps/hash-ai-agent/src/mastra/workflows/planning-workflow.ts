/**
 * Planning Workflow — Goal Decomposition with Revision Loop
 *
 * Orchestrates the full planning pipeline:
 * 1. Generate initial plan from goal using planner agent
 * 2. Validate plan structure (deterministic checks)
 * 3. If invalid: build revision feedback and regenerate (loop)
 * 4. Return structured result with plan, validity, and attempt count
 *
 * Uses Mastra's `.dountil()` for the revision loop with `.map()` for
 * schema transformations at loop boundaries.
 *
 * @see docs/PLAN-task-decomposition.md for design documentation
 */

import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";

import { generatePlan } from "../agents/planner-agent";
import { zPlanSpec } from "../schemas/plan-spec";
import { buildRevisionFeedback } from "../utils/build-revision-feedback";
import type { ValidationError } from "../utils/plan-validator";
import { validatePlan } from "../utils/plan-validator";

// =============================================================================
// SCHEMAS
// =============================================================================

/**
 * Zod schema for validation errors (matches ValidationError interface).
 */
const zValidationError = z.object({
  code: z.string(),
  message: z.string(),
  context: z.string().optional(),
  details: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Schema for the revision loop step.
 * Input and output must match for dountil looping.
 */
const revisionLoopSchema = z.object({
  plan: zPlanSpec,
  valid: z.boolean(),
  attempts: z.number(),
  maxAttempts: z.number(),
  goal: z.string(),
  context: z.string().optional(),
  errors: z.array(zValidationError).optional(),
});

/**
 * Workflow input schema.
 */
const planningInputSchema = z.object({
  goal: z.string().describe("The goal to decompose into a plan"),
  context: z.string().optional().describe("Additional context for planning"),
  maxAttempts: z
    .number()
    .optional()
    .default(3)
    .describe("Maximum revision attempts"),
});

/**
 * Workflow output schema.
 */
const planningOutputSchema = z.object({
  plan: zPlanSpec,
  valid: z.boolean(),
  attempts: z.number(),
  errors: z.array(zValidationError).optional(),
});

// =============================================================================
// STEPS
// =============================================================================

/**
 * Revision step — generates a new plan if previous was invalid.
 *
 * This step is used inside `.dountil()` and has matching input/output schemas.
 * On each iteration:
 * 1. If already valid or max attempts reached, pass through unchanged
 * 2. Otherwise, build revision feedback from previous errors
 * 3. Generate new plan with feedback context
 * 4. Validate and update state
 */
const planRevisionStep = createStep({
  id: "plan-revision",
  inputSchema: revisionLoopSchema,
  outputSchema: revisionLoopSchema,
  execute: async ({ inputData }) => {
    const { plan, valid, attempts, maxAttempts, goal, context, errors } =
      inputData;

    // If already valid or max attempts reached, pass through
    if (valid || attempts >= maxAttempts) {
      return inputData;
    }

    // Build revision feedback from ALL previous errors
    let revisionFeedback: string | undefined;

    if (errors && errors.length > 0) {
      // Convert zod-parsed errors back to ValidationError type
      const validationErrors: ValidationError[] = errors.map((err) => ({
        code: err.code as unknown as ValidationError["code"],
        message: err.message,
        context: err.context,
        details: err.details,
      }));
      revisionFeedback = buildRevisionFeedback(plan, validationErrors);
    }

    // Generate new plan with COMBINED context (original + revision feedback)
    // This ensures the LLM has both the original context AND the fix instructions
    const combinedContext = [context, revisionFeedback]
      .filter(Boolean)
      .join("\n\n");

    const result = await generatePlan({
      goal,
      context: combinedContext || undefined,
    });

    // Validate new plan
    const validation = validatePlan(result.plan);

    return {
      plan: result.plan,
      valid: validation.valid,
      attempts: attempts + 1,
      maxAttempts,
      goal,
      context,
      errors: validation.valid ? undefined : validation.errors,
    };
  },
});

// =============================================================================
// WORKFLOW
// =============================================================================

/**
 * Planning workflow with revision loop.
 *
 * Flow:
 * 1. `.map()` — Generate initial plan and validate
 * 2. `.dountil()` — Revise until valid or max attempts
 * 3. `.map()` — Extract final result
 */
export const planningWorkflow = createWorkflow({
  id: "planning-workflow",
  inputSchema: planningInputSchema,
  outputSchema: planningOutputSchema,
})
  // Entry: Generate first plan and validate
  .map(async ({ inputData }) => {
    const { goal, context, maxAttempts = 3 } = inputData;

    // Generate initial plan
    const result = await generatePlan({ goal, context });

    // Validate it
    const validation = validatePlan(result.plan);

    // Return loop-compatible schema
    return {
      plan: result.plan,
      valid: validation.valid,
      attempts: 1,
      maxAttempts,
      goal,
      context,
      errors: validation.valid ? undefined : validation.errors,
    };
  })
  // Loop: Revise until valid or max attempts
  // eslint-disable-next-line @typescript-eslint/require-await
  .dountil(planRevisionStep, async ({ inputData }) => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/prefer-nullish-coalescing
    return inputData.valid || inputData.attempts >= inputData.maxAttempts;
  })
  // Exit: Extract final result
  // eslint-disable-next-line @typescript-eslint/require-await
  .map(async ({ inputData }) => {
    return {
      plan: inputData.plan,
      valid: inputData.valid,
      attempts: inputData.attempts,
      errors: inputData.errors,
    };
  })
  .commit();

// =============================================================================
// EXPORTS
// =============================================================================

export type PlanningInput = z.infer<typeof planningInputSchema>;
export type PlanningOutput = z.infer<typeof planningOutputSchema>;
