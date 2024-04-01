import { isInferenceModelName } from "@local/hash-isomorphic-utils/ai-inference-types";
import { getSimplifiedActionInputs } from "@local/hash-isomorphic-utils/flows/step-definitions";
import { StatusCode } from "@local/status";
import dedent from "dedent";
import type OpenAI from "openai";

import { modelAliasToSpecificModel } from "../infer-entities";
import { getOpenAiResponse } from "../infer-entities/shared/get-open-ai-response";
import type { FlowActionActivity } from "./types";

const generateWebQueriesSystemMessage: OpenAI.ChatCompletionSystemMessageParam =
  {
    role: "system",
    content: dedent(`
    You are a Web Search Assistant.
    The user provides you with a text prompt, from which you create one or more queries
      for a web search engine (such as Google, Bing, Duck Duck Go, etc) which lead
      to search results that can satisfy the prompt.
   `),
  };

const tools: OpenAI.ChatCompletionTool[] = [
  {
    function: {
      name: "propose_query",
      description: "Propose a web search query",
      parameters: {
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
    type: "function",
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

  const openApiPayload: OpenAI.ChatCompletionCreateParams = {
    messages: [
      generateWebQueriesSystemMessage,
      {
        role: "user",
        content: prompt,
      },
    ],
    model: modelAliasToSpecificModel[model],
    tools,
  };

  const openAiResponse = await getOpenAiResponse(openApiPayload);

  if (openAiResponse.code !== StatusCode.Ok) {
    return {
      ...openAiResponse,
      contents: [],
    };
  }

  const { response, usage: _usage } = openAiResponse.contents[0]!;

  /** @todo: capture usage */

  const toolCalls = response.message.tool_calls;

  if (!toolCalls) {
    /** @todo: retry if there are no tool calls with retry message */

    return {
      code: StatusCode.Internal,
      message: "No tool calls found in Open AI response",
      contents: [],
    };
  }

  const queries: string[] = [];

  for (const toolCall of toolCalls) {
    const functionCall = toolCall.function;

    const { arguments: modelProvidedArguments, name: functionName } =
      functionCall;

    if (functionName === "propose_query") {
      const { query } = JSON.parse(
        modelProvidedArguments,
      ) as ProposeQueryFunctionCallArguments;

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
