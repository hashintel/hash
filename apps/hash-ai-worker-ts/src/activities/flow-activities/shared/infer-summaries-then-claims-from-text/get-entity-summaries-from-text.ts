import type {
  EntityId,
  EntityUuid,
  VersionedUrl,
} from "@blockprotocol/type-system";
import { entityIdFromComponents } from "@blockprotocol/type-system";
import { generateUuid } from "@local/hash-isomorphic-utils/generate-uuid";
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
  entityTypeIds: [VersionedUrl, ...VersionedUrl[]];
};

const toolNames = ["registerEntitySummaries"] as const;

type ToolName = (typeof toolNames)[number];

const generateToolDefinitions = (params: {
  dereferencedEntityTypes: Pick<
    DereferencedEntityType,
    "$id" | "title" | "description"
  >[];
}): Record<ToolName, LlmToolDefinition<ToolName>> => ({
  registerEntitySummaries: {
    name: "registerEntitySummaries",
    description: `Register entity summaries for all entities relevant to the research goal.`,
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        entitySummaries: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              name: {
                type: "string",
                description: "The name of the entity.",
              },
              summary: {
                type: "string",
                description: "The summary of the entity.",
              },
              type: {
                type: "string",
                description:
                  dedent(`The type of entity – either the entityTypeId of a type provided to you, or the name of a new type you suggest.
                  i.e. one of the following existing types:
                  ${params.dereferencedEntityTypes
                    .map((type) => `<ExistingType>${type.$id}</ExistingType>`)
                    .join("\n")}
                  or a plain english string for a new type.`),
              },
            },
            required: ["name", "summary", "type"],
          },
        },
      },
      required: ["entitySummaries"],
    },
  },
});

export const entitySummariesFromTextSystemPrompt = dedent(`
  You are an entity recognizing specialist, working as part of a research term.
  You identify all the entities relevant to a research goal mentioned in content provided to you, and provide a summary and type for each.
  The entities you recognize will be taken as the authoritative list of relevant entities present in the text, and you therefore focus on accuracy and completeness.

  You are provided with the following:

  1. Text: the source text from which you should extract entity summaries.
  2. Goal: the research goal, which describes the entities your team is particularly interested in.
  3. Entity types: entity types the team already knows about. You can also suggest new types in addition to these, if you find relevant entities of a different type.

  For each entity you identify, you provide:

  1. Name: the name of the entity as it appears in the text
  2. Summary: a concise, one-sentence description of the entity based solely on the information provided in the text
  3. Type: the type of entity, either the entityTypeId of one already known about, or a new type you suggest

  <ImportantGuidelines>
  1. Be extremely thorough in your extraction, ensuring you don't miss any entities which may be useful to the research goal, or entities related to them.
  2. Pay special attention to structured data (e.g., tables, lists) to extract all relevant entities from them.
  3. After extracting all entities of the correct type, filter them based on the relevance prompt. Include all entities that could potentially be relevant, even if you're not certain.
  4. If there are relevant entities are in the content, it's okay to return an empty list.
  5. Stick strictly to the information provided in the text for – don't use any prior knowledge. You're providing a list of relevant entities mentioned in the text.
  6. Provide your response in the format specified in the input schema – don't escape the JSON braces and quotes, unless they appear within a JSON value.
  </ImportantGuidelines>

  <ExampleResponse>
  {
    "entitySummaries": [
      {
        "name": "Bill Gates",
        "summary": "William Henry Gates III is an American business magnate best known for co-founding the software company Microsoft with his childhood friend Paul Allen.",
        "type": "https://hash.ai/@h/types/entity-type/person/v/1" // user-provided entityTypeId
      },
      {
        "name": "Microsoft",
        "summary": "An American multinational corporation and technology company headquartered in Redmond, Washington, with products including the Windows line of operating systems, the Microsoft 365 suite of productivity applications, the Azure cloud computing platform and the Edge web browser.",
        "type": "Company" // your suggested new type title (no id is available yet)
      }
    ]
  }
  </ExampleResponse>
`);

/**
 * Extract a list of named entities from some content, i.e. named entity recognition
 */
export const getEntitySummariesFromText = async (params: {
  /**
   * The text from which to extract entity summaries.
   */
  text: string;
  /**
   * All entity types which have been given as inputs to the research task,
   * i.e. the type of entities we are looking for.
   */
  dereferencedEntityTypes: Pick<
    DereferencedEntityType,
    "$id" | "title" | "description"
  >[];
  /**
   * Any existing entities we already know about and don't need to create new summaries for.
   */
  existingSummaries: LocalEntitySummary[];
  /**
   * The research goal for this particular inference task, which guides which entities we are looking for.
   */
  relevantEntitiesPrompt: string;
  /**
   * Optional parameters for optimization purposes, allowing to overwrite the system prompt and model used.
   */
  testingParams?: {
    model?: LlmParams["model"];
    systemPrompt?: string;
  };
}): Promise<{
  entitySummaries: LocalEntitySummary[];
}> => {
  const {
    text,
    dereferencedEntityTypes,
    existingSummaries,
    relevantEntitiesPrompt,
    testingParams,
  } = params;

  const { userAuthentication, flowEntityId, stepId, webId } =
    await getFlowContext();

  const toolDefinitions = generateToolDefinitions({
    dereferencedEntityTypes,
  });

  const llmResponse = await getLlmResponse(
    {
      model: testingParams?.model ?? "claude-sonnet-4-6",
      toolChoice: toolNames[0],
      temperature: 0,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: dedent(`
                Here is the text to identify entities from:
                <Text>${text}</Text>

                Here are the entity types we already know about – either specify the EntityTypeId of one of these, or suggest a new type using a plain English title:
                <KnownEntityTypes>
                ${dereferencedEntityTypes
                  .map(
                    (dereferencedEntityType) =>
                      `<EntityType>
                        EntityTypeId: ${dereferencedEntityType.$id}
                        Title: ${dereferencedEntityType.title}
                        Description: ${dereferencedEntityType.description}
                      </EntityType>`,
                  )
                  .join("\n")}
                </KnownEntityTypes>

                Here is the research goal – please identify all entities in the text which may be relevant to this goal, including entities with relationships to relevant entities.
                <ResearchGoal>
                ${relevantEntitiesPrompt}
                </ResearchGOal>

                ${
                  existingSummaries.length
                    ? dedent(`<ExistingEntities>
                We already have summaries for the following entities – please don't include them in your response:
                ${existingSummaries
                  .map((summary) =>
                    dedent(`<ExistingEntity>
                    Name: ${summary.name}
                    Summary: ${summary.summary}
                    ${summary.entityTypeIds.length > 1 ? "Types" : "Type"}: ${summary.entityTypeIds.join(", ")}
                  </ExistingEntity>`),
                  )
                  .join("\n")}
                </ExistingEntities>`)
                    : ""
                }
              `),
            },
          ],
        },
      ],
      systemPrompt:
        testingParams?.systemPrompt ?? entitySummariesFromTextSystemPrompt,
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
      entitySummaries: { name: string; summary: string; type: string }[];
    };

    for (const { name, summary, type } of toolCallEntitySummaries) {
      const entityUuid = generateUuid() as EntityUuid;

      const entityId = entityIdFromComponents(webId, entityUuid);

      const isKnownType = dereferencedEntityTypes.some(
        (dereferencedEntityType) => dereferencedEntityType.$id === type,
      );

      /**
       * For now, we're ignoring any entities which aren't of types given as inputs to the research task
       * @todo handle new suggested types by looking for suitable matches in the database, or creating new types
       */
      if (isKnownType) {
        entitySummaries.push({
          localId: entityId,
          name,
          summary,
          entityTypeIds: [type as VersionedUrl],
        });
      }
    }
  }

  return { entitySummaries };
};
