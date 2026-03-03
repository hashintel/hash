import type { AiFlowActionActivity } from "@local/hash-backend-utils/flows";
import { isInferenceModelName } from "@local/hash-isomorphic-utils/ai-inference-types";
import { getSimplifiedAiFlowActionInputs } from "@local/hash-isomorphic-utils/flows/action-definitions";
import { StatusCode } from "@local/status";
import dedent from "dedent";

import { getFlowContext } from "../shared/get-flow-context.js";
import { getLlmResponse } from "../shared/get-llm-response.js";
import { getToolCallsFromLlmAssistantMessage } from "../shared/get-llm-response/llm-message.js";
import type { LlmToolDefinition } from "../shared/get-llm-response/types.js";
import { graphApiClient } from "../shared/graph-api-client.js";
import { inferenceModelAliasToSpecificModel } from "../shared/inference-model-alias-to-llm-model.js";

const webQueriesSystemPrompt = dedent(`
    You are a Web Search Assistant.
    The user provides you with a text prompt, from which you create one or more queries
      for a web search engine (such as Google, Bing, Duck Duck Go, etc) which lead
      to search results that can satisfy the prompt.
   `);

const tools: LlmToolDefinition[] = [
  {
    name: "propose_query",
    description: "Propose a web search query",
    inputSchema: {
      additionalProperties: false,
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The web search query",
        },
      },
      required: ["query"],
    },
  },
];

type ProposeQueryFunctionCallArguments = {
  query: string;
};

export const generateWebQueriesAction: AiFlowActionActivity<
  "generateWebQueries"
> = async ({ inputs }) => {
  const { prompt, model } = getSimplifiedAiFlowActionInputs({
    inputs,
    actionType: "generateWebQueries",
  });

  if (!isInferenceModelName(model)) {
    return {
      code: StatusCode.InvalidArgument,
      message: `Invalid inference model name: ${model}`,
      contents: [],
    };
  }

  const { userAuthentication, flowEntityId, stepId, webId } =
    await getFlowContext();

  const llmResponse = await getLlmResponse(
    {
      systemPrompt: webQueriesSystemPrompt,
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: prompt }],
        },
      ],
      model: inferenceModelAliasToSpecificModel[model],
      tools,
    },
    {
      customMetadata: {
        taskName: "generate-web-queries",
        stepId,
      },
      userAccountId: userAuthentication.actorId,
      graphApiClient,
      incurredInEntities: [{ entityId: flowEntityId }],
      webId,
    },
  );

  if (llmResponse.status !== "ok") {
    return {
      code: StatusCode.Internal,
      contents: [],
    };
  }

  const { usage: _usage, message } = llmResponse;

  const toolCalls = getToolCallsFromLlmAssistantMessage({ message });

  /** @todo: capture usage */

  const queries: string[] = [];

  for (const toolCall of toolCalls) {
    if (toolCall.name === "propose_query") {
      const { query } = toolCall.input as ProposeQueryFunctionCallArguments;

      /** @todo: handle invalid JSON object and retry with retry message */

      queries.push(query);
    }
  }

  return {
    code: StatusCode.Ok,
    contents: [
      {
        outputs: [
          {
            outputName: "queries",
            payload: {
              kind: "Text",
              value: queries,
            },
          },
        ],
      },
    ],
  };
};
