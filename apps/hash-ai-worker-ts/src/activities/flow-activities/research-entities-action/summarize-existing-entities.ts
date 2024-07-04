import type { VersionedUrl } from "@blockprotocol/type-system";
import type { Entity } from "@local/hash-graph-sdk/entity";
import type { EntityId } from "@local/hash-graph-types/entity";
import dedent from "dedent";

import { getFlowContext } from "../../shared/get-flow-context.js";
import { getLlmResponse } from "../../shared/get-llm-response.js";
import { getToolCallsFromLlmAssistantMessage } from "../../shared/get-llm-response/llm-message.js";
import type { LlmToolDefinition } from "../../shared/get-llm-response/types.js";
import { graphApiClient } from "../../shared/graph-api-client.js";
import { simplifyEntity } from "../../shared/simplify-entity.js";

export type ExistingEntitySummary = {
  entityId: EntityId;
  entityTypeId: VersionedUrl;
  name: string;
  summary: string;
};

const systemPrompt = dedent(`
  You are an entity summary agent.

  The user will provide you with:
    - "entities": a list of entities, for each of which you need to provide a "name" and a "summary".

  You must provide a summary for every entity in the list provided by the user.
`);

const toolName = "submitEntitySummaries";

const registerEntitySummariesToolDefinition: LlmToolDefinition<
  typeof toolName
> = {
  name: toolName,
  description: "Register entity summaries",
  inputSchema: {
    type: "object",
    properties: {
      entitySummaries: {
        type: "array",
        items: {
          type: "object",
          properties: {
            entityId: {
              type: "string",
              description: `The ID of the entity for which the "name" and "summary" is being provided.`,
            },
            name: {
              type: "string",
              description: dedent(`
                The "name" should be as unique as possible based on the properties of the entity.
                For example for an entity of type "Person" with first name "John", middle name "Doe", and last name "Smith", the "name" could be "John Doe Smith".
            `),
            },
            summary: {
              type: "string",
              description: dedent(`
                The "summary" should be a brief description based on the properties of the entity.
              `),
            },
          },
          required: ["entityId", "name", "summary"],
        },
        description: "A list of all the entity summaries.",
      },
    },
    required: ["entitySummaries"],
  },
};

export const summarizeExistingEntities = async (params: {
  existingEntities: Entity[];
}): Promise<{ existingEntitySummaries: ExistingEntitySummary[] }> => {
  const { existingEntities } = params;

  const { flowEntityId, userAuthentication, stepId, webId } =
    await getFlowContext();

  const llmResponse = await getLlmResponse(
    {
      systemPrompt,
      tools: [registerEntitySummariesToolDefinition],
      toolChoice: toolName,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Entities: ${JSON.stringify(
                existingEntities.map(simplifyEntity),
              )}`,
            },
          ],
        },
      ],
      model: "gpt-4o-2024-05-13",
    },
    {
      customMetadata: {
        stepId,
        taskName: "summarize-entities",
      },
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

  const { message } = llmResponse;

  const toolCalls = getToolCallsFromLlmAssistantMessage({ message });

  const validEntitySummaries: ExistingEntitySummary[] = [];

  for (const toolCall of toolCalls) {
    const { entitySummaries: proposedEntitySummaries } = toolCall.input as {
      entitySummaries: { entityId: string; name: string; summary: string }[];
    };

    for (const proposedEntitySummary of proposedEntitySummaries) {
      const { entityId, name, summary } = proposedEntitySummary;
      const existingEntity = existingEntities.find(
        (entity) => entity.metadata.recordId.entityId === entityId,
      );

      if (!existingEntity) {
        /** @todo: add retry logic */
        throw new Error(
          `Entity with entityId ${entityId} not found in the existing entities.`,
        );
      }

      validEntitySummaries.push({
        entityId: existingEntity.metadata.recordId.entityId,
        entityTypeId: existingEntity.metadata.entityTypeId,
        name,
        summary,
      });
    }
  }

  return { existingEntitySummaries: validEntitySummaries };
};
