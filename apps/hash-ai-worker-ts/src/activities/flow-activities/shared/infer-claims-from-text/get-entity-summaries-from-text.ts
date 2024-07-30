import type { VersionedUrl } from "@blockprotocol/type-system";
import type { EntityId, EntityUuid } from "@local/hash-graph-types/entity";
import { generateUuid } from "@local/hash-isomorphic-utils/generate-uuid";
import { entityIdFromComponents } from "@local/hash-subgraph";
import dedent from "dedent";

import type { DereferencedEntityType } from "../../../shared/dereference-entity-type.js";
import { getFlowContext } from "../../../shared/get-flow-context.js";
import { getLlmResponse } from "../../../shared/get-llm-response.js";
import { getToolCallsFromLlmAssistantMessage } from "../../../shared/get-llm-response/llm-message.js";
import type {
  LlmParams,
  LlmToolDefinition,
} from "../../../shared/get-llm-response/types.js";
import { graphApiClient } from "../../../shared/graph-api-client.js";

export type LocalEntitySummary = {
  localId: EntityId;
  name: string;
  summary: string;
  entityTypeId: VersionedUrl;
};

const toolNames = ["registerEntitySummaries"] as const;

type ToolName = (typeof toolNames)[number];

const generateToolDefinitions = (params: {
  dereferencedEntityType: Pick<DereferencedEntityType, "title" | "description">;
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

export const generateSystemPrompt = (params: {
  includesRelevantEntitiesPrompt?: boolean;
}) =>
  dedent(`
  "You are an advanced entity summary extraction agent.

The user will provide you with:
1. Text: the source text from which you should extract entity summaries.
2. Entity type: the specific type of entities you should extract summaries for. You must focus exclusively on this type and ignore all others.
    ${
      params.includesRelevantEntitiesPrompt
        ? `3. "Relevant entities prompt": a prompt provided by the user indicating which entities should be included.`
        : ""
    }
    
Your task:
1. Carefully analyze the text to identify all entities of the requested type${params.includesRelevantEntitiesPrompt ? " that are relevant to the provided prompt." : "."}
2. Strictly adhere to the specified entity type${params.includesRelevantEntitiesPrompt ? ", regardless of the relevant entities prompt." : "."} Never include entities of a different type, even if they seem relevant.
3. For each relevant entity of the correct type, provide:
   - "name": The exact name or identifier of the entity as it appears in the text.
   - "summary": A concise, one-sentence description of the entity based solely on the information provided in the text. Do not include any external knowledge.

4. Be extremely thorough in your extraction, ensuring you don't miss any entities of the specified type.
5. Pay special attention to structured data (e.g., tables, lists) to extract all entities of the specified type.
6. After extracting all entities of the correct type, filter them based on the relevance prompt. Include all entities that could potentially be relevant, even if you're not certain.
7. If no entities of the specified type are found, return an empty list.

Remember:
- Accuracy and completeness are crucial. Extract ALL entities of the specified type first, then filter for relevance.
- Ignore the relevance prompt during the initial extraction phase.
- Be inclusive rather than exclusive when applying the relevance filter.
- Stick strictly to the information provided in the text for summaries.
- Do not let the relevance prompt mislead you into extracting incorrect entity types.
- If you can't find any entities of the requested type, return an empty list – don't make them up, or use any prior knowledge
`);

export const getEntitySummariesFromText = async (params: {
  text: string;
  dereferencedEntityType: Pick<
    DereferencedEntityType,
    "$id" | "title" | "description"
  >;
  existingSummaries: LocalEntitySummary[];
  relevantEntitiesPrompt?: string;
  testingParams?: {
    model?: LlmParams["model"];
    systemPrompt?: string;
  };
}): Promise<{
  entitySummaries: LocalEntitySummary[];
}> => {
  const {
    text,
    dereferencedEntityType,
    existingSummaries,
    relevantEntitiesPrompt,
    testingParams,
  } = params;

  const { userAuthentication, flowEntityId, stepId, webId } =
    await getFlowContext();

  const toolDefinitions = generateToolDefinitions({
    dereferencedEntityType,
  });

  const llmResponse = await getLlmResponse(
    {
      model: testingParams?.model ?? "claude-3-haiku-20240307",
      toolChoice: toolNames[0],
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: dedent(`
                Here is the text to identify entities from:
                <Text>${text}</Text>
                
                Here is the entity type the entities must be of.
                IMPORTANT: Ignore any entities which don't match this type:
                <EntityType>
                    Name: ${dereferencedEntityType.title}
                    Description: ${dereferencedEntityType.description}
                </EntityType>
                ${
                  relevantEntitiesPrompt
                    ? dedent(`Relevant entities prompt: the user has asked you only focus on entities which match the research goal '${relevantEntitiesPrompt}'
                       Remember: don't include entities which aren't of type ${dereferencedEntityType.title}, even if they otherwise match the research goal!`)
                    : ""
                }
                ${
                  existingSummaries.length
                    ? dedent(`<ExistingEntities>
                We already have summaries for the following entities – please don't include them in your response:
                ${existingSummaries.map((summary) => `Name: ${summary.name}`).join("\n")}
                </ExistingEntities>`)
                    : ""
                } 
              `),
            },
          ],
        },
      ],
      systemPrompt:
        testingParams?.systemPrompt ??
        generateSystemPrompt({
          includesRelevantEntitiesPrompt: !!relevantEntitiesPrompt,
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
    return {
      entitySummaries: [],
    };
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
      const entityUuid = generateUuid();

      const entityId = entityIdFromComponents(webId, entityUuid as EntityUuid);

      entitySummaries.push({
        localId: entityId,
        name,
        summary,
        entityTypeId: dereferencedEntityType.$id,
      });
    }
  }

  return { entitySummaries };
};
