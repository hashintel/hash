import type { VersionedUrl } from "@blockprotocol/type-system";
import { generateUuid } from "@local/hash-isomorphic-utils/generate-uuid";
import dedent from "dedent";

import type { DereferencedEntityType } from "../../../shared/dereference-entity-type";
import { getFlowContext } from "../../../shared/get-flow-context";
import { getLlmResponse } from "../../../shared/get-llm-response";
import { getToolCallsFromLlmAssistantMessage } from "../../../shared/get-llm-response/llm-message";
import type { LlmToolDefinition } from "../../../shared/get-llm-response/types";
import { graphApiClient } from "../../../shared/graph-api-client";

export type EntitySummary = {
  localId: string;
  name: string;
  summary: string;
  entityTypeId: VersionedUrl;
};

const toolNames = ["registerEntitySummary"] as const;

type ToolName = (typeof toolNames)[number];

const toolDefinitions: Record<ToolName, LlmToolDefinition<ToolName>> = {
  registerEntitySummary: {
    name: "registerEntitySummary",
    description: "Register an entity summary.",
    inputSchema: {
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
};

const generateSystemPrompt = (params: {
  includesRelevantEntitiesPrompt?: boolean;
}) =>
  dedent(`
  You are an entity summary extraction agent.

  The user will provide you with:
    - "text": the text from which you should extract entity summaries.
    - "entityType": the type of the entities that need to be extracted from the text
    ${params.includesRelevantEntitiesPrompt ? `- "relevantEntitiesPrompt": a prompt provided by the user indicating which entities should be included.` : ""}

  You must extract all the entities from the text which are of the provided type${params.includesRelevantEntitiesPrompt ? " and are relevant given the provided prompt" : ""}.
  
  For each ${params.includesRelevantEntitiesPrompt ? "relevant " : ""}entity, provide:
    - "name": the name of the entity, which can be used to identify the entity in the text.
    - "summary": a one sentence description of the entity. This must be entirely based on
      the provided text, and not any other knowledge you may have.
`);

export const getEntitySummariesFromText = async (params: {
  text: string;
  dereferencedEntityType: DereferencedEntityType;
  relevantEntitiesPrompt?: string;
}): Promise<{
  entitySummaries: EntitySummary[];
}> => {
  const { text, dereferencedEntityType, relevantEntitiesPrompt } = params;

  const { userAuthentication, flowEntityId, webId } = await getFlowContext();

  const llmResponse = await getLlmResponse(
    {
      model: "claude-3-opus-20240229",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: dedent(`
                text: ${text}
                entityType: ${JSON.stringify(dereferencedEntityType)}
                ${relevantEntitiesPrompt ? `Relevant entities prompt: ${relevantEntitiesPrompt}` : ""}
              `),
            },
          ],
        },
      ],
      systemPrompt: generateSystemPrompt({
        includesRelevantEntitiesPrompt: !!relevantEntitiesPrompt,
      }),
      tools: Object.values(toolDefinitions),
    },
    {
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

  const entitySummaries: EntitySummary[] = [];

  for (const toolCall of toolCalls) {
    const { name, summary } = toolCall.input as {
      name: string;
      summary: string;
    };

    const localId = generateUuid();

    entitySummaries.push({
      localId,
      name,
      summary,
      entityTypeId: dereferencedEntityType.$id,
    });
  }

  return { entitySummaries };
};
