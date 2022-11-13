import { useQuery } from "@apollo/client";
import {
  EntityType,
  PropertyType,
  extractBaseUri,
} from "@blockprotocol/type-system-web";
import { useMemo } from "react";
import {
  GetAllLatestPersistedEntitiesQuery,
  GetAllLatestPersistedEntitiesQueryVariables,
} from "../../graphql/apiTypes.gen";
import { getAllLatestEntitiesQuery } from "../../graphql/queries/knowledge/entity.queries";
import {
  getPersistedEntities,
  getPersistedEntityType,
  getPersistedPropertyType,
  Subgraph,
} from "../../lib/subgraph";
import { mustBeVersionedUri } from "../../pages/[account-slug]/types/entity-type/util";
import { Entity } from "./blockProtocolFunctions/knowledge/knowledge-shim";

export type EntityTypeEntititiesInfo = {
  loading: boolean;
  entities?: Entity[];
  entityTypes?: EntityType[];
  propertyTypes?: PropertyType[];
  subgraph?: Subgraph;
};

export const useEntityTypeEntities = (
  typeId: string,
): EntityTypeEntititiesInfo => {
  const { data, loading } = useQuery<
    GetAllLatestPersistedEntitiesQuery,
    GetAllLatestPersistedEntitiesQueryVariables
  >(getAllLatestEntitiesQuery, {
    variables: {
      dataTypeResolveDepth: 0,
      propertyTypeResolveDepth: 1,
      linkTypeResolveDepth: 0,
      entityTypeResolveDepth: 1,
      linkResolveDepth: 0,
      linkTargetEntityResolveDepth: 0,
    },
    /** @todo reconsider caching. This is done for testing/demo purposes. */
    fetchPolicy: "no-cache",
  });

  /**
   * @todo: remove casting when we start returning links in the subgraph
   *   https://app.asana.com/0/0/1203214689883095/f
   */
  const { getAllLatestPersistedEntities: subgraph } =
    <{ getAllLatestPersistedEntities: Subgraph }>data ?? {};

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
    loading,
    entities,
    entityTypes,
    propertyTypes,
    subgraph,
  };
};
