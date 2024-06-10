import type { EntityId } from "@local/hash-graph-types/entity";
import dedent from "dedent";

import { getFlowContext } from "../../shared/get-flow-context";
import { getLlmResponse } from "../../shared/get-llm-response";
import type { AnthropicMessageModel } from "../../shared/get-llm-response/anthropic-client";
import { getToolCallsFromLlmAssistantMessage } from "../../shared/get-llm-response/llm-message";
import type {
  LlmParams,
  LlmToolDefinition,
  LlmUsage,
} from "../../shared/get-llm-response/types";
import { graphApiClient } from "../../shared/graph-api-client";
import type { PermittedOpenAiModel } from "../../shared/openai-client";
import type { LocalEntitySummary } from "../shared/infer-facts-from-text/get-entity-summaries-from-text";
import type { ExistingEntitySummary } from "./summarize-existing-entities";

/**
 * @todo
 * 1. identify where child and parent types are present, and advise the model to choose the more specific type
 * 2. merge summaries? any value to this – maybe so they are better described for other tools?
 * 3. consider if any surrounding context would be useful – e.g. anything to do with the research task?
 */
export const deduplicationAgentSystemPrompt = `
  You are a deduplication agent. Your task is to identify duplicate entities in a list of entities.

  Use your best judgement to determine which entities are duplicates, based on:
  1. The name of the entities
  2. Their types
  3. Their summaries

  Bear in mind that:
  1. the same entity may be described in different ways, or be named in slightly different ways
  2. the same entity may have different types, where the different types could conceivably apply to the same entity
  3. the same or very similar name may refer to different entities
  4. the same or very similar summary may refer to different entities

  If an entity is a different version of another entity (e.g. a different version of a piece of software, a newer model of a car, or the Toastmaker 3000 versus the Toastmaker 2000), do not report it as a duplicate as they are not referring to the same thing.
  
  If in doubt, do not merge entities. If you are confident that two entities are referring to the exact same thing, report them as duplicates.

  Once you have identified duplicates, you must pick a single canonical entity to assign its duplicate(s) too.
  Choose the one with the best summary.

  If there are no duplicates, return an empty list for the 'duplicates' property.

  Here are the entities you need to consider:
`;

export type DuplicateReport = {
  canonicalId: string | EntityId;
  duplicateIds: (string | EntityId)[];
};

const toolName = "reportDuplicates";

const deduplicationAgentTool: LlmToolDefinition<typeof toolName> = {
  name: toolName,
  description: dedent(`
    Provide a list of duplicate entities and their canonical entity to merge them with
    If there are no duplicates, return an empty list for the 'duplicates' property.
  `),
  inputSchema: {
    type: "object",
    properties: {
      duplicates: {
        type: "array",
        items: {
          type: "object",
          properties: {
            canonicalId: {
              type: "string",
              description: "The IDs of the canonical entity",
            },
            duplicateIds: {
              type: "array",
              description:
                "The IDs of entities that are duplicates of the canonical entity",
              items: {
                type: "string",
              },
            },
          } satisfies Record<keyof DuplicateReport, unknown>,
          required: ["canonicalId", "duplicateIds"],
        },
      },
    },
    required: ["duplicates"],
  },
};

const defaultModel: LlmParams["model"] = "claude-3-opus-20240229";

export const deduplicateEntities = async (params: {
  entities: (LocalEntitySummary | ExistingEntitySummary)[];
  model?: PermittedOpenAiModel | AnthropicMessageModel;
}): Promise<
  { duplicates: DuplicateReport[] } & {
    usage: LlmUsage;
    totalRequestTime: number;
  }
> => {
  const { entities, model } = params;

  const { flowEntityId, userAuthentication, webId } = await getFlowContext();

  const llmResponse = await getLlmResponse(
    {
      systemPrompt: deduplicationAgentSystemPrompt,
      tools: [deduplicationAgentTool],
      toolChoice: toolName,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: dedent(
                entities
                  .map(
                    (entitySummary) => `
                    Name: ${entitySummary.name}
                    Type: ${entitySummary.entityTypeId}
                    Summary: ${entitySummary.summary}
                    ID: ${"localId" in entitySummary ? entitySummary.localId : entitySummary.entityId}
                    `,
                  )
                  .join("\n"),
              ),
            },
          ],
        },
      ],
      model: model ?? defaultModel,
    },
    {
      userAccountId: userAuthentication.actorId,
      graphApiClient,
      incurredInEntities: [{ entityId: flowEntityId }],
      webId,
    },
  );

  if (llmResponse.status !== "ok") {
    throw new Error(
      `Failed to get LLM response: ${JSON.stringify(llmResponse)}`,
    );
  }

  const { message, usage, totalRequestTime } = llmResponse;

  const toolCalls = getToolCallsFromLlmAssistantMessage({ message });

  const firstToolCall = toolCalls[0];

  if (!firstToolCall) {
    throw new Error(
      `Expected tool calls in message: ${JSON.stringify(message, null, 2)}`,
    );
  }

  if (toolCalls.length > 1) {
    throw new Error(
      `Expected only one tool call in message: ${JSON.stringify(message, null, 2)}`,
    );
  }

  const { duplicates } = firstToolCall.input as {
    duplicates: DuplicateReport[];
  };

  return { duplicates, totalRequestTime, usage };
};
