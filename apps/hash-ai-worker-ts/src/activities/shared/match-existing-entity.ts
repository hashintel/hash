import type {
  EntityId,
  PropertyObject,
  PropertyObjectMetadata,
  SourceProvenance,
  VersionedUrl,
} from "@blockprotocol/type-system";
import { isValueMetadata } from "@blockprotocol/type-system";
import { typedEntries } from "@local/advanced-types/typed-entries";
import type { Entity } from "@local/hash-graph-sdk/entity";
import { deduplicateSources } from "@local/hash-isomorphic-utils/provenance";
import { sleep } from "@local/hash-isomorphic-utils/sleep";
import { stringifyPropertyValue } from "@local/hash-isomorphic-utils/stringify-property-value";
import dedent from "dedent";

import { logger } from "./activity-logger.js";
import { getFlowContext } from "./get-flow-context.js";
import { getLlmResponse } from "./get-llm-response.js";
import { getToolCallsFromLlmAssistantMessage } from "./get-llm-response/llm-message.js";
import type { LlmParams, LlmToolDefinition } from "./get-llm-response/types.js";
import { graphApiClient } from "./graph-api-client.js";

export const matchExistingEntitySystemPrompt = `
You are managing a database of entities, which may be any type of thing.

You are processing a new report of an entity, and have to decide if it matches an entity that's already in the database.

You are given one or more entities from the database which _may_ represent the same thing as the new entity input.
You are told the type(s) of each entity.

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

If the user specifies that the entity represents a link (relationship) between two entities, the properties shown will be the attributes of the link.
Use the properties to determine if the new link is the same as the existing link. For example:
1. An 'employed-by' link which has the same 'startDate' property as another can be judged to be the same link,
   as long as it doesn't specify any other properties which have different values (e.g. 'jobRole')
2. But an 'invested-in' link which has the same 'investmentDate' property but _different_ 'investmentAmount' properties is likely to be a different link.

If you are not certain there is a match among the existing entities, provide 'null' as the 'matchedEntityId'.

Where a property is present on both the new and the old entity, and it is a text field suitable for merging (e.g. a description),
you should provide a new value that combines both the old and new.

If a property is NOT present on both the new and old entity, or is not suitable for combining (e.g. short values. numbers),
do not return them. Only return mergedProperties where you have written a new value based on the old and new.
If in doubt, don't rewrite properties. The intention between merging them is to preserve useful information from the old value,
which is only likely to apply to longer, descriptive text fields.
<Examples>
  <Example>
    <NewEntity>
      <Types>
        "https://hash.ai/@hash/types/entity-type/business-location/v/1"
      </Types>
      <Properties>
        "https://blockprotocol.org/@blockprotocol/types/property-type/address/": "123 Main St, Seattle, WA"
        "https://blockprotocol.org/@blockprotocol/types/property-type/business-name/": "Joe's Coffee"
        "https://blockprotocol.org/@blockprotocol/types/property-type/opening-date/": "2022-01-15"
      </Properties>
    </NewEntity>
    <PotentialMatches>
      <PotentialMatch>
        <EntityId>location123</EntityId>
        <Types>"https://hash.ai/@hash/types/entity-type/business-location/v/1"</Types>
        <Properties>
          <Property>
            <Key>"https://blockprotocol.org/@blockprotocol/types/property-type/address/"</Key>
            <Value>123 Main Street, Seattle, Washington</Value>
          </Property>
          <Property>
            <Key>"https://blockprotocol.org/@blockprotocol/types/property-type/business-name/"</Key>
            <Value>Joe's Coffee Shop</Value>
          </Property>
          <Property>
            <Key>"https://blockprotocol.org/@blockprotocol/types/property-type/opening-date/"</Key>
            <Value>2022-01-15</Value>
          </Property>
        </Properties>
      </PotentialMatch>
      <PotentialMatch>
        <EntityId>location456</EntityId>
        <Types>"https://hash.ai/@hash/types/entity-type/business-location/v/1"</Types>
        <Properties>
          <Property>
            <Key>"https://blockprotocol.org/@blockprotocol/types/property-type/address/"</Key>
            <Value>123 Main St, Seattle, WA</Value>
          </Property>
          <Property>
            <Key>"https://blockprotocol.org/@blockprotocol/types/property-type/business-name/"</Key>
            <Value>Joe's Coffee</Value>
          </Property>
          <Property>
            <Key>"https://blockprotocol.org/@blockprotocol/types/property-type/opening-date/"</Key>
            <Value>2020-03-01</Value>
          </Property>
        </Properties>
      </PotentialMatch>
      <PotentialMatch>
        <EntityId>location789</EntityId>
        <Types>"https://hash.ai/@hash/types/entity-type/business-location/v/1"</Types>
        <Properties>
          <Property>
            <Key>"https://blockprotocol.org/@blockprotocol/types/property-type/address/"</Key>
            <Value>123 Main St, Portland, OR</Value>
          </Property>
          <Property>
            <Key>"https://blockprotocol.org/@blockprotocol/types/property-type/business-name/"</Key>
            <Value>Joe's Coffee</Value>
          </Property>
          <Property>
            <Key>"https://blockprotocol.org/@blockprotocol/types/property-type/opening-date/"</Key>
            <Value>2022-01-15</Value>
          </Property>
        </Properties>
      </PotentialMatch>
    </PotentialMatches>
    <Explanation>
      This is a match with location123 despite multiple similar entries.
      location456 has the same address but a different opening date, suggesting it's a previous business at the same location.
      location789 is a different branch in Portland.
      location123 matches both the address and opening date, and the slight variation in business name format is mergeable.
    </Explanation>
  </Example>

  <Example>
    <NewEntity>
      <Types>
        "https://hash.ai/@hash/types/entity-type/investment/v/1"
      </Types>
      <Properties>
        "https://blockprotocol.org/@blockprotocol/types/property-type/amount/": "1000000"
        "https://blockprotocol.org/@blockprotocol/types/property-type/date/": "2024-03-15"
        "https://blockprotocol.org/@blockprotocol/types/property-type/investor/": "Acme Ventures"
      </Properties>
    </NewEntity>
    <PotentialMatches>
      <PotentialMatch>
        <EntityId>investment456</EntityId>
        <Types>"https://hash.ai/@hash/types/entity-type/investment/v/1"</Types>
        <Properties>
          <Property>
            <Key>"https://blockprotocol.org/@blockprotocol/types/property-type/amount/"</Key>
            <Value>1000000</Value>
          </Property>
          <Property>
            <Key>"https://blockprotocol.org/@blockprotocol/types/property-type/date/"</Key>
            <Value>2024-03-15</Value>
          </Property>
          <Property>
            <Key>"https://blockprotocol.org/@blockprotocol/types/property-type/investor/"</Key>
            <Value>Beta Capital</Value>
          </Property>
        </Properties>
      </PotentialMatch>
      <PotentialMatch>
        <EntityId>investment789</EntityId>
        <Types>"https://hash.ai/@hash/types/entity-type/investment/v/1"</Types>
        <Properties>
          <Property>
            <Key>"https://blockprotocol.org/@blockprotocol/types/property-type/amount/"</Key>
            <Value>1000000</Value>
          </Property>
          <Property>
            <Key>"https://blockprotocol.org/@blockprotocol/types/property-type/investor/"</Key>
            <Value>Acme Ventures</Value>
          </Property>
        </Properties>
      </PotentialMatch>
      <PotentialMatch>
        <EntityId>investment101</EntityId>
        <Types>"https://hash.ai/@hash/types/entity-type/investment/v/1"</Types>
        <Properties>
          <Property>
            <Key>"https://blockprotocol.org/@blockprotocol/types/property-type/amount/"</Key>
            <Value>1000000</Value>
          </Property>
          <Property>
            <Key>"https://blockprotocol.org/@blockprotocol/types/property-type/date/"</Key>
            <Value>2024-03-15</Value>
          </Property>
          <Property>
            <Key>"https://blockprotocol.org/@blockprotocol/types/property-type/investor/"</Key>
            <Value>Acme Venture Partners</Value>
          </Property>
        </Properties>
      </PotentialMatch>
    </PotentialMatches>
    <Explanation>
      This is a match with investment101 because it matches the amount, date, and investor (Acme Venture Partners is the same as Acme Ventures).
      investment456 has a different investor, and investment789 is missing the date field which is crucial for identifying a specific investment.
    </Explanation>
  </Example>

  <Example>
    <NewEntity>
      <Types>
        "https://hash.ai/@hash/types/entity-type/software-release/v/1"
      </Types>
      <Properties>
        "https://blockprotocol.org/@blockprotocol/types/property-type/version/": "2.0.0"
        "https://blockprotocol.org/@blockprotocol/types/property-type/release-notes/": "Major update including performance improvements and bug fixes"
        "https://blockprotocol.org/@blockprotocol/types/property-type/release-date/": "2024-06-15"
        "https://blockprotocol.org/@blockprotocol/types/property-type/platform/": "Linux"
      </Properties>
    </NewEntity>
    <PotentialMatches>
      <PotentialMatch>
        <EntityId>release789</EntityId>
        <Types>"https://hash.ai/@hash/types/entity-type/software-release/v/1"</Types>
        <Properties>
          <Property>
            <Key>"https://blockprotocol.org/@blockprotocol/types/property-type/version/"</Key>
            <Value>2.0.0</Value>
          </Property>
          <Property>
            <Key>"https://blockprotocol.org/@blockprotocol/types/property-type/release-notes/"</Key>
            <Value>Performance improvements and critical bug fixes</Value>
          </Property>
          <Property>
            <Key>"https://blockprotocol.org/@blockprotocol/types/property-type/release-date/"</Key>
            <Value>2024-06-15</Value>
          </Property>
          <Property>
            <Key>"https://blockprotocol.org/@blockprotocol/types/property-type/platform/"</Key>
            <Value>Windows</Value>
          </Property>
        </Properties>
      </PotentialMatch>
      <PotentialMatch>
        <EntityId>release790</EntityId>
        <Types>"https://hash.ai/@hash/types/entity-type/software-release/v/1"</Types>
        <Properties>
          <Property>
            <Key>"https://blockprotocol.org/@blockprotocol/types/property-type/version/"</Key>
            <Value>2.0.0</Value>
          </Property>
          <Property>
            <Key>"https://blockprotocol.org/@blockprotocol/types/property-type/release-notes/"</Key>
            <Value>This release focuses on performance optimizations and fixes several critical bugs</Value>
          </Property>
          <Property>
            <Key>"https://blockprotocol.org/@blockprotocol/types/property-type/release-date/"</Key>
            <Value>2024-06-15</Value>
          </Property>
          <Property>
            <Key>"https://blockprotocol.org/@blockprotocol/types/property-type/platform/"</Key>
            <Value>MacOS</Value>
          </Property>
        </Properties>
      </PotentialMatch>
      <PotentialMatch>
        <EntityId>release791</EntityId>
        <Types>"https://hash.ai/@hash/types/entity-type/software-release/v/1"</Types>
        <Properties>
          </Property>
          <Property>
            <Key>"https://blockprotocol.org/@blockprotocol/types/property-type/release-date/"</Key>
            <Value>2024-06-15</Value>
          </Property>
          <Property>
            <Key>"https://blockprotocol.org/@blockprotocol/types/property-type/platform/"</Key>
            <Value>Linux</Value>
          </Property>
        </Properties>
      </PotentialMatch>
    </PotentialMatches>
    <Explanation>
      This is not a match with any existing entity.
      release789 is for Windows, despite having the same release date and version number.
      release790 is for MacOS, despite having the same release date and version number.
      release791 is for Linux and shares the release date, but there is no version number. A patch release could have been released on the same date.
      The presence of the 'platform' and 'version' properties in these entities indicate that they are important for distinguishing between them.
    </Explanation>
  </Example>
</Examples>
`;

export type ExistingEntityReport = {
  matchedEntityId: EntityId | null;
  mergedProperties?: Record<string, string>;
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
        description:
          "The properties where you are merging the old and new value together. Do not include any properties which are not being merged – don't include any which don't appear in both the new and old entity, or which you are not changing from their new value.",
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

export type NewEntityInput = {
  entityTypeIds: VersionedUrl[];
  properties: PropertyObject;
  propertiesMetadata: PropertyObjectMetadata;
  editionSources: SourceProvenance[];
};

export type ExistingEntityForMatching = Pick<
  Entity,
  "entityId" | "properties" | "propertiesMetadata"
> & {
  metadata: Pick<Entity["metadata"], "entityTypeIds"> & {
    provenance: {
      edition: Pick<Entity["metadata"]["provenance"]["edition"], "sources">;
    };
  };
};

export type MatchExistingEntityParams<
  T extends ExistingEntityForMatching = ExistingEntityForMatching,
> = {
  newEntity: NewEntityInput;
  potentialMatches: T[];
};

const generateMatchExistingEntityUserMessage = ({
  isLink,
  newEntity,
  potentialMatches,
  previousError,
}: MatchExistingEntityParams & {
  isLink: boolean;
  previousError: string | null;
}): string => {
  return `${
    isLink
      ? `This is a link entity, which creates a relationship between two other entities.
The properties shown for the new link and the potential matches are the attributes of the links. The new link entity is:`
      : "The new entity is:"
  }

<NewEntity>
  <Types>${newEntity.entityTypeIds.join("\n")}</Types>
  <Properties>
  ${Object.entries(newEntity.properties)
    .map(
      ([baseUrl, value]) => `   <Property>
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
  <Types>${newEntity.entityTypeIds.join("\n")}</Types>
  <Properties>
  ${typedEntries(potentialMatch.properties)
    .map(
      ([baseUrl, value]) =>
        ` <Property>
      <Key>${baseUrl}</Key>
      <Value>${stringifyPropertyValue(value)}</Value>
      <Mergeable>${typeof newEntity.properties[baseUrl] === "string" ? "Maybe" : "No"}</Mergeable>
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

Remember to pay close attention to each property you are provided with.
Differences in some properties between the new entity and the potential matches will make it clear that the entities do NOT match, e.g. because they refer to different dates, versions, roles, values, actors involved, etc.
Check differences in property values to see if they are significant.

${previousError ? `Your previous response had an error – please do not repeat it: ${previousError}` : ""}`;
};

const defaultModel: LlmParams["model"] = "gpt-4o-2024-08-06";

export type MatchedEntityUpdate<T extends ExistingEntityForMatching> = {
  existingEntity: T;
  /**
   * If a match is found, the values that should be used when creating the entity update.
   */
  newValues: {
    /**
     * The merged entityTypeIds of the new input and the matched entity.
     */
    entityTypeIds: VersionedUrl[];
    /**
     * The properties which the new entity has changed (introduced or updated).
     * Where appropriate, the value for a property may be a merged version of the old and new values,
     * e.g. for long text fields such as description (where both the new and old value may contain useful, relevant
     */
    properties: PropertyObject;
    /**
     * The metadata for the changed properties.
     * If a property value is the result of merging the old and new value, the sources will also be merged.
     * e.g. if the old value came from news.com, and the new value came from wikipedia.com, the merged metadata will list both sources.
     */
    propertyMetadata: PropertyObjectMetadata;
    /**
     * The sources for the new entity edition.
     * This will be a deduplicated list of sources from the new entity and the matched entity.
     */
    editionSources: SourceProvenance[];
  };
} | null;

/**
 * Given one or more entities which may be a match for a new entity, identify if any of them are a match.
 *
 * If a match is found, it will return the changed properties object and property object metadata.
 * This may not represent ALL properties of the existing entity, only those which the new entity has changed (added or
 * updated).
 */
export const matchExistingEntity = async <T extends ExistingEntityForMatching>({
  entities,
  isLink,
  previousError = null,
  testingParams,
}: {
  entities: MatchExistingEntityParams<T>;
  isLink: boolean;
  previousError?: string | null;
  /**
   * Optional parameters for optimization purposes, allowing to overwrite the system prompt and model used.
   */
  testingParams?: {
    model?: LlmParams["model"];
    systemPrompt?: string;
  };
}): Promise<MatchedEntityUpdate<T>> => {
  const { newEntity, potentialMatches } = entities;

  const { flowEntityId, userAuthentication, stepId, webId } =
    await getFlowContext();

  const tool = generateMatchExistingEntityTool(
    Object.keys(newEntity.properties),
  );

  const userMessage = generateMatchExistingEntityUserMessage({
    isLink,
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
        taskName: "match-existing-entity",
      },
      userAccountId: userAuthentication.actorId,
      graphApiClient,
      incurredInEntities: [{ entityId: flowEntityId }],
      webId,
    },
  );

  if (llmResponse.status !== "ok") {
    if (llmResponse.status === "aborted") {
      return null;
    }

    logger.error(
      `Error matching existing entity: [${llmResponse.status}]: ${"message" in llmResponse ? llmResponse.message : "No message provided"}`,
    );

    await sleep(2_000);

    return matchExistingEntity({
      entities,
      isLink,
      previousError: "message" in llmResponse ? llmResponse.message : null,
      testingParams,
    });
  }

  const { message } = llmResponse;

  const toolCalls = getToolCallsFromLlmAssistantMessage({ message });

  const firstToolCall = toolCalls[0];

  if (!firstToolCall || toolCalls.length > 1) {
    return matchExistingEntity({
      entities,
      isLink,
      previousError: "You must make exactly one tool call",
      testingParams,
    });
  }

  const { matchedEntityId, mergedProperties } =
    firstToolCall.input as ExistingEntityReport;

  if (!matchedEntityId) {
    return null;
  }

  const match = potentialMatches.find(
    (potentialMatch) => potentialMatch.entityId === matchedEntityId,
  );

  if (!match) {
    return matchExistingEntity({
      entities,
      isLink,
      previousError: `You supplied an entity id ${matchedEntityId} which was not in the list of potential matches`,
      testingParams,
    });
  }

  const changedPropertiesWithMergedValues = JSON.parse(
    JSON.stringify(newEntity.properties),
  ) as typeof newEntity.properties;

  const metadataForChangedProperties = JSON.parse(
    JSON.stringify(newEntity.propertiesMetadata),
  ) as typeof newEntity.propertiesMetadata;

  for (const [baseUrl, valueFromNewEntity] of typedEntries(
    newEntity.properties,
  )) {
    const mergedValue = mergedProperties?.[baseUrl];

    const newValue = mergedValue ?? valueFromNewEntity;

    /**
     * This is overwriting the old value with the new in all cases.
     * For nested property objects, we may wish to attempt to merge them, e.g.
     * if one nested 'address' property has 'Street' defined in the old entity and 'City' in the new, we could take both.
     *
     * But this may not always be appropriate. The 'Street' and 'City' may refer to different addresses.
     * It's not clear we can automatically determine if a property object should be merged or not.
     *
     * @todo H-3900 tracks handling property objects better in flows
     */
    changedPropertiesWithMergedValues[baseUrl] = newValue;

    const existingMetadataForProperty = match.propertiesMetadata.value[baseUrl];

    const newMetadataForProperty = newEntity.propertiesMetadata.value[baseUrl];

    if (!newMetadataForProperty) {
      throw new Error(
        `No metadata provided for property changed at ${baseUrl}`,
      );
    }

    if (mergedValue || newValue === match.properties[baseUrl]) {
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
    ...(match.metadata.provenance.edition.sources ?? []),
  ]);

  const matchWithMergedValues = {
    entityTypeIds: [
      ...new Set([...newEntity.entityTypeIds, ...match.metadata.entityTypeIds]),
    ],
    editionSources: mergedEditionSources,
    properties: changedPropertiesWithMergedValues,
    propertyMetadata: metadataForChangedProperties,
  };

  return {
    existingEntity: match,
    newValues: matchWithMergedValues,
  };
};
