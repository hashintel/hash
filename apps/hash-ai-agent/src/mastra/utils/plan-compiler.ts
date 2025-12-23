/**
 * Plan Compiler — Transforms PlanSpec into Mastra Workflow
 *
 * Compiles a validated PlanSpec into an executable Mastra Workflow.
 * Uses the TopologyAnalyzer to determine execution structure and creates
 * steps with streaming instrumentation for real-time progress tracking.
 *
 * The compiler:
 * - Analyzes plan topology for parallel groups and execution order
 * - Creates Mastra steps with mock or real agent execution
 * - Emits streaming events via writer.custom() for frontend consumption
 * - Builds workflow using .then() and .parallel() based on dependencies
 *
 * @see docs/PLAN-task-decomposition.md for design documentation
 */

import type { Step, Workflow } from "@mastra/core/workflows";
import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";

import type {
  Executor,
  PlanSpec,
  PlanStep,
  StepType,
} from "../schemas/plan-spec";
import type { MockAgent, MockResponse } from "./mock-agent";
import { createMockAgentRegistry } from "./mock-agent";
import {
  analyzePlanTopology,
  type TopologyAnalysis,
} from "./topology-analyzer";

// =============================================================================
// STREAMING EVENT TYPES
// =============================================================================

/**
 * Event emitted when plan execution starts.
 */
export interface PlanStartEvent {
  type: "data-plan-start";
  data: {
    planId: string;
    goalSummary: string;
    totalSteps: number;
    criticalPathLength: number;
    entryPoints: string[];
    parallelGroups: number;
  };
}

/**
 * Event emitted when a step begins execution.
 */
export interface PlanStepStartEvent {
  type: "data-plan-step-start";
  data: {
    stepId: string;
    stepType: StepType;
    description: string;
    depth: number;
    executor: Executor;
    dependencyIds: string[];
  };
}

/**
 * Event emitted when a step completes successfully.
 */
export interface PlanStepCompleteEvent {
  type: "data-plan-step-complete";
  data: {
    stepId: string;
    stepType: StepType;
    durationMs: number;
    outputSummary: string;
  };
}

/**
 * Event emitted when a step fails.
 */
export interface PlanStepErrorEvent {
  type: "data-plan-step-error";
  data: {
    stepId: string;
    stepType: StepType;
    error: string;
    durationMs: number;
  };
}

/**
 * Event emitted to report overall progress.
 */
export interface PlanProgressEvent {
  type: "data-plan-progress";
  data: {
    completedSteps: number;
    totalSteps: number;
    currentDepth: number;
    totalDepths: number;
  };
}

/**
 * Event emitted at depth level transitions.
 */
export interface PlanDepthTransitionEvent {
  type: "data-plan-depth-transition";
  data: {
    fromDepth: number;
    toDepth: number;
    stepsCompletedAtDepth: number;
    stepsStartingAtDepth: number;
  };
}

/**
 * Event emitted when plan execution completes.
 */
export interface PlanCompleteEvent {
  type: "data-plan-complete";
  data: {
    planId: string;
    success: boolean;
    totalDurationMs: number;
    stepsCompleted: number;
    stepsFailed: number;
  };
}

/**
 * Union of all plan execution events.
 */
export type PlanExecutionEvent =
  | PlanStartEvent
  | PlanStepStartEvent
  | PlanStepCompleteEvent
  | PlanStepErrorEvent
  | PlanProgressEvent
  | PlanDepthTransitionEvent
  | PlanCompleteEvent;

// =============================================================================
// COMPILER TYPES
// =============================================================================

/**
 * Options for plan compilation.
 */
export interface CompilerOptions {
  /**
   * Use mock agents instead of real agents (for testing).
   * @default true
   */
  useMockAgents?: boolean;

  /**
   * Simulated delay for mock agents in milliseconds.
   * @default 100
   */
  mockDelayMs?: number;

  /**
   * Agent registry for resolving executor refs.
   * If not provided, uses mock registry when useMockAgents is true.
   */
  agentRegistry?: Map<string, MockAgent>;
}

/**
 * Context passed through compilation.
 */
interface CompilerContext {
  plan: PlanSpec;
  topology: TopologyAnalysis;
  options: Required<CompilerOptions>;
  agentRegistry: Map<string, MockAgent>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  steps: Map<string, Step<string, any, any, any, any, any>>;
}

/**
 * Input schema for compiled workflows.
 */
const compiledWorkflowInputSchema = z.object({
  /** Runtime context to pass to steps */
  context: z.record(z.string(), z.unknown()).optional(),
  /** Whether to emit streaming progress events */
  streamProgress: z.boolean().optional().default(true),
});

/**
 * Output schema for compiled workflows.
 */
const compiledWorkflowOutputSchema = z.object({
  planId: z.string(),
  success: z.boolean(),
  results: z.record(z.string(), z.unknown()),
  errors: z
    .array(
      z.object({
        stepId: z.string(),
        error: z.string(),
      }),
    )
    .optional(),
  executionOrder: z.array(z.string()),
  totalDurationMs: z.number(),
});

export type CompiledWorkflowInput = z.infer<typeof compiledWorkflowInputSchema>;
export type CompiledWorkflowOutput = z.infer<
  typeof compiledWorkflowOutputSchema
>;

// =============================================================================
// HELPER FUNCTIONS (defined first to avoid no-use-before-define)
// =============================================================================

/**
 * Build input schema from step artifacts.
 */
function buildInputSchema(planStep: PlanStep): z.ZodType<unknown> {
  if (planStep.inputs.length === 0) {
    return z.object({}).passthrough();
  }

  const fields: Record<string, z.ZodType<unknown>> = {};
  for (const input of planStep.inputs) {
    fields[input.name] = z.unknown().describe(input.description);
  }

  return z.object(fields).passthrough();
}

/**
 * Build output schema from step artifacts.
 */
function buildOutputSchema(_planStep: PlanStep): z.ZodType<unknown> {
  return z
    .object({
      stepId: z.string(),
      result: z.unknown(),
      durationMs: z.number(),
    })
    .passthrough();
}

/**
 * Build a prompt for step execution based on step configuration.
 */
function buildPromptForStep(
  planStep: PlanStep,
  inputData: unknown,
  ctx: CompilerContext,
): string {
  const parts: string[] = [];

  parts.push(`## Task: ${planStep.description}`);
  parts.push(`Step ID: ${planStep.id}`);
  parts.push("");

  // Add step-type specific context
  switch (planStep.type) {
    case "research":
      parts.push(`Research Query: ${planStep.query}`);
      parts.push(`Stopping Rule: ${planStep.stoppingRule}`);
      break;

    case "synthesize":
      parts.push(`Mode: ${planStep.mode}`);
      parts.push(`Dependencies: ${planStep.dependencyIds.join(", ")}`);
      if (planStep.mode === "evaluative" && planStep.evaluateAgainst) {
        parts.push(`Evaluate Against: ${planStep.evaluateAgainst.join(", ")}`);
      }
      break;

    case "experiment": {
      parts.push(`Mode: ${planStep.mode}`);
      parts.push(`Procedure: ${planStep.procedure}`);
      parts.push(`Success Criteria: ${planStep.successCriteria.join(", ")}`);
      // Reference hypotheses
      const hypotheses = planStep.hypothesisIds
        .map((id) => ctx.plan.hypotheses.find((hyp) => hyp.id === id))
        .filter((hyp): hyp is NonNullable<typeof hyp> => hyp !== undefined);
      if (hypotheses.length > 0) {
        parts.push(`Hypotheses to Test:`);
        for (const hyp of hypotheses) {
          parts.push(`  - ${hyp.id}: ${hyp.statement}`);
        }
      }
      break;
    }

    case "develop":
      parts.push(`Specification: ${planStep.specification}`);
      parts.push(`Deliverables: ${planStep.deliverables.join(", ")}`);
      break;
  }

  // Add input data context if present
  if (
    inputData &&
    typeof inputData === "object" &&
    Object.keys(inputData).length > 0
  ) {
    parts.push("");
    parts.push("## Input Data");
    parts.push("```json");
    parts.push(JSON.stringify(inputData, null, 2));
    parts.push("```");
  }

  // Add evaluation criteria if present
  if (planStep.evalCriteria) {
    parts.push("");
    parts.push("## Success Criteria");
    parts.push(`Success: ${planStep.evalCriteria.successCondition}`);
    if (planStep.evalCriteria.failureCondition) {
      parts.push(`Failure: ${planStep.evalCriteria.failureCondition}`);
    }
  }

  return parts.join("\n");
}

/**
 * Summarize output for streaming events.
 */
function summarizeOutput(result: unknown): string {
  if (result === null || result === undefined) {
    return "<no output>";
  }

  if (typeof result === "string") {
    return result.slice(0, 200) + (result.length > 200 ? "..." : "");
  }

  if (typeof result === "object") {
    // Check for mock response
    if ("__mock" in result && result.__mock === true) {
      const mock = result as MockResponse;
      return `[Mock ${mock.stepType}] ${mock.stepId}`;
    }

    const json = JSON.stringify(result);
    return json.slice(0, 200) + (json.length > 200 ? "..." : "");
  }

  return JSON.stringify(result).slice(0, 200);
}

/**
 * Executes a step based on its executor binding.
 */
async function executeStep(
  planStep: PlanStep,
  inputData: unknown,
  ctx: CompilerContext,
): Promise<unknown> {
  const { executor } = planStep;

  switch (executor.kind) {
    case "agent": {
      const agent = ctx.agentRegistry.get(executor.ref);
      if (!agent) {
        throw new Error(
          `Agent "${executor.ref}" not found in registry. ` +
            `Available agents: ${Array.from(ctx.agentRegistry.keys()).join(", ")}`,
        );
      }

      // Build prompt from step configuration
      const prompt = buildPromptForStep(planStep, inputData, ctx);

      // Execute via mock agent
      // nosemgrep: mock agent doesn't perform network I/O; avoid SSRF false positive.
      const response = await agent.generate(prompt);
      return response.object;
    }

    case "tool": {
      // Stub for future implementation
      throw new Error(
        `Tool executor not yet implemented. Step "${planStep.id}" uses tool "${executor.ref}".`,
      );
    }

    case "workflow": {
      // Stub for future implementation
      throw new Error(
        `Workflow executor not yet implemented. Step "${planStep.id}" uses workflow "${executor.ref}".`,
      );
    }

    case "human": {
      // Stub for future HITL implementation
      throw new Error(
        `Human executor not yet implemented. Step "${planStep.id}" requires human intervention. ` +
          `Instructions: ${executor.instructions ?? "None provided"}`,
      );
    }

    default: {
      const exhaustiveCheck: never = executor;
      throw new Error(
        `Unknown executor kind: ${JSON.stringify(exhaustiveCheck)}`,
      );
    }
  }
}

// =============================================================================
// STEP CREATION
// =============================================================================

/**
 * Creates a Mastra step from a PlanStep with streaming instrumentation.
 */
function createMastraStep(planStep: PlanStep, ctx: CompilerContext) {
  const depth = ctx.topology.depthMap.get(planStep.id) ?? 0;

  // Build input/output schemas from step artifacts
  const inputSchema = buildInputSchema(planStep);
  const outputSchema = buildOutputSchema(planStep);

  return createStep({
    id: planStep.id,
    description: planStep.description,
    inputSchema,
    outputSchema,
    execute: async ({ inputData, writer }) => {
      const startTime = Date.now();

      // Emit step start event
      await writer.custom({
        type: "data-plan-step-start",
        data: {
          stepId: planStep.id,
          stepType: planStep.type,
          description: planStep.description,
          depth,
          executor: planStep.executor,
          dependencyIds: planStep.dependencyIds,
        },
      } satisfies PlanStepStartEvent);

      try {
        // Execute based on executor type
        const result = await executeStep(planStep, inputData, ctx);

        const durationMs = Date.now() - startTime;

        // Emit step complete event
        await writer.custom({
          type: "data-plan-step-complete",
          data: {
            stepId: planStep.id,
            stepType: planStep.type,
            durationMs,
            outputSummary: summarizeOutput(result),
          },
        } satisfies PlanStepCompleteEvent);

        return {
          stepId: planStep.id,
          result,
          durationMs,
        };
      } catch (error) {
        const durationMs = Date.now() - startTime;

        // Emit step error event
        await writer.custom({
          type: "data-plan-step-error",
          data: {
            stepId: planStep.id,
            stepType: planStep.type,
            error: error instanceof Error ? error.message : String(error),
            durationMs,
          },
        } satisfies PlanStepErrorEvent);

        // Re-throw for fail-fast behavior
        throw error;
      }
    },
  });
}

// =============================================================================
// WORKFLOW FLOW BUILDING
// =============================================================================

/**
 * Builds the workflow execution flow from parallel groups.
 *
 * Strategy:
 * - Process parallel groups in order (by depth)
 * - Single step at a depth → .then()
 * - Multiple concurrent steps → .parallel()
 * - Wrap with entry/exit handlers for streaming events
 */
function buildWorkflowFromGroups(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  workflow: Workflow<any, any, any, any, any, any, any>,
  ctx: CompilerContext,
): void {
  const { plan, topology } = ctx;

  // Track execution for final output
  const executionState = {
    startTime: 0,
    completedStepIds: [] as string[],
    results: {} as Record<string, unknown>,
    errors: [] as Array<{ stepId: string; error: string }>,
  };

  // Entry: Emit plan start event and initialize state
  workflow.map(async ({ inputData, writer }) => {
    executionState.startTime = Date.now();

    await writer.custom({
      type: "data-plan-start",
      data: {
        planId: plan.id,
        goalSummary: plan.goalSummary,
        totalSteps: plan.steps.length,
        criticalPathLength: topology.criticalPath.length,
        entryPoints: topology.entryPoints,
        parallelGroups: topology.parallelGroups.length,
      },
    } satisfies PlanStartEvent);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return inputData;
  });

  // Process each parallel group
  let previousDepth = -1;

  for (const group of topology.parallelGroups) {
    const stepsInGroup = group.stepIds
      .map((id) => ctx.steps.get(id))
      .filter((step): step is NonNullable<typeof step> => step !== undefined);

    if (stepsInGroup.length === 0) {
      continue;
    }

    // Emit depth transition event if depth changed
    if (group.depth !== previousDepth && previousDepth >= 0) {
      const fromDepth = previousDepth;
      const toDepth = group.depth;
      const stepsCompletedAtDepth =
        topology.parallelGroups.find((grp) => grp.depth === fromDepth)?.stepIds
          .length ?? 0;

      workflow.map(async ({ inputData, writer }) => {
        await writer.custom({
          type: "data-plan-depth-transition",
          data: {
            fromDepth,
            toDepth,
            stepsCompletedAtDepth,
            stepsStartingAtDepth: stepsInGroup.length,
          },
        } satisfies PlanDepthTransitionEvent);

        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return inputData;
      });
    }

    previousDepth = group.depth;

    // Add steps based on parallelizability
    if (stepsInGroup.length === 1) {
      // Single step - use .then()
      workflow.then(stepsInGroup[0]!);
    } else {
      // Multiple steps - check if all are concurrent
      const concurrentSteps = group.concurrentStepIds
        .map((id) => ctx.steps.get(id))
        .filter((step): step is NonNullable<typeof step> => step !== undefined);

      if (concurrentSteps.length === stepsInGroup.length) {
        // All concurrent - use .parallel()
        workflow.parallel(concurrentSteps);
      } else if (concurrentSteps.length > 1) {
        // Mixed: parallel first, then sequential
        workflow.parallel(concurrentSteps);
        const sequentialSteps = stepsInGroup.filter(
          (step) => !concurrentSteps.includes(step),
        );
        for (const step of sequentialSteps) {
          workflow.then(step);
        }
      } else {
        // All sequential
        for (const step of stepsInGroup) {
          workflow.then(step);
        }
      }
    }

    // Emit progress after each group
    const currentDepth = group.depth;
    const completedAtThisPoint = topology.parallelGroups
      .filter((grp) => grp.depth <= currentDepth)
      .flatMap((grp) => grp.stepIds);

    workflow.map(async ({ inputData, writer }) => {
      await writer.custom({
        type: "data-plan-progress",
        data: {
          completedSteps: completedAtThisPoint.length,
          totalSteps: plan.steps.length,
          currentDepth,
          totalDepths: topology.parallelGroups.length,
        },
      } satisfies PlanProgressEvent);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return inputData;
    });
  }

  // Exit: Emit plan complete event and collect results
  workflow.map(async ({ inputData, writer }) => {
    const totalDurationMs = Date.now() - executionState.startTime;

    await writer.custom({
      type: "data-plan-complete",
      data: {
        planId: plan.id,
        success: executionState.errors.length === 0,
        totalDurationMs,
        stepsCompleted: plan.steps.length - executionState.errors.length,
        stepsFailed: executionState.errors.length,
      },
    } satisfies PlanCompleteEvent);

    return {
      planId: plan.id,
      success: executionState.errors.length === 0,
      results: inputData as Record<string, unknown>,
      errors:
        executionState.errors.length > 0 ? executionState.errors : undefined,
      executionOrder: topology.topologicalOrder,
      totalDurationMs,
    };
  });
}

// =============================================================================
// MAIN COMPILER FUNCTION
// =============================================================================

/**
 * Compiles a validated PlanSpec into a Mastra Workflow.
 *
 * The compilation strategy:
 * 1. Analyze topology to get parallel groups and execution order
 * 2. Create Mastra steps for each PlanStep with streaming instrumentation
 * 3. Build workflow using parallel groups:
 *    - Single step at a depth → .then()
 *    - Multiple concurrent steps at same depth → .parallel()
 *
 * @param plan - A validated PlanSpec (call validatePlan first!)
 * @param options - Compilation options
 * @returns Compiled Mastra workflow ready for execution
 *
 * @example
 * ```typescript
 * const plan = await generatePlan({ goal: "..." });
 * const validation = validatePlan(plan);
 * if (!validation.valid) throw new Error("Invalid plan");
 *
 * const workflow = compilePlanToWorkflow(plan, { useMockAgents: true });
 * const run = workflow.createRun();
 * const result = await run.start({ context: {} });
 * ```
 */
export function compilePlanToWorkflow(
  plan: PlanSpec,
  options: CompilerOptions = {},
) {
  // Normalize options
  const normalizedOptions: Required<CompilerOptions> = {
    useMockAgents: options.useMockAgents ?? true,
    mockDelayMs: options.mockDelayMs ?? 100,
    agentRegistry:
      options.agentRegistry ??
      createMockAgentRegistry({ simulatedDelayMs: options.mockDelayMs ?? 100 }),
  };

  // Analyze topology
  const topology = analyzePlanTopology(plan);

  // Build compiler context
  const ctx: CompilerContext = {
    plan,
    topology,
    options: normalizedOptions,
    agentRegistry: normalizedOptions.agentRegistry,
    steps: new Map(),
  };

  // Phase 1: Create Mastra steps for each PlanStep
  for (const planStep of plan.steps) {
    const mastraStep = createMastraStep(planStep, ctx);
    ctx.steps.set(planStep.id, mastraStep);
  }

  // Phase 2: Create workflow
  const workflow = createWorkflow({
    id: `compiled-plan-${plan.id}`,
    inputSchema: compiledWorkflowInputSchema,
    outputSchema: compiledWorkflowOutputSchema,
  });

  // Phase 3: Build workflow from parallel groups
  buildWorkflowFromGroups(workflow, ctx);

  // Phase 4: Commit and return
  workflow.commit();

  return workflow;
}

// =============================================================================
// EXPORTS
// =============================================================================

export { compiledWorkflowInputSchema, compiledWorkflowOutputSchema };
