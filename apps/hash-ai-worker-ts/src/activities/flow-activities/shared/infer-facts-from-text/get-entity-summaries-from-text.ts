import type { VersionedUrl } from "@blockprotocol/type-system";
import { generateUuid } from "@local/hash-isomorphic-utils/generate-uuid";
import dedent from "dedent";

import type { DereferencedEntityType } from "../../../shared/dereference-entity-type";
import { getFlowContext } from "../../../shared/get-flow-context";
import { getLlmResponse } from "../../../shared/get-llm-response";
import { getToolCallsFromLlmAssistantMessage } from "../../../shared/get-llm-response/llm-message";
import type { LlmToolDefinition } from "../../../shared/get-llm-response/types";
import { graphApiClient } from "../../../shared/graph-api-client";

export type LocalEntitySummary = {
  localId: string;
  name: string;
  summary: string;
  entityTypeId: VersionedUrl;
};

const toolNames = ["registerEntitySummaries"] as const;

type ToolName = (typeof toolNames)[number];

const generateToolDefinitions = (params: {
  dereferencedEntityType: DereferencedEntityType;
}): Record<ToolName, LlmToolDefinition<ToolName>> => ({
  registerEntitySummaries: {
    name: "registerEntitySummaries",
    description: `Register the relevant entity summaries for all entities which are of type "${params.dereferencedEntityType.title}".`,
    inputSchema: {
      type: "object",
      properties: {
        entitySummaries: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: {
                type: "string",
                description: "The name of the entity.",
              },
              summary: {
                type: "string",
                description: "The summary of the entity.",
              },
            },
            required: ["name", "summary"],
          },
        },
      },
      required: ["entitySummaries"],
    },
  },
});

const generateSystemPrompt = (params: {
  includesRelevantEntitiesPrompt?: boolean;
  dereferencedEntityType: DereferencedEntityType;
}) =>
  dedent(`
  You are an entity summary extraction agent.

  The user will provide you with:
    - "text": the text from which you should extract entity summaries.
    - "entityType": the definition of the "${
      params.dereferencedEntityType.title
    }" type, which must be the type of the entities that are extracted from the text
    ${
      params.includesRelevantEntitiesPrompt
        ? `- "relevantEntitiesPrompt": a prompt provided by the user indicating which entities should be included.`
        : ""
    }

  You must extract all the entities from the text which are of the "${
    params.dereferencedEntityType.title
  }" type${
    params.includesRelevantEntitiesPrompt
      ? " and are relevant given the provided prompt"
      : ""
  }.

  Do not under any circumstances provide entity summaries for entities which are not of the "${
    params.dereferencedEntityType.title
  }" type.
  
  For each ${
    params.includesRelevantEntitiesPrompt ? "relevant " : ""
  }entity, provide:
    - "name": the name of the entity, which can be used to identify the entity in the text.
    - "summary": a one sentence description of the entity. This must be entirely based on
      the provided text, and not any other knowledge you may have.
`);

export const getEntitySummariesFromText = async (params: {
  text: string;
  dereferencedEntityType: DereferencedEntityType;
  relevantEntitiesPrompt?: string;
}): Promise<{
  entitySummaries: LocalEntitySummary[];
}> => {
  const { text, dereferencedEntityType, relevantEntitiesPrompt } = params;

  const { userAuthentication, flowEntityId, stepId, webId } =
    await getFlowContext();

  const toolDefinitions = generateToolDefinitions({
    dereferencedEntityType,
  });

  const llmResponse = await getLlmResponse(
    {
      model: "claude-3-haiku-20240307",
      toolChoice: toolNames[0],
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: dedent(`
                text: ${text}
                entityType: ${JSON.stringify(dereferencedEntityType)}
                ${
                  relevantEntitiesPrompt
                    ? `Relevant entities prompt: ${relevantEntitiesPrompt}`
                    : ""
                }
              `),
            },
          ],
        },
      ],
      systemPrompt: generateSystemPrompt({
        includesRelevantEntitiesPrompt: !!relevantEntitiesPrompt,
        dereferencedEntityType,
      }),
      tools: Object.values(toolDefinitions),
    },
    {
      customMetadata: {
        stepId,
        taskName: "summaries-from-text",
      },
      userAccountId: userAuthentication.actorId,
      graphApiClient,
      incurredInEntities: [{ entityId: flowEntityId }],
      webId,
    },
  );

  if (llmResponse.status !== "ok") {
    throw new Error(`Failed to get LLM response: ${llmResponse.status}`);
  }

  const toolCalls = getToolCallsFromLlmAssistantMessage({
    message: llmResponse.message,
  });

  const entitySummaries: LocalEntitySummary[] = [];

  for (const toolCall of toolCalls) {
    const { entitySummaries: toolCallEntitySummaries } = toolCall.input as {
      entitySummaries: { name: string; summary: string }[];
    };

    for (const { name, summary } of toolCallEntitySummaries) {
      const localId = generateUuid();

      entitySummaries.push({
        localId,
        name,
        summary,
        entityTypeId: dereferencedEntityType.$id,
      });
    }
  }

  return { entitySummaries };
};
