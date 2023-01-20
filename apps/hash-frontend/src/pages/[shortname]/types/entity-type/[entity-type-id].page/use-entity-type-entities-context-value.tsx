import {
  BaseUri,
  EntityType,
  extractBaseUri,
  PropertyType,
} from "@blockprotocol/type-system";
import { Subgraph, SubgraphRootTypes } from "../hash-subgraph/src";
import { getEntityTypeById } from "../hash-subgraph/src/stdlib/element/entity-type";
import { getPropertyTypeById } from "../hash-subgraph/src/stdlib/element/property-type";
import { getRoots } from "../hash-subgraph/src/stdlib/roots";
import { useEffect, useMemo, useState } from "react";

import { useBlockProtocolAggregateEntities } from "../../../../../components/hooks/block-protocol-functions/knowledge/use-block-protocol-aggregate-entities";
import { EntityTypeEntitiesContextValue } from "./shared/entity-type-entities-context";

export const useEntityTypeEntitiesContextValue = (
  typeBaseUri: BaseUri | null,
): EntityTypeEntitiesContextValue => {
  const [subgraph, setSubgraph] =
    useState<Subgraph<SubgraphRootTypes["entity"]>>();
  const { aggregateEntities } = useBlockProtocolAggregateEntities();

  useEffect(() => {
    void aggregateEntities({
      data: {
        graphResolveDepths: {
          constrainsValuesOn: { outgoing: 0 },
          constrainsPropertiesOn: { outgoing: 1 },
          constrainsLinksOn: { outgoing: 0 },
          isOfType: { outgoing: 1 },
          hasLeftEntity: { incoming: 0, outgoing: 0 },
          hasRightEntity: { incoming: 0, outgoing: 0 },
        },
      },
    }).then((res) => {
      if (res.data) {
        setSubgraph(res.data);
      }
    });
  }, [aggregateEntities]);

  const [entities, entityTypes, propertyTypes] =
    useMemo(() => {
      if (!subgraph) {
        return undefined;
      }

      const relevantEntities = getRoots(subgraph).filter(
        ({ metadata: { entityTypeId } }) =>
          extractBaseUri(entityTypeId) === typeBaseUri,
      );

      const relevantTypesMap = new Map<string, EntityType>();
      for (const {
        metadata: { entityTypeId },
      } of relevantEntities) {
        if (!relevantTypesMap.has(entityTypeId)) {
          const type = getEntityTypeById(subgraph, entityTypeId)?.schema;
          if (type) {
            relevantTypesMap.set(entityTypeId, type);
          }
        }
      }
      const relevantTypes = Array.from(relevantTypesMap.values());

      const relevantPropertiesMap = new Map<string, PropertyType>();
      for (const { properties } of relevantTypes) {
        for (const prop of Object.values(properties)) {
          const propertyUri = "items" in prop ? prop.items.$ref : prop.$ref;
          if (!relevantPropertiesMap.has(propertyUri)) {
            const propertyType = getPropertyTypeById(
              subgraph,
              propertyUri,
            )?.schema;
            if (propertyType) {
              relevantPropertiesMap.set(propertyUri, propertyType);
            }
          }
        }
      }
      const relevantProperties = Array.from(relevantPropertiesMap.values());

      return [relevantEntities, relevantTypes, relevantProperties];
    }, [subgraph, typeBaseUri]) ?? [];

  return {
    entities,
    entityTypes,
    propertyTypes,
    subgraph,
  };
};
