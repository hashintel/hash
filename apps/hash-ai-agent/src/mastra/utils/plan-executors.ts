import type { StepType } from "../schemas/plan-spec";

/**
 * Capability profile for an available agent.
 *
 * These profiles help the planner reason about which executor to assign to each step.
 * The `canHandle` array maps to PlanSpec step types.
 */

export interface AgentCapabilityProfile {
  /** Human-readable description of what this agent does */
  description: string;
  /** Step types this agent can execute */
  canHandle: StepType[];
  /** Named inputs this agent expects */
  inputs: string[];
  /** Named outputs this agent produces */
  outputs: string[];
}

/**
 * Available agents for plan execution.
 *
 * Each agent has a capability profile that the planner uses to assign executors.
 * The structure supports:
 * - Validating that executor refs exist
 * - Checking that assigned executors can handle the step type
 * - Generating prompt context for the planner
 *
 * @see docs/PLAN-task-decomposition.md Section 5 for design rationale
 */

export const AVAILABLE_AGENTS = {
  // ---------------------------------------------------------------------------
  // Research & Discovery
  // ---------------------------------------------------------------------------
  "literature-searcher": {
    description: "Searches academic papers and technical documentation",
    canHandle: ["research"],
    inputs: ["query", "sources?"],
    outputs: ["papers", "summaries"],
  },

  "paper-summarizer": {
    description: "Reads and summarizes academic papers",
    canHandle: ["research"],
    inputs: ["paper"],
    outputs: ["summary", "keyFindings"],
  },

  "concept-explainer": {
    description: "Explains technical concepts at varying depths",
    canHandle: ["research", "synthesize"],
    inputs: ["concept", "targetAudience?"],
    outputs: ["explanation"],
  },

  // ---------------------------------------------------------------------------
  // Analysis & Synthesis
  // ---------------------------------------------------------------------------
  "result-synthesizer": {
    description:
      "Combines findings from multiple sources into coherent understanding",
    canHandle: ["synthesize"],
    inputs: ["findings[]"],
    outputs: ["synthesis", "comparison?"],
  },

  "hypothesis-generator": {
    description: "Generates testable hypotheses from findings",
    canHandle: ["synthesize"], // integrative mode leading to hypotheses
    inputs: ["findings", "constraints"],
    outputs: ["hypotheses"],
  },

  "progress-evaluator": {
    description: "Assesses current state against goals and criteria",
    canHandle: ["synthesize"], // evaluative mode
    inputs: ["results", "criteria"],
    outputs: ["assessment", "gaps", "recommendations"],
  },

  // ---------------------------------------------------------------------------
  // Experimentation
  // ---------------------------------------------------------------------------
  "experiment-designer": {
    description: "Designs experimental procedures with controls",
    canHandle: ["experiment"],
    inputs: ["hypothesis", "constraints"],
    outputs: ["experimentDesign", "protocol"],
  },

  "experiment-runner": {
    description: "Executes experiments and collects results",
    canHandle: ["experiment"],
    inputs: ["experimentDesign", "protocol"],
    outputs: ["results", "observations"],
  },

  // ---------------------------------------------------------------------------
  // Implementation
  // ---------------------------------------------------------------------------
  "code-explorer": {
    description: "Navigates and explains existing codebases",
    canHandle: ["research"],
    inputs: ["codebase", "query"],
    outputs: ["explanation", "relevantFiles"],
  },

  "code-writer": {
    description: "Implements algorithms and prototypes",
    canHandle: ["develop", "experiment"],
    inputs: ["spec", "context"],
    outputs: ["code", "tests?"],
  },

  "code-reviewer": {
    description: "Reviews code for correctness and quality",
    canHandle: ["synthesize"], // evaluative mode
    inputs: ["code", "criteria"],
    outputs: ["review", "issues"],
  },

  "documentation-writer": {
    description: "Writes technical documentation",
    canHandle: ["develop"],
    inputs: ["code", "context"],
    outputs: ["documentation"],
  },
} as const satisfies Record<string, AgentCapabilityProfile>;
/**
 * Type for available agent identifiers.
 */

export type AgentRef = keyof typeof AVAILABLE_AGENTS;
/**
 * Get the capability profile for an agent.
 */

export function getAgentProfile(ref: AgentRef): AgentCapabilityProfile {
  return AVAILABLE_AGENTS[ref];
}
/**
 * Check if an agent can handle a given step type.
 */

export function canAgentHandle(ref: AgentRef, stepType: StepType): boolean {
  const profile = AVAILABLE_AGENTS[ref];
  // Cast needed because canHandle is a readonly tuple from `as const`
  return (profile.canHandle as readonly StepType[]).includes(stepType);
}
/**
 * Get all agents that can handle a given step type.
 */

export function getAgentsForStepType(stepType: StepType): AgentRef[] {
  return (Object.keys(AVAILABLE_AGENTS) as AgentRef[]).filter((ref) =>
    canAgentHandle(ref, stepType),
  );
}
/**
 * Format available agents for inclusion in planner prompts.
 *
 * Groups agents by the step types they can handle for easier reasoning.
 */

export function formatAgentsForPrompt(): string {
  const byStepType: Record<StepType, string[]> = {
    research: [],
    synthesize: [],
    experiment: [],
    develop: [],
  };

  for (const [ref, profile] of Object.entries(AVAILABLE_AGENTS)) {
    for (const stepType of profile.canHandle) {
      const inputsStr = profile.inputs.join(", ");
      const outputsStr = profile.outputs.join(", ");
      byStepType[stepType].push(
        `  - ${ref}: ${profile.description}. Inputs: [${inputsStr}]. Outputs: [${outputsStr}].`,
      );
    }
  }

  const sections: string[] = [];
  for (const [stepType, agents] of Object.entries(byStepType)) {
    if (agents.length > 0) {
      sections.push(`${stepType.toUpperCase()}:\n${agents.join("\n")}`);
    }
  }

  return `Available executors for your plan:\n\n${sections.join("\n\n")}`;
}
