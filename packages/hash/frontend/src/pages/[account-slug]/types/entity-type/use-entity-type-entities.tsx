import {
  EntityType,
  PropertyType,
  extractBaseUri,
} from "@blockprotocol/type-system-web";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Entity, Subgraph, SubgraphRootTypes } from "@hashintel/hash-subgraph";
import { getRoots } from "@hashintel/hash-subgraph/src/stdlib/roots";
import { getEntityTypeById } from "@hashintel/hash-subgraph/src/stdlib/element/entity-type";
import { getPropertyTypeById } from "@hashintel/hash-subgraph/src/stdlib/element/property-type";
import { useBlockProtocolAggregateEntities } from "../../../../components/hooks/blockProtocolFunctions/knowledge/useBlockProtocolAggregateEntities";

export type EntityTypeEntitiesContextValue = {
  entities?: Entity[];
  entityTypes?: EntityType[];
  propertyTypes?: PropertyType[];
  subgraph?: Subgraph<SubgraphRootTypes["entity"]>;
};

export const useEntityTypeEntitiesContextValue = (
  typeBaseUri: string | null,
): EntityTypeEntitiesContextValue => {
  const [subgraph, setSubgraph] =
    useState<Subgraph<SubgraphRootTypes["entity"]>>();
  const { aggregateEntities } = useBlockProtocolAggregateEntities();

  useEffect(() => {
    void aggregateEntities({
      data: {
        constrainsValuesOn: 0,
        propertyTypeResolveDepth: 1,
        linkTypeResolveDepth: 0,
        entityTypeResolveDepth: 1,
        linkResolveDepth: 0,
        linkTargetEntityResolveDepth: 0,
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

export const EntityTypeEntitiesContext =
  createContext<null | EntityTypeEntitiesContextValue>(null);

export const useEntityTypeEntities = () => {
  const entityTypeEntitiesContext = useContext(EntityTypeEntitiesContext);

  if (!entityTypeEntitiesContext) {
    throw new Error("no EntityTypeEntitiesContext value has been provided");
  }

  return entityTypeEntitiesContext;
};
