import type {
  EntityType,
  PropertyType,
  VersionedUrl,
} from "@blockprotocol/type-system";
import type { BaseUrl } from "@local/hash-subgraph";
import {
  getEntityTypeAndParentsById,
  getPropertyTypeById,
} from "@local/hash-subgraph/stdlib";
import { useMemo } from "react";

import type { EntityTypeEntitiesContextValue } from "../entity-type-entities-context";
import { useEntityTypeEntities } from "../use-entity-type-entities";

export const useEntityTypeEntitiesContextValue = (params: {
  entityTypeBaseUrl?: BaseUrl;
  entityTypeId?: VersionedUrl;
}): EntityTypeEntitiesContextValue => {
  const { entityTypeBaseUrl, entityTypeId } = params;

  const { subgraph, entities, hadCachedContent, loading, refetch } =
    useEntityTypeEntities({
      entityTypeBaseUrl,
      entityTypeId,
      graphResolveDepths: {
        constrainsLinksOn: { outgoing: 255 },
        constrainsLinkDestinationsOn: { outgoing: 255 },
        constrainsPropertiesOn: { outgoing: 255 },
        constrainsValuesOn: { outgoing: 255 },
        inheritsFrom: { outgoing: 255 },
        isOfType: { outgoing: 1 },
      },
    });

  const [entityTypes, propertyTypes] = useMemo(() => {
    if (!subgraph || !entities) {
      return [];
    }

    const relevantTypesMap = new Map<string, EntityType>();
    for (const { metadata } of entities) {
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
    entityTypeBaseUrl,
    entityTypeId,
    entities,
    entityTypes,
    hadCachedContent,
    loading,
    propertyTypes,
    refetch,
    subgraph,
  };
};
