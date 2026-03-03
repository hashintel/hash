import type { EntityId } from "@blockprotocol/type-system";
import { sleep } from "@local/hash-isomorphic-utils/sleep";
import dedent from "dedent";

import { logger } from "../../../shared/activity-logger.js";
import { getFlowContext } from "../../../shared/get-flow-context.js";
import { getLlmResponse } from "../../../shared/get-llm-response.js";
import type { PermittedAnthropicModel } from "../../../shared/get-llm-response/anthropic-client.js";
import { getToolCallsFromLlmAssistantMessage } from "../../../shared/get-llm-response/llm-message.js";
import type {
  LlmParams,
  LlmToolDefinition,
  LlmUsage,
} from "../../../shared/get-llm-response/types.js";
import { graphApiClient } from "../../../shared/graph-api-client.js";
import type { PermittedOpenAiModel } from "../../../shared/openai-client.js";
import type { LocalEntitySummary } from "../../shared/infer-summaries-then-claims-from-text/get-entity-summaries-from-text.js";
import type { ExistingEntitySummary } from "../coordinating-agent/summarize-existing-entities.js";

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
  canonicalId: EntityId;
  duplicateIds: EntityId[];
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
    additionalProperties: false,
    properties: {
      duplicates: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
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

/**
 * We are using Sonnet here rather than the cheaper (as of 08/08/2025) GPT-4o model because Sonnet has a max context
 * window of 200k tokens vs 128k for GPT-4o, and we've encountered 'max-token' responses here before.
 */
const defaultModel: LlmParams["model"] = "claude-sonnet-4-6";

export const deduplicateEntities = async (params: {
  entities: (LocalEntitySummary | ExistingEntitySummary)[];
  model?: PermittedOpenAiModel | PermittedAnthropicModel;
  exceededMaxTokensAttempt?: number | null;
}): Promise<
  { duplicates: DuplicateReport[] } & {
    usage: LlmUsage;
    totalRequestTime: number;
  }
> => {
  const { entities, model, exceededMaxTokensAttempt } = params;

  const { flowEntityId, userAuthentication, stepId, webId } =
    await getFlowContext();

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
              text: dedent(`Here are the entities to deduplicate:
                ${entities
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map(
                    (entitySummary) => `<Entity>
                    Name: ${entitySummary.name}
                    ${entitySummary.entityTypeIds.length > 1 ? "Types" : "Type"}: ${entitySummary.entityTypeIds.join(", ")}
                    Summary: ${entitySummary.summary}
                    ID: ${
                      "localId" in entitySummary
                        ? entitySummary.localId
                        : entitySummary.entityId
                    }
                    </Entity>`,
                  )
                  .join("\n")}
                  ${
                    exceededMaxTokensAttempt
                      ? "Your previous response exceeded the maximum tokens. Please try again, aiming for brevity, and omitting any duplicate reports you aren't 100% certain of."
                      : ""
                  }
                  `),
            },
          ],
        },
      ],
      model: model ?? defaultModel,
    },
    {
      customMetadata: {
        stepId,
        taskName: "deduplicate-entities",
      },
      userAccountId: userAuthentication.actorId,
      graphApiClient,
      incurredInEntities: [{ entityId: flowEntityId }],
      webId,
    },
  );

  if (llmResponse.status !== "ok") {
    if (llmResponse.status === "aborted") {
      return {
        duplicates: [],
        totalRequestTime: 0,
        usage: {
          totalTokens: 0,
          inputTokens: 0,
          outputTokens: 0,
        },
      };
    }

    if (llmResponse.status === "max-tokens") {
      logger.warn("Max tokens exceeded in deduplicateEntities");
      if (exceededMaxTokensAttempt && exceededMaxTokensAttempt > 2) {
        return {
          duplicates: [],
          totalRequestTime: llmResponse.totalRequestTime,
          usage: llmResponse.usage,
        };
      }

      return deduplicateEntities({
        ...params,
        exceededMaxTokensAttempt: (exceededMaxTokensAttempt ?? 0) + 1,
      });
    }

    logger.error(`Error deduplicating entities: ${llmResponse.status}`);

    await sleep(2_000);

    return deduplicateEntities(params);
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
      `Expected only one tool call in message: ${JSON.stringify(
        message,
        null,
        2,
      )}`,
    );
  }

  const { duplicates } = firstToolCall.input as {
    duplicates: DuplicateReport[];
  };

  return { duplicates, totalRequestTime, usage };
};
