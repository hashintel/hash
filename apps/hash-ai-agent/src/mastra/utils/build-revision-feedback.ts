/**
 * Revision Feedback — Helpers for Plan Revision Loop
 *
 * Builds targeted feedback prompts when a generated plan fails validation.
 * The feedback is designed to give the LLM specific, actionable instructions
 * for fixing the identified issue.
 *
 * @see docs/PLAN-task-decomposition.md for design documentation
 */

import dedent from "dedent";

import type { PlanSpec, PlanStep } from "../schemas/plan-spec";
import type { ValidationError, ValidationErrorCode } from "./plan-validator";

// =============================================================================
// HELPERS (defined first to avoid use-before-define)
// =============================================================================

/**
 * Format a step for inclusion in revision feedback.
 * Shows only the relevant fields to keep context focused.
 */
function formatStepContext(step: PlanStep): string {
  // Extract key fields based on step type
  const relevantFields: Record<string, unknown> = {
    id: step.id,
    type: step.type,
    description: step.description,
    dependencyIds: step.dependencyIds,
  };

  // Add type-specific fields
  if (step.type === "experiment") {
    relevantFields.mode = step.mode;
    relevantFields.hypothesisIds = step.hypothesisIds;
    relevantFields.successCriteria = step.successCriteria;
    if (step.mode === "confirmatory") {
      relevantFields.preregisteredCommitments = step.preregisteredCommitments;
    }
  } else if (step.type === "synthesize") {
    relevantFields.mode = step.mode;
    if (step.mode === "evaluative") {
      relevantFields.evaluateAgainst = step.evaluateAgainst;
    }
  }

  return dedent`
    ### Problematic Step
    \`\`\`json
    ${JSON.stringify(relevantFields, null, 2)}
    \`\`\`
  `;
}

/**
 * Safely stringify a details field value.
 */
function stringifyDetail(value: unknown): string {
  if (value === undefined || value === null) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value);
}

/**
 * Get specific fix instructions based on the error code.
 */
function getFixInstructions(error: ValidationError, _step?: PlanStep): string {
  const invalidRef = error.details?.invalidRef
    ? stringifyDetail(error.details.invalidRef)
    : undefined;
  const executor = error.details?.executor
    ? stringifyDetail(error.details.executor)
    : undefined;
  const stepType = error.details?.stepType
    ? stringifyDetail(error.details.stepType)
    : undefined;

  const instructions: Record<ValidationErrorCode, string> = {
    MISSING_PREREGISTERED_COMMITMENTS: dedent`
      **CRITICAL ERROR**: Step "${error.context}" is a confirmatory experiment but is
      MISSING the REQUIRED \`preregisteredCommitments\` array. This field is mandatory
      for all confirmatory experiments.

      You MUST add a preregisteredCommitments array with 2-3 specific commitments
      that lock decisions BEFORE seeing outcomes:

      Example fix for step "${error.context}":
      \`\`\`json
      "preregisteredCommitments": [
        "Primary metric: <specific metric name>",
        "Sample size: <specific number>",
        "Success threshold: <specific criterion>"
      ]
      \`\`\`

      If you cannot specify preregistered commitments, change the experiment mode
      from "confirmatory" to "exploratory" instead.
    `,

    MISSING_EVALUATE_AGAINST: dedent`
      Step "${error.context}" is an evaluative synthesize step but is missing
      the required \`evaluateAgainst\` array.

      Add 2-3 specific criteria that results will be evaluated against:
      - Relevant requirements or hypotheses to check
      - Specific metrics or quality thresholds
      - Comparison baselines if applicable
    `,

    EMPTY_PLAN: dedent`
      The plan has no steps. Add at least one step to accomplish the goal.
    `,

    CYCLE_DETECTED: dedent`
      The plan contains a circular dependency. Step "${error.context}" is part
      of a cycle. Review the \`dependencyIds\` references and ensure the plan forms
      a valid DAG (directed acyclic graph).
    `,

    INVALID_STEP_REFERENCE: dedent`
      Step "${error.context}" references a step ID that doesn't exist.
      ${invalidRef ? `Invalid reference: "${invalidRef}"` : ""}

      Check the \`dependencyIds\` field and ensure it references valid step IDs
      defined in the plan.
    `,

    INVALID_HYPOTHESIS_REFERENCE: dedent`
      Step "${error.context}" references a hypothesis ID that doesn't exist.
      ${invalidRef ? `Invalid reference: "${invalidRef}"` : ""}

      Check the \`hypothesisIds\` field and ensure it references valid hypothesis
      IDs defined in the plan's \`hypotheses\` array.
    `,

    INVALID_REQUIREMENT_REFERENCE: dedent`
      Step "${error.context}" references a requirement ID that doesn't exist.
      ${invalidRef ? `Invalid reference: "${invalidRef}"` : ""}

      Check the \`requirementIds\` field and ensure it references valid requirement
      IDs defined in the plan's \`requirements\` array.
    `,

    INVALID_EXECUTOR_REFERENCE: dedent`
      Step "${error.context}" references an executor that doesn't exist.
      ${invalidRef ? `Invalid executor ref: "${invalidRef}"` : ""}

      Use a valid executor from the available agents list provided in the prompt.
    `,

    EXECUTOR_CANNOT_HANDLE_STEP: dedent`
      Step "${error.context}" is assigned to an executor that cannot handle
      its step type.
      ${executor ? `Executor: "${executor}"` : ""}
      ${stepType ? `Step type: "${stepType}"` : ""}

      Assign an executor that supports the step type, or change the step type
      to match the executor's capabilities.
    `,

    DUPLICATE_STEP_ID: dedent`
      Multiple steps have the same ID: "${error.context}".

      Each step must have a unique ID. Rename one of the duplicate steps.
    `,

    DUPLICATE_HYPOTHESIS_ID: dedent`
      Multiple hypotheses have the same ID: "${error.context}".

      Each hypothesis must have a unique ID. Rename one of the duplicates.
    `,

    DUPLICATE_REQUIREMENT_ID: dedent`
      Multiple requirements have the same ID: "${error.context}".

      Each requirement must have a unique ID. Rename one of the duplicates.
    `,
  };

  const instruction = instructions[error.code];
  if (instruction) {
    return instruction;
  }

  // Fallback for any unhandled error codes
  return dedent`
    Fix the ${error.code} error${error.context ? ` on "${error.context}"` : ""}.

    Error message: ${error.message}
  `;
}

// =============================================================================
// MAIN EXPORT
// =============================================================================

/**
 * Build a revision prompt for the planner agent based on validation errors.
 *
 * Strategy: Include ALL errors so the LLM can fix them in one pass.
 * This prevents the common case where fixing one error introduces another.
 *
 * @param plan - The plan that failed validation
 * @param errors - All validation errors to fix
 * @returns A revision prompt string to append to the generation context
 */
export function buildRevisionFeedback(
  plan: PlanSpec,
  errors: ValidationError[],
): string {
  if (errors.length === 0) {
    return "";
  }

  // Build error sections for all errors
  const errorSections = errors.map((error, index) => {
    const stepContext = error.context
      ? plan.steps.find((step) => step.id === error.context)
      : undefined;

    const fixInstructions = getFixInstructions(error, stepContext);

    return dedent`
      ### Error ${index + 1}: ${error.code}
      ${error.message}

      ${stepContext ? formatStepContext(stepContext) : ""}

      **Fix Required:**
      ${fixInstructions}
    `;
  });

  return dedent`
    ## Revision Required

    Your previous plan failed validation with ${errors.length} error${errors.length > 1 ? "s" : ""}.
    Fix ALL errors in a single revision.

    ${errorSections.join("\n\n---\n\n")}

    ## Important Reminders

    When fixing these errors, ensure you:
    - Keep all existing step IDs stable unless they're duplicates
    - Verify all references (hypothesisIds, requirementIds, dependencyIds) point to existing IDs
    - Maintain the DAG structure (no circular dependencies)
    - Do not introduce new errors while fixing these

    Regenerate the complete plan with all fixes applied.
  `;
}
