import {
  EntityId,
  isValueMetadata,
  PropertyMetadataObject,
  PropertyObject,
} from "@local/hash-graph-types/entity";
import dedent from "dedent";

import { logger } from "./activity-logger.js";
import { getFlowContext } from "./get-flow-context.js";
import { getLlmResponse } from "./get-llm-response.js";
import { getToolCallsFromLlmAssistantMessage } from "./get-llm-response/llm-message.js";
import type {
  LlmParams,
  LlmToolDefinition,
  LlmUsage,
} from "./get-llm-response/types.js";
import { graphApiClient } from "./graph-api-client.js";
import { sleep } from "@local/hash-isomorphic-utils/sleep";
import { DuplicateReport } from "../flow-activities/research-entities-action/shared/deduplicate-entities.js";
import { simplifyEntity } from "./simplify-entity.js";
import { stringifyPropertyValue } from "@local/hash-isomorphic-utils/stringify-property-value";
import { typedEntries } from "@local/advanced-types/typed-entries";

/**
 * @todo
 * 1. @todo write a @todo list
 */
export const mergeEntitiesSystemPrompt = `
  You are managing a database of entities, which may be any type of thing.
  
  You are processing a new report of an entity, and have to decide if it matches an entity that's already in the database.
  
  You are given one or more entities from the database which _may_ represent the same thing as the new entity input.
  
  You must:
  1. Decide which one, if any, of the existing entities match the new input
  2. If there is a match, provide:
     - the id of the existing entity that matches the new input
     - merged versions of properties which are suitable for merging (e.g. descriptions which incorporate both the old and new description)
     
  There may not be a match. Err on the side of caution when deciding if one entity is the same as another.
  
  Bear in mind that you may encounter entities which are named similarly but actually refer to different entities,
   or which are named slightly differently but refer to the same entity, for example:
  1. Nintendo of Europe is not the same as Nintendo of America, and neither are the same as Nintendo Co Ltd.
  2. Whereas Nintendo Co Ltd. is the same as Nintendo (they refer to the same entity)
  3. The Playstation 5 is not the same as the Playstation 4
  
  If you are not certain there is a match among the existing entities, provide 'null' as the 'existingEntity'.
`;

export type ExistingEntityReport = {
  matchedEntityId: EntityId | null;
  mergedProperties: Record<string, string>;
};

const toolName = "reportExistingEntityFinding";

const generateMatchExistingEntityTool = (
  propertyNames: string[],
): LlmToolDefinition<typeof toolName> => ({
  name: toolName,
  description: dedent(`
    If an existing entity matches the new input, provide the id of the existing entity and merged versions of properties which are suitable for merging.
    If there is no match, provide null.
  `),
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      matchedEntityId: { oneOf: [{ type: "null" }, { type: "string" }] },
      mergedProperties: {
        type: "object",
        additionalProperties: false,
        properties: Object.fromEntries(
          propertyNames.map((propertyName) => [
            propertyName,
            { type: "string" },
          ]),
        ),
      },
    },
    required: ["matchedEntityId"],
  },
});

type PotentialMatch = {
  entityId: EntityId;
  metadata: PropertyMetadataObject;
  properties: PropertyObject;
};

type MatchExistingEntityParams = {
  newEntity: PotentialMatch;
  potentialMatches: PotentialMatch[];
};

const generateMatchExistingEntityUserMessage = ({
  newEntity,
  potentialMatches,
}: MatchExistingEntityParams): string => {
  return `
The new entity is:

<NewEntity>
<EntityId>${newEntity.entityId}</EntityId>
<Properties>
${Object.entries(newEntity.properties)
  .map(
    ([baseUrl, value]) => `<Property>
<Key>${baseUrl}</Key>
<Value>${stringifyPropertyValue(value)}</Value>
</Property>`,
  )
  .join("\n")}
</Properties>
</NewEntity>

The potential matches are:
${potentialMatches
  .map(
    (potentialMatch) => `
<PotentialMatch>
<EntityId>${potentialMatch.entityId}</EntityId>
<Properties>
${Object.entries(potentialMatch.properties)
  .map(
    ([baseUrl, value]) =>
      `<Property>
<Key>${baseUrl}</Key>
<Value>${stringifyPropertyValue(value)}</Value>
<Mergeable>${typeof value === "string" ? "yes" : "no"}</Mergeable>
</Property>`,
  )
  .join("\n")}
</Properties>
</PotentialMatch>
`,
  )
  .join("\n")}

Do any of the potential matches match the new entity?
If so, please provide the entityId of the match, and merged versions of properties which are suitable for merging.
  `;
};

const defaultModel: LlmParams["model"] = "gpt-4o-2024-08-06";

type MergedEntityWithAddedOrChangedProperties = PotentialMatch;

/**
 * Given one or more entities which may be a match for a new entity, identify if any of them are a match.
 */
export const matchExistingEntity = async (
  params: MatchExistingEntityParams,
): Promise<{
  match: MergedEntityWithAddedOrChangedProperties | null;
  usage: LlmUsage;
  totalRequestTime: number;
}> => {
  const { newEntity, potentialMatches } = params;

  const { flowEntityId, userAuthentication, stepId, webId } =
    await getFlowContext();

  const tool = generateMatchExistingEntityTool(
    Object.keys(newEntity.properties),
  );

  const userMessage = generateMatchExistingEntityUserMessage({
    newEntity,
    potentialMatches,
  });

  const llmResponse = await getLlmResponse(
    {
      systemPrompt: mergeEntitiesSystemPrompt,
      tools: [tool],
      toolChoice: toolName,
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
      ],
      model: defaultModel,
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
        match: null,
        totalRequestTime: 0,
        usage: {
          totalTokens: 0,
          inputTokens: 0,
          outputTokens: 0,
        },
      };
    }

    logger.error(`Error matching existing entity: ${llmResponse.status}`);

    await sleep(2_000);

    return matchExistingEntity(params);
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

  const { matchedEntityId, mergedProperties } =
    firstToolCall.input as ExistingEntityReport;

  if (!matchedEntityId) {
    return { match: null, totalRequestTime, usage };
  }

  const match = potentialMatches.find(
    (potentialMatch) => potentialMatch.entityId === matchedEntityId,
  );

  if (!match) {
    throw new Error(
      `Expected a match for entity id ${matchedEntityId}, but none was found`,
    );
  }

  const newCombinedProperties = JSON.parse(
    JSON.stringify(match.properties),
  ) as typeof match.properties;
  const newCombinedMetadata = JSON.parse(
    JSON.stringify(match.metadata),
  ) as typeof match.metadata;

  for (const [baseUrl, valueFromNewEntity] of typedEntries(
    newEntity.properties,
  )) {
    const mergedValue = mergedProperties[baseUrl];

    const newValue = mergedValue ?? valueFromNewEntity;

    newCombinedProperties[baseUrl] = newValue;

    const existingMetadataForProperty = newCombinedMetadata.value[baseUrl];
    const newMetadataForProperty = newEntity.metadata.value[baseUrl];

    if (mergedValue) {
      const existingSources =
        existingMetadataForProperty &&
        isValueMetadata(existingMetadataForProperty)
          ? (existingMetadataForProperty.metadata.provenance?.sources ?? [])
          : [];

      const newSources =
        newMetadataForProperty && isValueMetadata(newMetadataForProperty)
          ? (newMetadataForProperty.metadata.provenance?.sources ?? [])
          : [];

      const mergedSources = [...existingSources, ...newSources].filter(
        (source, index, sources) =>
          !source.location?.uri ||
          sources.findIndex(
            (src) => src.location?.uri === source.location?.uri,
          ) === index,
      );

      newCombinedMetadata.value[baseUrl] = {
        metadata: {
          ...newCombinedMetadata.value[baseUrl]?.metadata,
          provenance: {
            sources: mergedSources,
          },
        },
      };
    } else {
      newCombinedMetadata.value[baseUrl] = newMetadataForProperty;
    }
  }

  return { match, totalRequestTime, usage };
};
