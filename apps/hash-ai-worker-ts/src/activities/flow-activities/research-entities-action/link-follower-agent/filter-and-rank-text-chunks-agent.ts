import dedent from "dedent";

import { getFlowContext } from "../../../shared/get-flow-context.js";
import { getLlmResponse } from "../../../shared/get-llm-response.js";
import type {
  LlmMessage,
  LlmUserMessage,
} from "../../../shared/get-llm-response/llm-message.js";
import { getToolCallsFromLlmAssistantMessage } from "../../../shared/get-llm-response/llm-message.js";
import type {
  LlmErrorResponse,
  LlmToolDefinition,
} from "../../../shared/get-llm-response/types.js";
import { graphApiClient } from "../../../shared/graph-api-client.js";

const systemPrompt = dedent(`
  You are an assistant tasked with determining which sections of a PDF file
  contain relevant content.
  
  The user will provide you with:
    - a description of the text content they are looking for
    - an example of the kind of content they are looking for
    - a list of chunks from the PDF file
    
  You must determine which snippets contain the relevant information that
    the user is looking for, and rank the chunks by their relevance.

  If a chunk contains some but not all of the information the user is looking for,
    you must still include it in the list of relevant snippets.

  You must make exactly one tool call.
  Do not make multiple tool calls.
  You must either make a single "submitRelevantOrderedTextChunks" tool call, or a single "terminate" tool call.

  Always start the answer with your thoughts first thinking through the request
    before selecting chunks.
`);

const tools: LlmToolDefinition<
  "submitRelevantOrderedTextChunks" | "terminate"
>[] = [
  {
    name: "submitRelevantOrderedTextChunks",
    description:
      "Submit all the text chunks that contain information the user is looking for, in a single tool call.",
    inputSchema: {
      type: "object",
      properties: {
        relevantTextChunks: {
          type: "array",
          items: {
            type: "object",
            properties: {
              explanation: {
                type: "string",
                description: dedent(`
                  An explanation of why this text chunk does not contain any of the
                    information that the user is looking for.
                `),
              },
              chunkId: {
                type: "string",
                description: "The ID of the text chunk.",
              },
              relevance: {
                type: "number",
                description: "The relevance score.",
              },
            },
            required: ["chunkId", "relevance", "explanation"],
          },
        },
      },
      required: ["relevantTextChunks"],
    },
  },
  {
    name: "terminate",
    description:
      "If none of the text chunks match the description of what hte user is looking for, terminate the process.",
    inputSchema: {
      type: "object",
      properties: {
        reasons: {
          type: "array",
          items: {
            type: "object",
            properties: {
              chunkId: {
                type: "string",
                description: "The ID of the text chunk.",
              },
              reason: {
                type: "string",
                description: "The reason why this text chunk was not relevant.",
              },
            },
          },
        },
      },
      required: ["reasons"],
    },
  },
];

const maxRetryCount = 3;

export const filterAndRankTextChunksAgent = async (params: {
  description: string;
  exampleText: string;
  textChunks: string[];
  retryCount?: number;
  retryMessages?: LlmMessage[];
}): Promise<
  | {
      status: "ok";
      orderedRelevantTextChunks: string[];
    }
  | {
      status: "terminate";
      reason: string;
    }
  | {
      status: "exceeded-maximum-retries";
    }
  | LlmErrorResponse
> => {
  const { description, exampleText, textChunks, retryMessages, retryCount } =
    params;

  const textChunksWithIds = textChunks.map((text, index) => ({
    chunkId: index.toString(),
    text,
  }));

  const userMessage = dedent(`
    Description: ${description}
    Example text: ${exampleText}
    Text Chunks:
    ${JSON.stringify(textChunksWithIds)}
  `);

  const { flowEntityId, userAuthentication, stepId, webId } =
    await getFlowContext();

  const llmResponse = await getLlmResponse(
    {
      model: "claude-3-5-sonnet-20240620",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: userMessage,
            },
          ],
        },
        ...(retryMessages ?? []),
      ],
      systemPrompt,
      tools,
      temperature: 0,
    },
    {
      customMetadata: {
        stepId,
        taskName: "filter-chunks",
      },
      userAccountId: userAuthentication.actorId,
      graphApiClient,
      incurredInEntities: [{ entityId: flowEntityId }],
      webId,
    },
  );

  if (llmResponse.status !== "ok") {
    return llmResponse;
  }

  const { message } = llmResponse;

  const retry = (retryParams: {
    retryMessageContent: LlmUserMessage["content"];
  }) => {
    if (retryCount && retryCount > maxRetryCount) {
      return {
        status: "exceeded-maximum-retries" as const,
      };
    }

    return filterAndRankTextChunksAgent({
      ...params,
      retryCount: (retryCount ?? 0) + 1,
      retryMessages: [
        message,
        {
          role: "user",
          content: retryParams.retryMessageContent,
        },
      ],
    });
  };

  const toolCalls = getToolCallsFromLlmAssistantMessage({ message });

  const [toolCall] = toolCalls;

  if (!toolCall) {
    return await retry({
      retryMessageContent: [
        { type: "text", text: "You haven't made a tool call." },
      ],
    });
  }

  /** @todo: consider handling multiple "submitRelevantOrderedTextChunks" tool calls */

  if (toolCall.name === "submitRelevantOrderedTextChunks") {
    const { relevantTextChunks } = toolCall.input as {
      relevantTextChunks: {
        explanation: string;
        chunkId: string;
        relevance: number;
      }[];
    };

    const invalidChunkIds = relevantTextChunks
      .map(({ chunkId }) => chunkId)
      .filter(
        (chunkId) =>
          !textChunksWithIds.some((chunk) => chunk.chunkId === chunkId),
      );

    if (invalidChunkIds.length > 0) {
      return await retry({
        retryMessageContent: [
          {
            type: "tool_result",
            tool_use_id: toolCall.id,
            is_error: true,
            content: dedent(`
              You provided invalid chunk IDs: ${invalidChunkIds.join(", ")}
              Retry the "submitRelevantOrderedTextChunks" tool call with valid chunk IDs.
            `),
          },
        ],
      });
    }

    const orderedRelevantTextChunks = relevantTextChunks
      .sort((a, b) => b.relevance - a.relevance)
      .map(
        ({ chunkId: relevantChunkId }) =>
          textChunksWithIds.find(({ chunkId }) => chunkId === relevantChunkId)!
            .text,
      );

    return {
      status: "ok",
      orderedRelevantTextChunks,
    };
  }

  return {
    status: "terminate",
    reason: "No relevant text chunks were found.",
  };
};
