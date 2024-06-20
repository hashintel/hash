import dedent from "dedent";

import { logger } from "../../../../shared/activity-logger";
import { getFlowContext } from "../../../../shared/get-flow-context";
import { getLlmResponse } from "../../../../shared/get-llm-response";
import {
  getToolCallsFromLlmAssistantMessage,
  type LlmUserMessage,
} from "../../../../shared/get-llm-response/llm-message";
import type { LlmToolDefinition } from "../../../../shared/get-llm-response/types";
import { graphApiClient } from "../../../../shared/graph-api-client";
import type { MetricResultsForModel } from "./types";

const systemPrompt = dedent(`
  You are an LLM prompt optimization agent.

  The user will provide you with:
    - Previously system prompt: the previously used system prompt.
    - Metric definitions: a list of metric definitions, where each definition includes:
        - name: the name of the metric.
        - description: a description of what the metric is measuring, and how it's score is calculated.
    - Results: the results obtained when running all the metrics with various LLM models, which includes:
        - model: the name of the LLM model.
        - metric: the name of the metric.
        - score: The score achieved, expressed as number between 0 and 1 (where 0 is a complete failure, and 1 is perfect).
        - report: A report explaining the results.
        - error: Any encountered error.

  Carefully examine all the metric results.
  Your task is to propose a new system prompt that will improve the performance of the LLM model across all metrics.
  Be creative, you can propose a completely new prompt or a slight modification of the previous prompt.
`);

const proposeSystemPromptToolDefinition: LlmToolDefinition<"proposeSystemPrompt"> =
  {
    name: "proposeSystemPrompt",
    description:
      "Propose an improved system prompt based on the previous system prompt and metric results.",
    inputSchema: {
      type: "object",
      properties: {
        improvedSystemPrompt: {
          type: "string",
          description:
            "The improved system prompt that is expected to improve the LLM performance.",
        },
        reasoning: {
          type: "string",
          description:
            "A detailed explanation of why the proposed system prompt is expected to improve the LLM performance.",
        },
      },
      required: ["improvedSystemPrompt"],
    },
  };

export const improveSystemPrompt = async (params: {
  previousSystemPrompt: string;
  results: MetricResultsForModel[];
}): Promise<{
  updatedSystemPrompt: string;
}> => {
  const { previousSystemPrompt, results } = params;

  const metricDefinitions = results
    .map((result) =>
      result.metricResults.map((metricResult) => metricResult.metric),
    )
    .flat()
    .filter(
      (metric, index, all) =>
        all.findIndex(({ name }) => metric.name === name) === index,
    );

  const userMessage: LlmUserMessage = {
    role: "user",
    content: [
      {
        type: "text",
        text: dedent(`
          Previously used system prompt: "${previousSystemPrompt}".
          Metric definitions: ${JSON.stringify(
            metricDefinitions.map(({ name, description }) => ({
              name,
              description,
            })),
          )}
          Results: ${JSON.stringify(
            params.results.map(({ model, metricResults }) =>
              metricResults.map(({ metric, result }) => ({
                model,
                metric: metric.name,
                score: result.score,
                report: result.naturalLanguageReport,
                error: result.encounteredError,
              })),
            ),
          )}
        `),
      },
    ],
  };

  const { userAuthentication, webId } = await getFlowContext();

  const response = await getLlmResponse(
    {
      model: "claude-3-opus-20240229",
      messages: [userMessage],
      toolChoice: proposeSystemPromptToolDefinition.name,
      tools: [proposeSystemPromptToolDefinition],
      systemPrompt,
      temperature: 1,
    },
    {
      userAccountId: userAuthentication.actorId,
      graphApiClient,
      incurredInEntities: [],
      webId,
    },
  );

  if (response.status !== "ok") {
    throw new Error(
      `Failed to get response from LLM: ${JSON.stringify(response)}`,
    );
  }

  const toolCalls = getToolCallsFromLlmAssistantMessage({
    message: response.message,
  });

  const [proposeSystemPromptToolCall] = toolCalls;

  if (!proposeSystemPromptToolCall) {
    throw new Error(
      `Expected a tool call for the proposeSystemPrompt tool, but got none.`,
    );
  }

  const { improvedSystemPrompt, reasoning } =
    proposeSystemPromptToolCall.input as {
      improvedSystemPrompt: string;
      reasoning: string;
    };

  logger.debug(`Proposed system prompt: ${improvedSystemPrompt}`);
  logger.debug(`Reasoning: ${reasoning}`);

  return { updatedSystemPrompt: improvedSystemPrompt };
};
