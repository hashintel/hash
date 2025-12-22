/**
 * Mock Agent — Deterministic Agent for Testing Plan Compilation
 *
 * Provides a mock implementation of the Mastra Agent interface that returns
 * deterministic responses based on step type and prompt patterns. This enables
 * testing the plan compiler without incurring LLM API costs.
 *
 * The mock agent:
 * - Returns traceable metadata about what it "executed"
 * - Simulates realistic response structures for each step type
 * - Can be configured with custom response handlers
 *
 * @see docs/PLAN-task-decomposition.md for design documentation
 */

import type { StepType } from "../schemas/plan-spec";

// =============================================================================
// TYPES
// =============================================================================

/**
 * Metadata included in mock responses for traceability.
 */
export interface MockExecutionMetadata {
  __mock: true;
  stepId: string;
  stepType: StepType;
  executorRef: string;
  promptReceived: string;
  simulatedDurationMs: number;
  timestamp: string;
}

/**
 * Mock response structure for research steps.
 */
export interface MockResearchResponse extends MockExecutionMetadata {
  stepType: "research";
  papers: string[];
  summaries: string[];
  sourcesSearched: number;
}

/**
 * Mock response structure for synthesize steps.
 */
export interface MockSynthesizeResponse extends MockExecutionMetadata {
  stepType: "synthesize";
  synthesis: string;
  inputsProcessed: number;
  mode: "integrative" | "evaluative";
}

/**
 * Mock response structure for experiment steps.
 */
export interface MockExperimentResponse extends MockExecutionMetadata {
  stepType: "experiment";
  results: Record<string, unknown>;
  observations: string[];
  hypothesesTested: string[];
  mode: "exploratory" | "confirmatory";
}

/**
 * Mock response structure for develop steps.
 */
export interface MockDevelopResponse extends MockExecutionMetadata {
  stepType: "develop";
  deliverables: string[];
  artifactsProduced: number;
}

/**
 * Union of all mock response types.
 */
export type MockResponse =
  | MockResearchResponse
  | MockSynthesizeResponse
  | MockExperimentResponse
  | MockDevelopResponse;

/**
 * Configuration for a mock agent instance.
 */
export interface MockAgentConfig {
  /** Agent identifier (matches executor.ref in PlanSpec) */
  id: string;
  /** Human-readable name */
  name: string;
  /** Simulated response delay in milliseconds (default: 100) */
  simulatedDelayMs?: number;
  /** Custom response handler for specific prompts */
  customHandler?: (prompt: string, stepInfo: StepInfo) => MockResponse | null;
}

/**
 * Information about the step being executed, extracted from prompt.
 */
export interface StepInfo {
  stepId: string;
  stepType: StepType;
  description: string;
  executorRef: string;
}

// =============================================================================
// MOCK AGENT CLASS
// =============================================================================

/**
 * A deterministic mock agent for testing plan compilation and execution.
 *
 * This class mimics the Mastra Agent interface but returns predictable
 * responses based on step type, enabling testing without LLM calls.
 *
 * @example
 * ```typescript
 * const mockAgent = new MockAgent({
 *   id: "literature-searcher",
 *   name: "Mock Literature Searcher",
 * });
 *
 * const response = await mockAgent.generate("Research: Find papers on RAG");
 * // Returns deterministic MockResearchResponse
 * ```
 */
export class MockAgent {
  readonly id: string;
  readonly name: string;
  private simulatedDelayMs: number;
  private customHandler?: (
    prompt: string,
    stepInfo: StepInfo,
  ) => MockResponse | null;

  constructor(config: MockAgentConfig) {
    this.id = config.id;
    this.name = config.name;
    this.simulatedDelayMs = config.simulatedDelayMs ?? 100;
    this.customHandler = config.customHandler;
  }

  /**
   * Generate a mock response for the given prompt.
   *
   * Parses the prompt to extract step information and returns a
   * deterministic response based on the step type.
   */
  async generate(
    prompt: string,
    _options?: unknown,
  ): Promise<{ text: string; object: MockResponse }> {
    // Simulate processing delay
    if (this.simulatedDelayMs > 0) {
      await this.delay(this.simulatedDelayMs);
    }

    // Check for __THROW__ pattern to simulate step failures
    if (prompt.includes("__THROW__")) {
      throw new Error(
        "Simulated step failure: __THROW__ pattern detected in prompt",
      );
    }

    // Extract step info from prompt
    const stepInfo = this.extractStepInfo(prompt);

    // Try custom handler first
    if (this.customHandler) {
      const customResponse = this.customHandler(prompt, stepInfo);
      if (customResponse) {
        return {
          text: JSON.stringify(customResponse, null, 2),
          object: customResponse,
        };
      }
    }

    // Generate default response based on step type
    const response = this.generateDefaultResponse(prompt, stepInfo);

    return {
      text: JSON.stringify(response, null, 2),
      object: response,
    };
  }

  /**
   * Stream a mock response (returns same as generate, wrapped in async iterator).
   *
   * For mock purposes, this immediately yields the full response.
   * The returned object has a similar shape to Mastra's stream response.
   */
  async stream(
    prompt: string,
    _options?: unknown,
  ): Promise<{
    fullStream: ReadableStream<{ type: string; text?: string }>;
    text: Promise<string>;
    object: Promise<MockResponse>;
  }> {
    const { text, object } = await this.generate(prompt, _options);

    // Create a simple readable stream that emits the text
    const chunks = this.chunkText(text, 50); // 50 char chunks
    let chunkIndex = 0;

    const fullStream = new ReadableStream<{ type: string; text?: string }>({
      pull(controller) {
        if (chunkIndex < chunks.length) {
          controller.enqueue({ type: "text-delta", text: chunks[chunkIndex] });
          chunkIndex++;
        } else {
          controller.enqueue({ type: "finish" });
          controller.close();
        }
      },
    });

    return {
      fullStream,
      text: Promise.resolve(text),
      object: Promise.resolve(object),
    };
  }

  /**
   * Extract step information from the prompt.
   *
   * Looks for patterns like:
   * - "## Task: <description>"
   * - "Step ID: <id>"
   * - Step type indicators in the content
   */
  private extractStepInfo(prompt: string): StepInfo {
    // Default values
    let stepId = "unknown";
    let stepType: StepType = "research";
    let description = "Unknown step";

    // Extract step ID from prompt patterns
    const stepIdMatch = prompt.match(/step[_\s]?id[:\s]+["']?(\w+)["']?/i);
    if (stepIdMatch) {
      stepId = stepIdMatch[1]!;
    }

    // Extract description from "## Task:" section
    const taskMatch = prompt.match(/##\s*Task:\s*(.+?)(?:\n|$)/i);
    if (taskMatch) {
      description = taskMatch[1]!.trim();
    }

    // Infer step type from prompt content
    if (
      prompt.toLowerCase().includes("research") ||
      prompt.toLowerCase().includes("query:")
    ) {
      stepType = "research";
    } else if (
      prompt.toLowerCase().includes("synthesize") ||
      prompt.toLowerCase().includes("mode: integrative") ||
      prompt.toLowerCase().includes("mode: evaluative")
    ) {
      stepType = "synthesize";
    } else if (
      prompt.toLowerCase().includes("experiment") ||
      prompt.toLowerCase().includes("procedure:")
    ) {
      stepType = "experiment";
    } else if (
      prompt.toLowerCase().includes("develop") ||
      prompt.toLowerCase().includes("specification:")
    ) {
      stepType = "develop";
    }

    return {
      stepId,
      stepType,
      description,
      executorRef: this.id,
    };
  }

  /**
   * Generate a default mock response based on step type.
   */
  private generateDefaultResponse(
    prompt: string,
    stepInfo: StepInfo,
  ): MockResponse {
    const baseMetadata: MockExecutionMetadata = {
      __mock: true,
      stepId: stepInfo.stepId,
      stepType: stepInfo.stepType,
      executorRef: stepInfo.executorRef,
      promptReceived: prompt.slice(0, 200) + (prompt.length > 200 ? "..." : ""),
      simulatedDurationMs: this.simulatedDelayMs,
      timestamp: new Date().toISOString(),
    };

    switch (stepInfo.stepType) {
      case "research":
        return {
          ...baseMetadata,
          stepType: "research",
          papers: [
            `mock-paper-1-for-${stepInfo.stepId}`,
            `mock-paper-2-for-${stepInfo.stepId}`,
          ],
          summaries: [
            `Summary of findings for ${stepInfo.description}`,
            `Additional insights from research`,
          ],
          sourcesSearched: 5,
        };

      case "synthesize": {
        const isEvaluative = prompt.toLowerCase().includes("evaluative");
        return {
          ...baseMetadata,
          stepType: "synthesize",
          synthesis: `Synthesized understanding of ${stepInfo.description}. Key themes identified and integrated.`,
          inputsProcessed: 3,
          mode: isEvaluative ? "evaluative" : "integrative",
        };
      }

      case "experiment": {
        const isConfirmatory = prompt.toLowerCase().includes("confirmatory");
        return {
          ...baseMetadata,
          stepType: "experiment",
          results: {
            metric: 0.85,
            passed: true,
            sampleSize: 100,
          },
          observations: [
            `Observation 1 for ${stepInfo.stepId}`,
            `Observation 2 for ${stepInfo.stepId}`,
          ],
          hypothesesTested: [`H1`],
          mode: isConfirmatory ? "confirmatory" : "exploratory",
        };
      }

      case "develop":
        return {
          ...baseMetadata,
          stepType: "develop",
          deliverables: [
            `deliverable-1-${stepInfo.stepId}`,
            `deliverable-2-${stepInfo.stepId}`,
          ],
          artifactsProduced: 2,
        };
    }
  }

  /**
   * Split text into chunks for simulated streaming.
   */
  private chunkText(text: string, chunkSize: number): string[] {
    const chunks: string[] = [];
    for (let i = 0; i < text.length; i += chunkSize) {
      chunks.push(text.slice(i, i + chunkSize));
    }
    return chunks;
  }

  /**
   * Delay helper for simulating processing time.
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }
}

// =============================================================================
// MOCK AGENT REGISTRY
// =============================================================================

/**
 * Creates a registry of mock agents matching the AVAILABLE_AGENTS in constants.ts.
 *
 * This allows the compiler to resolve executor refs to mock agents for testing.
 *
 * @example
 * ```typescript
 * const registry = createMockAgentRegistry();
 * const agent = registry.get("literature-searcher");
 * ```
 */
export function createMockAgentRegistry(
  config: { simulatedDelayMs?: number } = {},
): Map<string, MockAgent> {
  const registry = new Map<string, MockAgent>();

  // Create mock agents for all available agent refs
  const agentRefs = [
    "literature-searcher",
    "paper-summarizer",
    "concept-explainer",
    "result-synthesizer",
    "hypothesis-generator",
    "progress-evaluator",
    "experiment-designer",
    "experiment-runner",
    "code-explorer",
    "code-writer",
    "code-reviewer",
    "documentation-writer",
  ];

  for (const ref of agentRefs) {
    registry.set(
      ref,
      new MockAgent({
        id: ref,
        name: `Mock ${ref}`,
        simulatedDelayMs: config.simulatedDelayMs ?? 100,
      }),
    );
  }

  return registry;
}
