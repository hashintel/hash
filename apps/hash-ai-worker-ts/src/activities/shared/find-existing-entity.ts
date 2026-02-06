import { getRoots } from "@blockprotocol/graph/stdlib";
import type {
  ActorEntityUuid,
  BaseUrl,
  LinkData,
  WebId,
} from "@blockprotocol/type-system";
import {
  extractEntityUuidFromEntityId,
  extractWebIdFromEntityId,
} from "@blockprotocol/type-system";
import { typedEntries } from "@local/advanced-types/typed-entries";
import type {
  AllFilter,
  CosineDistanceFilter,
  GraphApi,
} from "@local/hash-graph-client";
import { HashEntity, queryEntities } from "@local/hash-graph-sdk/entity";
import { queryEntityTypeSubgraph } from "@local/hash-graph-sdk/entity-type";
import type { ProposedEntity } from "@local/hash-isomorphic-utils/flows/types";
import {
  almostFullOntologyResolveDepths,
  currentTimeInstantTemporalAxes,
  generateVersionedUrlMatchingFilter,
} from "@local/hash-isomorphic-utils/graph-queries";
import { deduplicateSources } from "@local/hash-isomorphic-utils/provenance";

import { logger } from "./activity-logger.js";
import type { DereferencedEntityType } from "./dereference-entity-type.js";
import { dereferenceEntityType } from "./dereference-entity-type.js";
import { createEntityEmbeddings } from "./embeddings.js";
import {
  type MatchedEntityUpdate,
  matchExistingEntity,
} from "./match-existing-entity.js";

export const findExistingEntity = async ({
  actorId,
  dereferencedEntityTypes,
  graphApiClient,
  webId,
  proposedEntity,
  includeDrafts,
}: {
  actorId: ActorEntityUuid;
  dereferencedEntityTypes?: DereferencedEntityType[];
  graphApiClient: GraphApi;
  webId: WebId;
  proposedEntity: Pick<
    ProposedEntity,
    "entityTypeIds" | "properties" | "propertyMetadata" | "provenance"
  >;
  includeDrafts: boolean;
}): Promise<MatchedEntityUpdate<HashEntity> | null> => {
  const entityTypes: DereferencedEntityType[] =
    dereferencedEntityTypes ??
    (await queryEntityTypeSubgraph(
      graphApiClient,
      { actorId },
      {
        filter: {
          any: proposedEntity.entityTypeIds.map((entityTypeId) => ({
            equal: [{ path: ["versionedUrl"] }, { parameter: entityTypeId }],
          })),
        },
        graphResolveDepths: almostFullOntologyResolveDepths,
        traversalPaths: [],
        temporalAxes: currentTimeInstantTemporalAxes,
      },
    ).then(({ subgraph }) => {
      const foundEntityTypes = getRoots(subgraph);

      return foundEntityTypes.map(({ schema }) => {
        const dereferencedType = dereferenceEntityType({
          entityTypeId: schema.$id,
          subgraph,
        });

        return dereferencedType.schema;
      });
    }));

  if (!entityTypes.length) {
    throw new Error(
      `Could not retrieve EntityTypes with ids ${proposedEntity.entityTypeIds.join(", ")}`,
    );
  }

  /**
   * Search for an existing entity that seems to semantically match the proposed entity, based on:
   * 1. The value for the label property, or other properties which are good candidates for unique identifying
   * an entity
   * 2. The entire entity properties object, if there is no match from (1)
   */

  /** We are going to need the embeddings in both cases, so create these first */
  const { embeddings } = await createEntityEmbeddings({
    entityProperties: proposedEntity.properties,
    propertyTypes: entityTypes.flatMap((entityType) =>
      Object.values(entityType.properties).map((propertySchema) => ({
        title:
          "items" in propertySchema
            ? propertySchema.items.title
            : propertySchema.title,
        $id:
          "items" in propertySchema
            ? propertySchema.items.$id
            : propertySchema.$id,
      })),
    ),
  });

  const existingEntityBaseAllFilter = [
    { equal: [{ path: ["archived"] }, { parameter: false }] },
    {
      equal: [
        { path: ["webId"] },
        {
          parameter: webId,
        },
      ],
    },
    {
      any: proposedEntity.entityTypeIds.map((entityTypeId) =>
        generateVersionedUrlMatchingFilter(entityTypeId),
      ),
    },
  ] satisfies AllFilter["all"];

  // starting point for a threshold that will get only values which are a semantic match
  const maximumSemanticDistance = 0.3;

  /**
   * First find suitable specific properties to match on
   */
  const propertyBaseUrlsToMatchOn: BaseUrl[] = entityTypes.flatMap((type) => {
    /**
     * @todo H-3363 account for inherited label properties
     */
    return type.labelProperty && proposedEntity.properties[type.labelProperty]
      ? [type.labelProperty]
      : [];
  });

  const nameProperties = [
    "name",
    "legal name",
    "preferred name",
    "profile url",
    "shortname",
    "organization name",
  ];
  for (const [key, schema] of entityTypes.flatMap((entityType) =>
    typedEntries(entityType.properties),
  )) {
    if (
      nameProperties.includes(
        "items" in schema
          ? schema.items.title.toLowerCase()
          : schema.title.toLowerCase(),
      ) &&
      proposedEntity.properties[key]
    ) {
      propertyBaseUrlsToMatchOn.push(key);
    }
  }

  /** Create the filters for any of label or name-like property values */
  const semanticDistanceFilters: CosineDistanceFilter[] =
    propertyBaseUrlsToMatchOn
      .map((baseUrl) => {
        const foundEmbedding = embeddings.find(
          (embedding) => embedding.property === baseUrl,
        )?.embedding;

        if (!foundEmbedding) {
          logger.error(
            `Could not find embedding for property ${baseUrl} – skipping`,
          );
          return null;
        }

        return {
          cosineDistance: [
            { path: ["embedding"] },
            {
              parameter: foundEmbedding,
            },
            { parameter: maximumSemanticDistance },
          ],
        } satisfies CosineDistanceFilter;
      })
      .filter(<T>(filter: T): filter is NonNullable<T> => filter !== null);

  let potentialMatches: HashEntity[] | undefined;

  if (semanticDistanceFilters.length > 0) {
    potentialMatches = await queryEntities(
      { graphApi: graphApiClient },
      { actorId },
      {
        filter: {
          all: [
            ...existingEntityBaseAllFilter,
            {
              any: semanticDistanceFilters,
            },
          ],
        },
        temporalAxes: currentTimeInstantTemporalAxes,
        includeDrafts,
        includePermissions: false,
      },
    ).then(({ entities }) =>
      entities.slice(0, 3).map((entity) => new HashEntity(entity)),
    );
  }

  if (!potentialMatches?.length) {
    // If we didn't find a match on individual properties, try matching on the entire properties object
    const propertyObjectEmbedding = embeddings.find(
      (embedding) => !embedding.property,
    );

    if (!propertyObjectEmbedding) {
      logger.error(`Could not find embedding for properties object – skipping`);
    } else {
      potentialMatches = await queryEntities(
        { graphApi: graphApiClient },
        { actorId },
        {
          filter: {
            all: [
              ...existingEntityBaseAllFilter,
              {
                cosineDistance: [
                  { path: ["embedding"] },
                  {
                    parameter: propertyObjectEmbedding.embedding,
                  },
                  { parameter: maximumSemanticDistance },
                ],
              },
            ],
          },
          temporalAxes: currentTimeInstantTemporalAxes,
          includeDrafts,
          includePermissions: false,
        },
      ).then(({ entities }) =>
        entities.slice(0, 3).map((entity) => new HashEntity(entity)),
      );
    }
  }

  if (!potentialMatches?.length) {
    return null;
  }

  const match = await matchExistingEntity({
    isLink: false,
    entities: {
      newEntity: {
        ...proposedEntity,
        propertiesMetadata: proposedEntity.propertyMetadata,
        editionSources: proposedEntity.provenance.sources ?? [],
      },
      potentialMatches,
    },
  });

  return match;
};

export const findExistingLinkEntity = async ({
  actorId,
  graphApiClient,
  includeDrafts,
  linkData,
  webId,
  proposedEntity,
}: {
  actorId: ActorEntityUuid;
  graphApiClient: GraphApi;
  includeDrafts: boolean;
  linkData: LinkData;
  webId: WebId;
  proposedEntity: Pick<
    ProposedEntity,
    "entityTypeIds" | "properties" | "propertyMetadata" | "provenance"
  >;
}): Promise<MatchedEntityUpdate<HashEntity> | null> => {
  const { entities: linksWithOverlappingTypes } = await queryEntities(
    { graphApi: graphApiClient },
    { actorId },
    {
      filter: {
        all: [
          { equal: [{ path: ["archived"] }, { parameter: false }] },
          {
            any: proposedEntity.entityTypeIds.map((entityTypeId) => ({
              equal: [
                { path: ["type", "versionedUrl"] },
                { parameter: entityTypeId },
              ],
            })),
          },
          {
            equal: [
              { path: ["webId"] },
              {
                parameter: webId,
              },
            ],
          },
          {
            equal: [
              {
                path: ["leftEntity", "webId"],
              },
              {
                parameter: extractWebIdFromEntityId(linkData.leftEntityId),
              },
            ],
          },
          {
            equal: [
              {
                path: ["leftEntity", "uuid"],
              },
              {
                parameter: extractEntityUuidFromEntityId(linkData.leftEntityId),
              },
            ],
          },
          {
            equal: [
              {
                path: ["rightEntity", "webId"],
              },
              {
                parameter: extractWebIdFromEntityId(linkData.rightEntityId),
              },
            ],
          },
          {
            equal: [
              {
                path: ["rightEntity", "uuid"],
              },
              {
                parameter: extractEntityUuidFromEntityId(
                  linkData.rightEntityId,
                ),
              },
            ],
          },
        ],
      },
      temporalAxes: currentTimeInstantTemporalAxes,
      includeDrafts,
      includePermissions: false,
    },
  );

  if (!linksWithOverlappingTypes.length) {
    return null;
  }

  const newInputHasNoProperties =
    Object.keys(proposedEntity.properties).length === 0;

  if (newInputHasNoProperties) {
    const newInputTypeSet = new Set(proposedEntity.entityTypeIds);

    /**
     * If the new input has no properties, we look for an existing link with the same type(s) which also has no properties.
     * If we find it, we will take it as a match, on the basis that the only meaningful information present (types) matches.
     * We'll merge the sources listed for the edition to capture the fact that we inferred this link from multiple sources.
     */
    const potentialMatchWithNoProperties = linksWithOverlappingTypes.find(
      (entity) => {
        if (Object.keys(entity.properties).length !== 0) {
          return false;
        }

        const potentialMatchTypeSet = new Set(entity.metadata.entityTypeIds);

        return (
          newInputTypeSet.size === potentialMatchTypeSet.size &&
          newInputTypeSet.isSupersetOf(potentialMatchTypeSet)
        );
      },
    );

    if (potentialMatchWithNoProperties) {
      return {
        existingEntity: potentialMatchWithNoProperties,
        newValues: {
          entityTypeIds: proposedEntity.entityTypeIds,
          propertyMetadata: proposedEntity.propertyMetadata,
          editionSources: deduplicateSources([
            ...(proposedEntity.provenance.sources ?? []),
            ...(potentialMatchWithNoProperties.metadata.provenance.edition
              .sources ?? []),
          ]),
          properties: {},
        },
      };
    } else {
      /**
       * If all the existing links either have some properties or don't have the exact same set of types,
       * we'll err on the safe side and not pick one to apply the new input as an update to.
       */
      return null;
    }
  }

  /**
   * If we've reached here, the new input has some properties
   */
  const potentialMatchesWithProperties = linksWithOverlappingTypes.filter(
    (entity) => Object.keys(entity.properties).length > 0,
  );

  if (!potentialMatchesWithProperties.length) {
    /**
     * If none of the existing links have property values,
     * we'll err on the safe side and not pick one to apply the new input as an update to.
     */
    return null;
  }

  const match = await matchExistingEntity({
    isLink: false,
    entities: {
      newEntity: {
        ...proposedEntity,
        propertiesMetadata: proposedEntity.propertyMetadata,
        editionSources: proposedEntity.provenance.sources ?? [],
      },
      potentialMatches: potentialMatchesWithProperties,
    },
  });

  return match;
};
