import { useQuery } from "@apollo/client";
import {
  BaseUrl,
  EntityType,
  PropertyType,
  VersionedUrl,
} from "@blockprotocol/type-system";
import { zeroedGraphResolveDepths } from "@local/hash-isomorphic-utils/graph-queries";
import { mapGqlSubgraphFieldsFragmentToSubgraph } from "@local/hash-isomorphic-utils/types";
import { EntityRootType } from "@local/hash-subgraph";
import {
  getEntityTypeAndParentsById,
  getPropertyTypeById,
  getRoots,
} from "@local/hash-subgraph/stdlib";
import { useMemo } from "react";

import {
  QueryEntitiesQuery,
  QueryEntitiesQueryVariables,
} from "../../graphql/api-types.gen";
import { queryEntitiesQuery } from "../../graphql/queries/knowledge/entity.queries";
import { apolloClient } from "../../lib/apollo-client";
import { EntityTypeEntitiesContextValue } from "../entity-type-entities-context";

export const useEntityTypeEntitiesContextValue = (params: {
  entityTypeBaseUrl?: BaseUrl;
  entityTypeId?: VersionedUrl;
}): EntityTypeEntitiesContextValue => {
  const { entityTypeBaseUrl, entityTypeId } = params;

  const variables = useMemo<QueryEntitiesQueryVariables>(
    () => ({
      operation: {
        multiFilter: {
          filters: [
            ...(entityTypeBaseUrl
              ? [
                  {
                    field: ["metadata", "entityTypeBaseUrl"],
                    operator: "EQUALS" as const,
                    value: entityTypeBaseUrl,
                  },
                ]
              : entityTypeId
              ? [
                  {
                    field: ["metadata", "entityTypeId"],
                    operator: "EQUALS" as const,
                    value: entityTypeId,
                  },
                ]
              : []),
          ],
          operator: "AND",
        },
      },
      ...zeroedGraphResolveDepths,
      constrainsLinksOn: { outgoing: 255 },
      constrainsLinkDestinationsOn: { outgoing: 255 },
      constrainsPropertiesOn: { outgoing: 255 },
      constrainsValuesOn: { outgoing: 255 },
      inheritsFrom: { outgoing: 255 },
      isOfType: { outgoing: 1 },
      includePermissions: false,
    }),
    [entityTypeBaseUrl, entityTypeId],
  );

  const { data, loading, refetch } = useQuery<
    QueryEntitiesQuery,
    QueryEntitiesQueryVariables
  >(queryEntitiesQuery, {
    fetchPolicy: "cache-and-network",
    variables,
  });

  const hadCachedContent = useMemo(
    () => !!apolloClient.readQuery({ query: queryEntitiesQuery, variables }),
    [variables],
  );

  const subgraph = data?.queryEntities.subgraph
    ? mapGqlSubgraphFieldsFragmentToSubgraph<EntityRootType>(
        data.queryEntities.subgraph,
      )
    : undefined;

  const [entities, entityTypes, propertyTypes] = useMemo(() => {
    if (!subgraph) {
      return [];
    }

    const relevantEntities = getRoots(subgraph);

    const relevantTypesMap = new Map<string, EntityType>();
    for (const { metadata } of relevantEntities) {
      if (!relevantTypesMap.has(metadata.entityTypeId)) {
        const types = getEntityTypeAndParentsById(
          subgraph,
          metadata.entityTypeId,
        );
        for (const { schema } of types) {
          relevantTypesMap.set(schema.$id, schema);
        }
      }
    }

    const relevantTypes = Array.from(relevantTypesMap.values());

    const relevantPropertiesMap = new Map<string, PropertyType>();
    for (const { properties } of relevantTypes) {
      for (const prop of Object.values(properties)) {
        const propertyUrl = "items" in prop ? prop.items.$ref : prop.$ref;
        if (!relevantPropertiesMap.has(propertyUrl)) {
          const propertyType = getPropertyTypeById(subgraph, propertyUrl)
            ?.schema;
          if (propertyType) {
            relevantPropertiesMap.set(propertyUrl, propertyType);
          }
        }
      }
    }
    const relevantProperties = Array.from(relevantPropertiesMap.values());

    return [relevantEntities, relevantTypes, relevantProperties];
  }, [subgraph]);

  return {
    entities,
    entityTypes,
    hadCachedContent,
    loading,
    propertyTypes,
    refetch,
    subgraph,
  };
};
