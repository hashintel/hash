import {
  EntityType,
  PropertyType,
  extractBaseUri,
} from "@blockprotocol/type-system-web";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Entity } from "../../../../components/hooks/blockProtocolFunctions/knowledge/knowledge-shim";
import { useBlockProtocolAggregateEntities } from "../../../../components/hooks/blockProtocolFunctions/knowledge/useBlockProtocolAggregateEntities";
import {
  getPersistedEntities,
  getPersistedEntityType,
  getPersistedPropertyType,
  Subgraph,
} from "../../../../lib/subgraph";
import { mustBeVersionedUri } from "./util";

export type EntityTypeEntititiesContextValue = {
  entities?: Entity[];
  entityTypes?: EntityType[];
  propertyTypes?: PropertyType[];
  subgraph?: Subgraph;
};

export const useEntityTypeEntitiesContextValue = (
  typeId: string,
): EntityTypeEntititiesContextValue => {
  const [subgraph, setSubgraph] = useState<Subgraph>();
  const { aggregateEntities } = useBlockProtocolAggregateEntities();

  useEffect(() => {
    void aggregateEntities({
      data: {
        dataTypeResolveDepth: 0,
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

      const relevantEntities = getPersistedEntities(subgraph).filter(
        ({ entityTypeId }) =>
          extractBaseUri(mustBeVersionedUri(entityTypeId)) === typeId,
      );

      const relevantTypes = relevantEntities.reduce(
        (typesArray: EntityType[], { entityTypeId }) => {
          const type = getPersistedEntityType(subgraph, entityTypeId)?.inner;

          if (type && !typesArray.find(({ $id }) => $id === entityTypeId)) {
            return [...typesArray, type];
          }

          return typesArray;
        },
        [],
      );

      const relevantProperties: PropertyType[] = [];

      for (const { properties } of relevantTypes) {
        for (const prop of Object.values(properties)) {
          const propertyUri = "items" in prop ? prop.items.$ref : prop.$ref;

          if (!relevantProperties.find(({ $id }) => $id === propertyUri)) {
            const propertyType = getPersistedPropertyType(
              subgraph,
              propertyUri,
            )?.inner;

            if (propertyType) {
              relevantProperties.push(propertyType);
            }
          }
        }
      }

      return [relevantEntities, relevantTypes, relevantProperties];
    }, [subgraph, typeId]) ?? [];

  return {
    entities,
    entityTypes,
    propertyTypes,
    subgraph,
  };
};

export const EntityTypeEntitiesContext =
  createContext<null | EntityTypeEntititiesContextValue>(null);

export const useEntityTypeEntities = () => {
  return useContext(EntityTypeEntitiesContext);
};
