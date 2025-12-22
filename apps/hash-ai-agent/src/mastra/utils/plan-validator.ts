/**
 * Plan Validator — Deterministic Structural Validation
 *
 * Performs structural validation on PlanSpec instances before scoring.
 * All checks are deterministic (no LLM calls) and can be used for fast-fail
 * before expensive LLM-based evaluation.
 *
 * Validation checks:
 * - DAG is acyclic (no circular dependencies)
 * - All step references (dependencyIds) exist
 * - All hypothesis references exist
 * - All requirement references exist
 * - Executor references are in the available agents list
 * - Executor can handle the assigned step type
 * - Confirmatory experiments have preregistered commitments
 * - Evaluative synthesize steps have evaluateAgainst criteria
 * - Plan has at least one step
 *
 * @see docs/PLAN-task-decomposition.md for design documentation
 */

import type {
  ExperimentStep,
  PlanSpec,
  SynthesizeStep,
} from "../schemas/plan-spec";
import { AVAILABLE_AGENTS, canAgentHandle } from "./plan-executors";

// =============================================================================
// VALIDATION ERROR TYPES
// =============================================================================

/**
 * Error codes for validation failures.
 */
export type ValidationErrorCode =
  | "EMPTY_PLAN"
  | "CYCLE_DETECTED"
  | "INVALID_STEP_REFERENCE"
  | "INVALID_HYPOTHESIS_REFERENCE"
  | "INVALID_REQUIREMENT_REFERENCE"
  | "INVALID_EXECUTOR_REFERENCE"
  | "EXECUTOR_CANNOT_HANDLE_STEP"
  | "MISSING_PREREGISTERED_COMMITMENTS"
  | "MISSING_EVALUATE_AGAINST"
  | "DUPLICATE_STEP_ID"
  | "DUPLICATE_HYPOTHESIS_ID"
  | "DUPLICATE_REQUIREMENT_ID";

/**
 * A single validation error.
 */
export interface ValidationError {
  code: ValidationErrorCode;
  message: string;
  /** The step, hypothesis, or requirement ID that caused the error */
  context?: string;
  /** Additional details about the error */
  details?: Record<string, unknown>;
}

/**
 * Result of plan validation.
 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  /** Summary counts for quick assessment */
  summary: {
    stepCount: number;
    hypothesisCount: number;
    requirementCount: number;
    errorCount: number;
  };
}

// =============================================================================
// INDIVIDUAL VALIDATORS
// =============================================================================

/**
 * Check that the plan has at least one step.
 */
function validateNotEmpty(plan: PlanSpec): ValidationError[] {
  if (plan.steps.length === 0) {
    return [
      {
        code: "EMPTY_PLAN",
        message: "Plan must have at least one step",
      },
    ];
  }
  return [];
}

/**
 * Check for duplicate step IDs.
 */
function validateUniqueStepIds(plan: PlanSpec): ValidationError[] {
  const errors: ValidationError[] = [];
  const seen = new Set<string>();

  for (const step of plan.steps) {
    if (seen.has(step.id)) {
      errors.push({
        code: "DUPLICATE_STEP_ID",
        message: `Duplicate step ID: ${step.id}`,
        context: step.id,
      });
    }
    seen.add(step.id);
  }

  return errors;
}

/**
 * Check for duplicate hypothesis IDs.
 */
function validateUniqueHypothesisIds(plan: PlanSpec): ValidationError[] {
  const errors: ValidationError[] = [];
  const seen = new Set<string>();

  for (const hypothesis of plan.hypotheses) {
    if (seen.has(hypothesis.id)) {
      errors.push({
        code: "DUPLICATE_HYPOTHESIS_ID",
        message: `Duplicate hypothesis ID: ${hypothesis.id}`,
        context: hypothesis.id,
      });
    }
    seen.add(hypothesis.id);
  }

  return errors;
}

/**
 * Check for duplicate requirement IDs.
 */
function validateUniqueRequirementIds(plan: PlanSpec): ValidationError[] {
  const errors: ValidationError[] = [];
  const seen = new Set<string>();

  for (const requirement of plan.requirements) {
    if (seen.has(requirement.id)) {
      errors.push({
        code: "DUPLICATE_REQUIREMENT_ID",
        message: `Duplicate requirement ID: ${requirement.id}`,
        context: requirement.id,
      });
    }
    seen.add(requirement.id);
  }

  return errors;
}

/**
 * Check that all step references (dependencyIds) exist.
 */
function validateStepReferences(plan: PlanSpec): ValidationError[] {
  const errors: ValidationError[] = [];
  const stepIds = new Set(plan.steps.map((step) => step.id));

  for (const step of plan.steps) {
    const refs = step.dependencyIds;
    for (const ref of refs) {
      if (!stepIds.has(ref)) {
        errors.push({
          code: "INVALID_STEP_REFERENCE",
          message: `Step "${step.id}" references non-existent step "${ref}"`,
          context: step.id,
          details: { invalidRef: ref },
        });
      }
    }
  }

  return errors;
}

/**
 * Check that all hypothesis references exist.
 */
function validateHypothesisReferences(plan: PlanSpec): ValidationError[] {
  const errors: ValidationError[] = [];
  const hypothesisIds = new Set(plan.hypotheses.map((hyp) => hyp.id));

  for (const step of plan.steps) {
    const refs = step.type === "experiment" ? step.hypothesisIds : [];
    for (const ref of refs) {
      if (!hypothesisIds.has(ref)) {
        errors.push({
          code: "INVALID_HYPOTHESIS_REFERENCE",
          message: `Step "${step.id}" references non-existent hypothesis "${ref}"`,
          context: step.id,
          details: { invalidRef: ref },
        });
      }
    }
  }

  return errors;
}

/**
 * Check that all requirement references exist.
 */
function validateRequirementReferences(plan: PlanSpec): ValidationError[] {
  const errors: ValidationError[] = [];
  const planReqs = new Set(plan.requirements.map((req) => req.id));

  for (const step of plan.steps) {
    const stepReqs = step.requirementIds;
    for (const req of stepReqs) {
      if (!planReqs.has(req)) {
        errors.push({
          code: "INVALID_REQUIREMENT_REFERENCE",
          message: `Step "${step.id}" references non-existent requirement "${req}"`,
          context: step.id,
          details: { invalidRef: req },
        });
      }
    }
  }

  return errors;
}

/**
 * Check that executor references exist and can handle the step type.
 */
function validateExecutors(plan: PlanSpec): ValidationError[] {
  const errors: ValidationError[] = [];
  const availableAgentRefs = new Set(Object.keys(AVAILABLE_AGENTS));

  for (const step of plan.steps) {
    const { executor } = step;

    if (executor.kind === "agent") {
      // Check agent exists
      if (!availableAgentRefs.has(executor.ref)) {
        errors.push({
          code: "INVALID_EXECUTOR_REFERENCE",
          message: `Step "${step.id}" references unknown agent "${executor.ref}"`,
          context: step.id,
          details: { invalidRef: executor.ref },
        });
      } else {
        // Check agent can handle this step type
        const canHandle = canAgentHandle(
          executor.ref as keyof typeof AVAILABLE_AGENTS,
          step.type,
        );
        if (!canHandle) {
          errors.push({
            code: "EXECUTOR_CANNOT_HANDLE_STEP",
            message: `Agent "${executor.ref}" cannot handle step type "${step.type}" (step "${step.id}")`,
            context: step.id,
            details: { agent: executor.ref, stepType: step.type },
          });
        }
      }
    }
    // Note: tool, workflow, and human executors are not validated against a list
    // since they may be dynamically provided
  }

  return errors;
}

/**
 * Check that confirmatory experiments have preregistered commitments.
 */
function validateExperimentRigor(plan: PlanSpec): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const step of plan.steps) {
    if (step.type === "experiment") {
      const experimentStep: ExperimentStep = step;
      if (experimentStep.mode === "confirmatory") {
        if (
          !experimentStep.preregisteredCommitments ||
          experimentStep.preregisteredCommitments.length === 0
        ) {
          errors.push({
            code: "MISSING_PREREGISTERED_COMMITMENTS",
            message: `Confirmatory experiment "${step.id}" must have preregistered commitments`,
            context: step.id,
          });
        }
      }
    }
  }

  return errors;
}

/**
 * Check that evaluative synthesize steps have evaluateAgainst criteria.
 */
function validateSynthesizeMode(plan: PlanSpec): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const step of plan.steps) {
    if (step.type === "synthesize") {
      const synthesizeStep: SynthesizeStep = step;
      if (synthesizeStep.mode === "evaluative") {
        if (
          !synthesizeStep.evaluateAgainst ||
          synthesizeStep.evaluateAgainst.length === 0
        ) {
          errors.push({
            code: "MISSING_EVALUATE_AGAINST",
            message: `Evaluative synthesize step "${step.id}" must have evaluateAgainst criteria`,
            context: step.id,
          });
        }
      }
    }
  }

  return errors;
}

/**
 * Detect cycles in the step dependency graph using DFS.
 *
 * Returns the cycle path if found (e.g., ["A", "B", "C", "A"]).
 */
function detectCycle(plan: PlanSpec): string[] | null {
  const stepIds = new Set(plan.steps.map((step) => step.id));
  const adjacency = new Map<string, string[]>();

  // Build adjacency list (step -> steps it depends on)
  for (const step of plan.steps) {
    const deps = step.dependencyIds.filter((ref) => stepIds.has(ref));
    adjacency.set(step.id, deps);
  }

  // DFS state
  const WHITE = 0; // Unvisited
  const GRAY = 1; // Currently visiting (in stack)
  const BLACK = 2; // Finished

  const color = new Map<string, number>();
  const parent = new Map<string, string | null>();

  for (const stepId of stepIds) {
    color.set(stepId, WHITE);
    parent.set(stepId, null);
  }

  // DFS from each unvisited node
  for (const startId of stepIds) {
    if (color.get(startId) !== WHITE) {
      continue;
    }

    const stack: string[] = [startId];

    while (stack.length > 0) {
      const current = stack[stack.length - 1]!;
      const currentColor = color.get(current);

      if (currentColor === WHITE) {
        color.set(current, GRAY);
        const deps = adjacency.get(current) ?? [];

        for (const dep of deps) {
          const depColor = color.get(dep);

          if (depColor === GRAY) {
            // Found a back edge - reconstruct cycle
            const cycle: string[] = [dep];
            let node = current;
            while (node !== dep) {
              cycle.push(node);
              node = parent.get(node)!;
            }
            cycle.push(dep);
            return cycle.reverse();
          }

          if (depColor === WHITE) {
            parent.set(dep, current);
            stack.push(dep);
          }
        }
      } else {
        // Backtracking
        color.set(current, BLACK);
        stack.pop();
      }
    }
  }

  return null;
}

/**
 * Check that the step DAG is acyclic.
 */
function validateAcyclic(plan: PlanSpec): ValidationError[] {
  const cycle = detectCycle(plan);

  if (cycle) {
    return [
      {
        code: "CYCLE_DETECTED",
        message: `Dependency cycle detected: ${cycle.join(" -> ")}`,
        details: { cycle },
      },
    ];
  }

  return [];
}

// =============================================================================
// MAIN VALIDATOR
// =============================================================================

/**
 * Validate a PlanSpec for structural correctness.
 *
 * Runs all deterministic validation checks and returns a result object
 * with any errors found. This should be called before LLM-based scoring.
 *
 * @example
 * ```typescript
 * const result = validatePlan(planSpec);
 * if (!result.valid) {
 *   console.error("Validation failed:", result.errors);
 * }
 * ```
 */
export function validatePlan(plan: PlanSpec): ValidationResult {
  const errors: ValidationError[] = [
    ...validateNotEmpty(plan),
    ...validateUniqueStepIds(plan),
    ...validateUniqueHypothesisIds(plan),
    ...validateUniqueRequirementIds(plan),
    ...validateStepReferences(plan),
    ...validateHypothesisReferences(plan),
    ...validateRequirementReferences(plan),
    ...validateExecutors(plan),
    ...validateExperimentRigor(plan),
    ...validateSynthesizeMode(plan),
    ...validateAcyclic(plan),
  ];

  return {
    valid: errors.length === 0,
    errors,
    summary: {
      stepCount: plan.steps.length,
      hypothesisCount: plan.hypotheses.length,
      requirementCount: plan.requirements.length,
      errorCount: errors.length,
    },
  };
}

/**
 * Validate a PlanSpec and throw if invalid.
 *
 * Useful for assertions in tests or when you want to fail fast.
 *
 * @throws Error with validation details if the plan is invalid
 */
export function assertValidPlan(plan: PlanSpec): void {
  const result = validatePlan(plan);
  if (!result.valid) {
    const errorMessages = result.errors
      .map((err) => `  - [${err.code}] ${err.message}`)
      .join("\n");
    throw new Error(`Invalid plan:\n${errorMessages}`);
  }
}

/**
 * Get a specific type of validation errors from a result.
 */
export function getErrorsByCode(
  result: ValidationResult,
  code: ValidationErrorCode,
): ValidationError[] {
  return result.errors.filter((err) => err.code === code);
}

/**
 * Check if a specific validation error type is present.
 */
export function hasError(
  result: ValidationResult,
  code: ValidationErrorCode,
): boolean {
  return result.errors.some((err) => err.code === code);
}
