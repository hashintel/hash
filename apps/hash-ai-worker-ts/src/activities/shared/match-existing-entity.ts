import { typedEntries } from "@local/advanced-types/typed-entries";
import type { SourceProvenance } from "@local/hash-graph-client";
import type {
  EntityId,
  PropertyMetadataObject,
  PropertyObject,
} from "@local/hash-graph-types/entity";
import { isValueMetadata } from "@local/hash-graph-types/entity";
import { deduplicateSources } from "@local/hash-isomorphic-utils/provenance";
import { sleep } from "@local/hash-isomorphic-utils/sleep";
import { stringifyPropertyValue } from "@local/hash-isomorphic-utils/stringify-property-value";
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

/**
 * @todo
 * 1. Cover link entities
 */
export const matchExistingEntitySystemPrompt = `
  You are managing a database of entities, which may be any type of thing.
  
  You are processing a new report of an entity, and have to decide if it matches an entity that's already in the database.
  
  You are given one or more entities from the database which _may_ represent the same thing as the new entity input.
  
  You must:
  1. Decide which one, if any, of the existing entities match the new input
  2. If there is a match, provide:
     - the id of the existing entity that matches the new input
     - merged values for properties which are suitable for merging (e.g. descriptions which incorporate both the old and new description)
     
  There may not be a match. Err on the side of caution when deciding if one entity is the same as another.
  
  Bear in mind that you may encounter entities which are named similarly but actually refer to different entities,
   or which are named slightly differently but refer to the same entity, for example:
  1. Nintendo of Europe is not the same as Nintendo of America, and neither are the same as Nintendo Co Ltd.
  2. Whereas Nintendo Co Ltd. is the same as Nintendo (they refer to the same entity)
  3. The Playstation 5 is not the same as the Playstation 4
  
  If you are not certain there is a match among the existing entities, provide 'null' as the 'matchedEntityId'.
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

export type EntityForMatching = {
  entityId: EntityId;
  properties: PropertyObject;
  propertyMetadata: PropertyMetadataObject;
  editionSources: SourceProvenance[];
};

export type MatchExistingEntityParams = {
  newEntity: Omit<EntityForMatching, "entityId">;
  potentialMatches: EntityForMatching[];
};

const generateMatchExistingEntityUserMessage = ({
  newEntity,
  potentialMatches,
  previousError,
}: MatchExistingEntityParams & { previousError: string | null }): string => {
  return `
The new entity is:

<NewEntity>
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
${previousError ? `Your previous response had an error – please do not repeat it: ${previousError}` : ""}`;
};

const defaultModel: LlmParams["model"] = "gpt-4o-2024-08-06";

type MergedEntityWithAddedOrChangedProperties = EntityForMatching;

/**
 * Given one or more entities which may be a match for a new entity, identify if any of them are a match.
 *
 * If a match is found, it will return the changed properties object and property object metadata.
 * This may not represent ALL properties of the existing entity, only those which the new entity has changed (added or updated).
 */
export const matchExistingEntity = async (
  params: MatchExistingEntityParams,
  previousError: string | null = null,
  /**
   * Optional parameters for optimization purposes, allowing to overwrite the system prompt and model used.
   */
  testingParams?: {
    model?: LlmParams["model"];
    systemPrompt?: string;
  },
): Promise<{
  /**
   * If a match is found, this will contain:
   * - the entityId of the matched entity
   * - the properties which the new entity has changed (introduced or updated).
   *     where appropriate, the value for a property may be a merged version of the old and new values,
   *     e.g. for long text fields such as description (where both the new and old value may contain useful, relevant information)
   * - the metadata for the changed properties
   *     if a property value is the result of merging the old and new value, the sources will also be merged.
   *     e.g. if the old value came from news.com, and the new value came from wikipedia.com, the merged metadata will list both sources.
   *
   * If no match is identified, this will be `null`.
   */
  matchWithMergedChangedProperties: MergedEntityWithAddedOrChangedProperties | null;
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
    previousError,
  });

  const llmResponse = await getLlmResponse(
    {
      systemPrompt:
        testingParams?.systemPrompt ?? matchExistingEntitySystemPrompt,
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
      model: testingParams?.model ?? defaultModel,
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
        matchWithMergedChangedProperties: null,
      };
    }

    logger.error(`Error matching existing entity: ${llmResponse.status}`);

    await sleep(2_000);

    return matchExistingEntity(
      params,
      "message" in llmResponse ? llmResponse.message : undefined,
      testingParams,
    );
  }

  const { message } = llmResponse;

  const toolCalls = getToolCallsFromLlmAssistantMessage({ message });

  const firstToolCall = toolCalls[0];

  if (!firstToolCall || toolCalls.length > 1) {
    return matchExistingEntity(
      params,
      "You must make exactly one tool call",
      testingParams,
    );
  }

  const { matchedEntityId, mergedProperties } =
    firstToolCall.input as ExistingEntityReport;

  if (!matchedEntityId) {
    return { matchWithMergedChangedProperties: null };
  }

  const match = potentialMatches.find(
    (potentialMatch) => potentialMatch.entityId === matchedEntityId,
  );

  if (!match) {
    return matchExistingEntity(
      params,
      "You must make exactly one tool call",
      testingParams,
    );
  }

  const changedPropertiesWithMergedValues = JSON.parse(
    JSON.stringify(newEntity.properties),
  ) as typeof newEntity.properties;

  const metadataForChangedProperties = JSON.parse(
    JSON.stringify(newEntity.propertyMetadata),
  ) as typeof newEntity.propertyMetadata;

  for (const [baseUrl, valueFromNewEntity] of typedEntries(
    newEntity.properties,
  )) {
    const mergedValue = mergedProperties[baseUrl];

    const newValue = mergedValue ?? valueFromNewEntity;

    changedPropertiesWithMergedValues[baseUrl] = newValue;

    const existingMetadataForProperty = match.propertyMetadata.value[baseUrl];

    const newMetadataForProperty = newEntity.propertyMetadata.value[baseUrl];

    if (!newMetadataForProperty) {
      throw new Error(`No metadata provided for property at ${baseUrl}`);
    }

    if (mergedValue) {
      const existingSources =
        existingMetadataForProperty &&
        isValueMetadata(existingMetadataForProperty)
          ? (existingMetadataForProperty.metadata.provenance?.sources ?? [])
          : [];

      const newSources = isValueMetadata(newMetadataForProperty)
        ? (newMetadataForProperty.metadata.provenance?.sources ?? [])
        : [];

      const mergedSources = deduplicateSources([
        ...existingSources,
        ...newSources,
      ]);

      if (!isValueMetadata(newMetadataForProperty)) {
        throw new Error(
          `Expected metadata to be a value metadata for property at ${baseUrl}, received: ${JSON.stringify(
            newMetadataForProperty,
          )}`,
        );
      }

      metadataForChangedProperties.value[baseUrl] = {
        metadata: {
          ...newMetadataForProperty.metadata,
          provenance: {
            sources: mergedSources,
          },
        },
      };
    } else {
      metadataForChangedProperties.value[baseUrl] = newMetadataForProperty;
    }
  }

  const mergedEditionSources = deduplicateSources([
    ...newEntity.editionSources,
    ...match.editionSources,
  ]);

  const matchWithChangedProperties = {
    entityId: match.entityId,
    editionSources: mergedEditionSources,
    properties: changedPropertiesWithMergedValues,
    propertyMetadata: metadataForChangedProperties,
  };

  return {
    matchWithMergedChangedProperties: matchWithChangedProperties,
  };
};
