import { typedEntries } from "@local/advanced-types/typed-entries";
import type {
  AllFilter,
  CosineDistanceFilter,
  GraphApi,
} from "@local/hash-graph-client";
import type { Entity } from "@local/hash-graph-sdk/entity";
import type { AccountId } from "@local/hash-graph-types/account";
import type { LinkData } from "@local/hash-graph-types/entity";
import type { BaseUrl } from "@local/hash-graph-types/ontology";
import type { OwnedById } from "@local/hash-graph-types/web";
import type { ProposedEntity } from "@local/hash-isomorphic-utils/flows/types";
import {
  currentTimeInstantTemporalAxes,
  fullOntologyResolveDepths,
  generateVersionedUrlMatchingFilter,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import { mapGraphApiSubgraphToSubgraph } from "@local/hash-isomorphic-utils/subgraph-mapping";
import type { EntityTypeRootType } from "@local/hash-subgraph";
import {
  extractEntityUuidFromEntityId,
  extractOwnedByIdFromEntityId,
} from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/stdlib";

import { logger } from "./activity-logger";
import type { DereferencedEntityType } from "./dereference-entity-type";
import { dereferenceEntityType } from "./dereference-entity-type";
import { createEntityEmbeddings } from "./embeddings";
import { getEntityByFilter } from "./get-entity-by-filter";

export const findExistingEntity = async ({
  actorId,
  dereferencedEntityType,
  graphApiClient,
  ownedById,
  proposedEntity,
  includeDrafts,
}: {
  actorId: AccountId;
  dereferencedEntityType?: DereferencedEntityType;
  graphApiClient: GraphApi;
  ownedById: OwnedById;
  proposedEntity: Pick<ProposedEntity, "entityTypeId" | "properties">;
  includeDrafts: boolean;
}): Promise<Entity | undefined> => {
  const entityTypeId = proposedEntity.entityTypeId;

  const entityType: DereferencedEntityType | undefined =
    dereferencedEntityType ??
    (await graphApiClient
      .getEntityTypeSubgraph(actorId, {
        includeDrafts: false,

        filter: {
          equal: [{ path: ["versionedUrl"] }, { parameter: entityTypeId }],
        },
        graphResolveDepths: {
          ...zeroedGraphResolveDepths,
          ...fullOntologyResolveDepths,
        },
        temporalAxes: currentTimeInstantTemporalAxes,
      })
      .then(({ data }) => {
        const subgraph = mapGraphApiSubgraphToSubgraph<EntityTypeRootType>(
          data.subgraph,
          actorId,
        );

        const foundEntityType = getRoots(subgraph)[0];

        if (!foundEntityType) {
          return;
        }

        return dereferenceEntityType({ entityTypeId, subgraph }).schema;
      }));

  if (!entityType) {
    throw new Error(`Could not retrieve EntityType with id ${entityTypeId}`);
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
    propertyTypes: Object.values(entityType.properties).map(
      (propertySchema) => ({
        title:
          "items" in propertySchema
            ? propertySchema.items.title
            : propertySchema.title,
        $id:
          "items" in propertySchema
            ? propertySchema.items.$id
            : propertySchema.$id,
      }),
    ),
  });

  const existingEntityBaseAllFilter = [
    { equal: [{ path: ["archived"] }, { parameter: false }] },
    {
      equal: [
        { path: ["ownedById"] },
        {
          parameter: ownedById,
        },
      ],
    },
    generateVersionedUrlMatchingFilter(entityTypeId),
  ] satisfies AllFilter["all"];

  // starting point for a threshold that will get only values which are a semantic match
  const maximumSemanticDistance = 0.3;

  /**
   * First find suitable specific properties to match on
   */
  const labelProperty = entityType.labelProperty;

  const propertyBaseUrlsToMatchOn: BaseUrl[] =
    labelProperty &&
    entityType.properties[labelProperty] &&
    proposedEntity.properties[labelProperty]
      ? [labelProperty]
      : [];

  const nameProperties = [
    "name",
    "legal name",
    "preferred name",
    "profile url",
    "shortname",
    "organization name",
  ];
  for (const [key, schema] of typedEntries(entityType.properties)) {
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

  let existingEntity: Entity | undefined;

  if (semanticDistanceFilters.length > 0) {
    existingEntity = await getEntityByFilter({
      actorId,
      graphApiClient,
      filter: {
        all: [
          ...existingEntityBaseAllFilter,
          {
            any: semanticDistanceFilters,
          },
        ],
      },
      includeDrafts,
    });
  }

  if (!existingEntity) {
    // If we didn't find a match on individual properties, try matching on the entire properties object
    const propertyObjectEmbedding = embeddings.find(
      (embedding) => !embedding.property,
    );

    if (!propertyObjectEmbedding) {
      logger.error(`Could not find embedding for properties object – skipping`);
    } else {
      existingEntity = await getEntityByFilter({
        actorId,
        graphApiClient,
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
        includeDrafts,
      });
    }
  }

  return existingEntity;
};

export const findExistingLinkEntity = async ({
  actorId,
  graphApiClient,
  linkData,
  ownedById,
  includeDrafts,
}: {
  actorId: AccountId;
  graphApiClient: GraphApi;
  linkData: LinkData;
  ownedById: OwnedById;
  includeDrafts: boolean;
}) => {
  return await getEntityByFilter({
    actorId,
    graphApiClient,
    filter: {
      all: [
        { equal: [{ path: ["archived"] }, { parameter: false }] },
        {
          equal: [
            { path: ["ownedById"] },
            {
              parameter: ownedById,
            },
          ],
        },
        {
          equal: [
            {
              path: ["leftEntity", "ownedById"],
            },
            {
              parameter: extractOwnedByIdFromEntityId(linkData.leftEntityId),
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
              path: ["rightEntity", "ownedById"],
            },
            {
              parameter: extractOwnedByIdFromEntityId(linkData.rightEntityId),
            },
          ],
        },
        {
          equal: [
            {
              path: ["rightEntity", "uuid"],
            },
            {
              parameter: extractEntityUuidFromEntityId(linkData.rightEntityId),
            },
          ],
        },
      ],
    },
    includeDrafts,
  });
};
