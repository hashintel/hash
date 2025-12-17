/**
 * Planner Agent — Goal Decomposition
 *
 * Decomposes complex goals into structured PlanSpec instances.
 * Uses structured output to ensure the generated plan conforms to the schema.
 *
 * This is the core agent for the task decomposition framework.
 *
 * @see docs/PLAN-task-decomposition.md for design documentation
 */

import { Agent } from "@mastra/core/agent";
import dedent from "dedent";

import { DEFAULT_MODEL, formatAgentsForPrompt } from "../constants";
import type { PlanSpec } from "../schemas/plan-spec";
import { zPlanSpec } from "../schemas/plan-spec";

/**
 * System instructions for the planner agent.
 *
 * Explains:
 * - The role and goal of the agent
 * - The step types and when to use each
 * - How to structure unknowns
 * - How to assign executors
 */
const PLANNER_INSTRUCTIONS = dedent`
  You are an expert research and development planner. Your role is to decompose
  complex goals into structured, executable plans.

  ## Your Task

  Given a goal and context, produce a PlanSpec that:
  1. Extracts clear requirements from the goal
  2. Identifies hypotheses to test (if the goal involves uncertainty)
  3. Creates a DAG of steps that achieves the goal
  4. Surfaces uncertainties in a structured unknowns map

  ## Step Types

  You have 4 step types available:

  ### research
  - Use for: Gathering existing knowledge, literature review, exploring codebases
  - Parallelizable: YES - multiple research queries can run concurrently
  - Must include: query (what to search for), stoppingRule (when research is "done")

  ### synthesize
  - Use for: Combining findings OR evaluating results against criteria
  - Parallelizable: NO - requires all inputs to be ready
  - Modes:
    - "integrative": Combine multiple findings into coherent understanding
    - "evaluative": Judge results against specific criteria (like assessment)
  - If mode is "evaluative", must include evaluateAgainst criteria

  ### experiment
  - Use for: Testing hypotheses empirically, running prototypes, benchmarking
  - Parallelizable: Can be parallel (independent experiments) or sequential
  - Modes:
    - "exploratory": Hypothesis generation, flexible analysis
    - "confirmatory": Preregistered design, locked analysis plan
  - IMPORTANT: If mode is "confirmatory", you MUST include preregisteredCommitments array
    - preregisteredCommitments are decisions locked before seeing outcomes
    - Examples: "Primary metric is F1 score", "Sample size is 100", "Threshold for success is >0.8"
  - Must reference hypothesis IDs being tested

  ### develop
  - Use for: Building/implementing something, writing code, creating artifacts
  - Parallelizable: Sometimes - depends on dependencies

  ## Unknowns Map

  Structure your uncertainties into three categories:

  1. **knownKnowns**: High-confidence facts you're building on
  2. **knownUnknowns**: Explicit questions you need to answer
  3. **unknownUnknowns**: What would surprise you (include detection signals)
  4. **communityCheck**: What would others need to scrutinize your claims

  ## Executor Assignment

  Each step needs an executor object. The executor schema is:

  \`\`\`
  executor: {
    kind: "agent" | "tool" | "workflow" | "human",
    ref: "<executor-id>"  // Required for agent/tool/workflow
  }
  \`\`\`

  IMPORTANT: The executor.kind is NOT the step type! 
  - Step type = what kind of work (research, synthesize, experiment, develop)
  - Executor kind = who performs it (agent, tool, workflow, human)

  For most steps, use kind: "agent" with a ref from the available agents list.
  Example: { kind: "agent", ref: "literature-searcher" }

  ## Output Requirements

  - Generate unique IDs for requirements (R1, R2...), hypotheses (H1, H2...), and steps (S1, S2...)
  - Ensure dependsOn references only existing step IDs
  - Ensure hypothesisIds references only existing hypothesis IDs
  - Ensure requirementIds references only existing requirement IDs
  - Create a valid DAG (no circular dependencies)
`;

/**
 * The planner agent instance.
 *
 * Use generatePlan() instead of calling this directly to get
 * properly typed structured output.
 */
export const plannerAgent = new Agent({
  id: "planner-agent",
  name: "Research & Development Planner",
  instructions: PLANNER_INSTRUCTIONS,
  model: DEFAULT_MODEL,
});

/**
 * Input for plan generation.
 */
export interface PlanGenerationInput {
  /** The goal to decompose */
  goal: string;
  /** Additional context to inform planning */
  context?: string;
}

/**
 * Result of plan generation.
 */
export interface PlanGenerationResult {
  /** The generated plan (may be invalid - run validator) */
  plan: PlanSpec;
  /** Raw text response from the agent (for debugging) */
  rawText?: string;
}

/**
 * Generate a plan from a goal using the planner agent.
 *
 * This is the main entry point for plan generation. The returned plan
 * should be validated using validatePlan() before use.
 *
 * @example
 * ```typescript
 * const result = await generatePlan({
 *   goal: "Summarize 3 papers on RAG",
 *   context: "For an internal tech review",
 * });
 *
 * const validation = validatePlan(result.plan);
 * if (validation.valid) {
 *   // Use the plan
 * }
 * ```
 */
export async function generatePlan(
  input: PlanGenerationInput,
): Promise<PlanGenerationResult> {
  const { goal, context } = input;

  // Build the user prompt
  const userPrompt = dedent`
    ## Goal

    ${goal}

    ${context ? `## Context\n\n${context}` : ""}

    ## Available Executors

    ${formatAgentsForPrompt()}

    ## Instructions

    Decompose this goal into a structured plan. Ensure:
    - All step dependencies form a valid DAG (no cycles)
    - All references (hypothesisIds, requirementIds, dependsOn) point to existing IDs
    - Each step has an appropriate executor assigned
    - The unknowns map captures your uncertainty honestly

    Generate the plan now.
  `;

  const response = await plannerAgent.generate(userPrompt, {
    structuredOutput: {
      schema: zPlanSpec,
    },
  });

  return {
    plan: response.object,
    rawText: response.text,
  };
}
