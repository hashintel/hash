import {
  BaseUrl,
  EntityType,
  PropertyType,
  VersionedUrl,
} from "@blockprotocol/type-system";
import { EntityRootType, Subgraph } from "@local/hash-subgraph";
import {
  getEntityTypeAndParentsById,
  getPropertyTypeById,
  getRoots,
} from "@local/hash-subgraph/stdlib";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useBlockProtocolQueryEntities } from "../../components/hooks/block-protocol-functions/knowledge/use-block-protocol-query-entities";
import { EntityTypeEntitiesContextValue } from "../entity-type-entities-context";

export const useEntityTypeEntitiesContextValue = (params: {
  entityTypeBaseUrl?: BaseUrl;
  entityTypeId?: VersionedUrl;
}): EntityTypeEntitiesContextValue => {
  const { entityTypeBaseUrl, entityTypeId } = params;

  const [loading, setLoading] = useState(false);
  const [subgraph, setSubgraph] = useState<Subgraph<EntityRootType>>();
  const { queryEntities } = useBlockProtocolQueryEntities();

  const fetch = useCallback(async () => {
    setLoading(true);

    const { data } = await queryEntities({
      data: {
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
        graphResolveDepths: {
          constrainsPropertiesOn: { outgoing: 255 },
          inheritsFrom: { outgoing: 255 },
          isOfType: { outgoing: 1 },
        },
      },
    }).finally(() => setLoading(false));

    if (data) {
      setSubgraph(data);
    }
  }, [queryEntities, entityTypeBaseUrl, entityTypeId]);

  useEffect(() => {
    void fetch();
  }, [fetch]);

  const [entities, entityTypes, propertyTypes] =
    useMemo(() => {
      if (!subgraph) {
        return undefined;
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
    }, [subgraph]) ?? [];

  return {
    entities,
    entityTypes,
    loading,
    propertyTypes,
    refetch: fetch,
    subgraph,
  };
};
