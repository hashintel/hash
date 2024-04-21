import { isInferenceModelName } from "@local/hash-isomorphic-utils/ai-inference-types";
import { getSimplifiedActionInputs } from "@local/hash-isomorphic-utils/flows/action-definitions";
import { StatusCode } from "@local/status";
import dedent from "dedent";
import type OpenAI from "openai";

import { getLlmResponse } from "../shared/get-llm-response";
import type { LlmToolDefinition } from "../shared/get-llm-response/types";
import { modelAliasToSpecificModel } from "../shared/openai-client";
import type { FlowActionActivity } from "./types";

const webQueriesSystemMessage: OpenAI.ChatCompletionSystemMessageParam = {
  role: "system",
  content: dedent(`
    You are a Web Search Assistant.
    The user provides you with a text prompt, from which you create one or more queries
      for a web search engine (such as Google, Bing, Duck Duck Go, etc) which lead
      to search results that can satisfy the prompt.
   `),
};

const tools: LlmToolDefinition[] = [
  {
    name: "propose_query",
    description: "Propose a web search query",
    inputSchema: {
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

export const generateWebQueriesAction: FlowActionActivity = async ({
  inputs,
}) => {
  const { prompt, model } = getSimplifiedActionInputs({
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

  const llmResponse = await getLlmResponse({
    messages: [
      webQueriesSystemMessage,
      {
        role: "user",
        content: prompt,
      },
    ],
    model: modelAliasToSpecificModel[model],
    tools,
  });

  if (llmResponse.status !== "ok") {
    return {
      code: StatusCode.Internal,
      contents: [],
    };
  }

  const { usage: _usage, parsedToolCalls } = llmResponse;

  /** @todo: capture usage */

  const queries: string[] = [];

  for (const toolCall of parsedToolCalls) {
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
