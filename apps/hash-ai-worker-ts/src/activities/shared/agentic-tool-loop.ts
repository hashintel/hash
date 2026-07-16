import { getLlmResponse } from "./get-llm-response.js";
import { getToolCallsFromLlmAssistantMessage } from "./get-llm-response/llm-message.js";

import type { UsageTrackingParams } from "./get-llm-response.js";
import type {
  LlmMessage,
  LlmMessageToolUseContent,
} from "./get-llm-response/llm-message.js";
import type { LlmParams, LlmToolDefinition } from "./get-llm-response/types.js";

/**
 * The outcome of handling a single tool call in an agentic loop: either a
 * tool result string to feed back to the model, or a final result which ends
 * the loop (any tool calls remaining in the same model turn are skipped).
 */
export type AgenticToolCallOutcome<Result> =
  | { kind: "tool-result"; content: string }
  | { kind: "complete"; result: Result };

/**
 * Run a tool-use loop against an LLM until a tool call handler produces a
 * final result: call the model, dispatch each tool call to `handleToolCall`,
 * feed the tool results back, and repeat.
 *
 * Each iteration is one model turn, which may include several parallel tool
 * calls. Every tool_use block receives a matching tool_result in the next
 * user message (as required by the Anthropic API); if the model responds
 * without calling any tool, `noToolCallNudge` is sent instead.
 *
 * When `maximumIterations` model turns pass without completion,
 * `onIterationLimit` decides the outcome (return a fallback result or
 * throw); by default the loop throws.
 */
export const runAgenticToolLoop = async <
  ToolName extends string,
  Result,
>(params: {
  model: LlmParams["model"];
  systemPrompt: string;
  tools: LlmToolDefinition<ToolName>[];
  initialMessages: LlmMessage[];
  maximumIterations: number;
  /** Sent as a user message when the model responds without any tool call. */
  noToolCallNudge: string;
  handleToolCall: (
    toolCall: LlmMessageToolUseContent<ToolName>,
  ) => Promise<AgenticToolCallOutcome<Result>>;
  onIterationLimit?: () => Result;
  usageTrackingParams: UsageTrackingParams;
}): Promise<Result> => {
  const {
    model,
    systemPrompt,
    tools,
    initialMessages,
    maximumIterations,
    noToolCallNudge,
    handleToolCall,
    onIterationLimit,
    usageTrackingParams,
  } = params;

  let messages: LlmMessage[] = [...initialMessages];

  for (let iteration = 1; iteration <= maximumIterations; iteration++) {
    const llmResponse = await getLlmResponse(
      {
        model,
        systemPrompt,
        messages,
        tools,
      },
      usageTrackingParams,
    );

    if (llmResponse.status !== "ok") {
      throw new Error(`LLM error: ${llmResponse.status}`);
    }

    const { message } = llmResponse;
    const toolCalls = getToolCallsFromLlmAssistantMessage({ message });

    const toolResults: { tool_use_id: string; content: string }[] = [];

    for (const toolCall of toolCalls) {
      const outcome = await handleToolCall(toolCall);
      if (outcome.kind === "complete") {
        return outcome.result;
      }
      toolResults.push({ tool_use_id: toolCall.id, content: outcome.content });
    }

    messages = [
      ...messages,
      message,
      toolResults.length > 0
        ? {
            role: "user",
            content: toolResults.map(({ tool_use_id, content }) => ({
              type: "tool_result" as const,
              tool_use_id,
              content,
            })),
          }
        : {
            role: "user",
            content: [{ type: "text", text: noToolCallNudge }],
          },
    ];
  }

  if (onIterationLimit) {
    return onIterationLimit();
  }
  throw new Error(`Exceeded maximum iterations (${maximumIterations})`);
};
