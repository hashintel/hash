import type { ApolloQueryResult } from "@apollo/client";
import type {
  EntityType,
  PropertyType,
  VersionedUrl,
} from "@blockprotocol/type-system";
import type { EntityQueryCursor } from "@local/hash-graph-client";
import type {
  CreatedByIdsMap,
  Entity,
  TypeIdsMap,
  WebIdsMap,
} from "@local/hash-graph-sdk/entity";
import type { BaseUrl } from "@local/hash-graph-types/ontology";
import type { EntityRootType, Subgraph } from "@local/hash-subgraph";
import {
  getEntityTypeAndParentsById,
  getPropertyTypeById,
} from "@local/hash-subgraph/stdlib";
import { useMemo } from "react";

import type { GetEntitySubgraphQuery } from "../../../graphql/api-types.gen";
import { useEntityTypeEntities } from "../../../shared/use-entity-type-entities";

export type EntitiesVisualizerData = {
  createdByIds?: CreatedByIdsMap | null;
  editionCreatedByIds?: CreatedByIdsMap | null;
  count?: number | null;
  cursor?: EntityQueryCursor | null;
  entityTypeId?: VersionedUrl;
  entityTypeBaseUrl?: BaseUrl;
  entities?: Entity[];
  entityTypes?: EntityType[];
  // Whether or not cached content was available immediately for the context data
  hadCachedContent: boolean;
  /**
   * Whether or not a network request is in process.
   * Note that if is hasCachedContent is true, data for the given query is available before loading is complete.
   * The cached content will be replaced automatically and the value updated when the network request completes.
   */
  loading: boolean;
  refetch: () => Promise<ApolloQueryResult<GetEntitySubgraphQuery>>;
  propertyTypes?: PropertyType[];
  subgraph?: Subgraph<EntityRootType>;
  typeIds?: TypeIdsMap | null;
  webIds?: WebIdsMap | null;
};

export const useEntitiesVisualizerData = (params: {
  cursor?: EntityQueryCursor;
  entityTypeBaseUrl?: BaseUrl;
  entityTypeId?: VersionedUrl;
  limit?: number;
}): EntitiesVisualizerData => {
  const { cursor, entityTypeBaseUrl, entityTypeId, limit } = params;

  const {
    count,
    createdByIds,
    cursor: nextCursor,
    editionCreatedByIds,
    subgraph,
    entities,
    hadCachedContent,
    loading,
    refetch,
    typeIds,
    webIds,
  } = useEntityTypeEntities({
    cursor,
    entityTypeBaseUrl,
    entityTypeId,
    limit,
    graphResolveDepths: {
      constrainsLinksOn: { outgoing: 255 },
      constrainsLinkDestinationsOn: { outgoing: 255 },
      constrainsPropertiesOn: { outgoing: 255 },
      constrainsValuesOn: { outgoing: 255 },
      inheritsFrom: { outgoing: 255 },
      isOfType: { outgoing: 1 },
      hasLeftEntity: { outgoing: 1, incoming: 1 },
      hasRightEntity: { outgoing: 1, incoming: 1 },
    },
  });

  const [entityTypes, propertyTypes] = useMemo(() => {
    if (!subgraph || !entities) {
      return [];
    }

    const relevantTypesMap = new Map<string, EntityType>();
    for (const { metadata } of entities) {
      for (const typeId of metadata.entityTypeIds) {
        if (!relevantTypesMap.has(typeId)) {
          const types = getEntityTypeAndParentsById(subgraph, typeId);
          for (const { schema } of types) {
            relevantTypesMap.set(schema.$id, schema);
          }
        }
      }
    }

    const relevantTypes = Array.from(relevantTypesMap.values());

    const relevantPropertiesMap = new Map<string, PropertyType>();
    for (const { properties } of relevantTypes) {
      for (const prop of Object.values(properties)) {
        const propertyUrl = "items" in prop ? prop.items.$ref : prop.$ref;
        if (!relevantPropertiesMap.has(propertyUrl)) {
          const propertyType = getPropertyTypeById(
            subgraph,
            propertyUrl,
          )?.schema;
          if (propertyType) {
            relevantPropertiesMap.set(propertyUrl, propertyType);
          }
        }
      }
    }
    const relevantProperties = Array.from(relevantPropertiesMap.values());

    return [relevantTypes, relevantProperties];
  }, [subgraph, entities]);

  return {
    count,
    createdByIds,
    cursor: nextCursor,
    editionCreatedByIds,
    entities,
    entityTypeBaseUrl,
    entityTypeId,
    entityTypes,
    hadCachedContent,
    loading,
    propertyTypes,
    refetch,
    subgraph,
    typeIds,
    webIds,
  };
};
