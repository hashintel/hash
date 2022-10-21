import { Subgraph } from "@hashintel/hash-graph-client";
import {
  EntityTypeVertex,
  EntityVertex,
  PropertyTypeVertex,
} from "@hashintel/hash-shared/graphql/types";
import { EntityType, PropertyType } from "@blockprotocol/type-system-web";
import {
  EntityTypeModel,
  LinkTypeModel,
  PropertyTypeModel,
} from "../../../model";
import {
  PersistedEntityType as PersistedEntityTypeGql,
  PersistedLinkType as PersistedLinkTypeGql,
  PersistedPropertyType as PersistedPropertyTypeGql,
  Subgraph as SubgraphGql,
} from "../../apiTypes.gen";

export const mapPropertyTypeModelToGQL = (
  propertyType: PropertyTypeModel,
): PersistedPropertyTypeGql => ({
  ownedById: propertyType.ownedById,
  accountId: propertyType.ownedById,
  propertyTypeId: propertyType.schema.$id,
  propertyType: propertyType.schema,
});

export const mapLinkTypeModelToGQL = (
  linkType: LinkTypeModel,
): PersistedLinkTypeGql => ({
  ownedById: linkType.ownedById,
  accountId: linkType.ownedById,
  linkTypeId: linkType.schema.$id,
  linkType: linkType.schema,
});

export const mapEntityTypeModelToGQL = (
  entityType: EntityTypeModel,
): PersistedEntityTypeGql => ({
  ownedById: entityType.ownedById,
  accountId: entityType.ownedById,
  entityTypeId: entityType.schema.$id,
  entityType: entityType.schema,
});

/** @todo - move this outside of ontology */
/**
 * @todo and a warning, this mapping function is here to compensate for
 *   the differences between the Graph API package and the
 *   type system package.
 *
 *   The type system package can be considered the source of truth in
 *   terms of the shape of values returned from the API, but the API
 *   client is unable to be given as type package types - it generates
 *   its own types.
 *   https://app.asana.com/0/1202805690238892/1202892835843657/f
 */
export const mapSubgraphToGql = (subgraph: Subgraph): SubgraphGql => {
  return {
    ...subgraph,
    vertices: Object.fromEntries(
      Object.entries(subgraph.vertices).map(([identifier, vertex]) => {
        switch (vertex.kind) {
          // These types are compatible with the Type System package's types
          case "dataType":
          case "linkType":
          case "link": {
            return [identifier, vertex];
          }
          case "entity": {
            const persistedEntity = vertex.inner;
            const entityVertex: EntityVertex = {
              kind: vertex.kind,
              inner: {
                accountId: persistedEntity.metadata.identifier.ownedById,
                entityId: persistedEntity.metadata.identifier.entityId,
                /** @todo - How bad an idea is this right now */
                entityType: null as any,
                entityTypeId: persistedEntity.metadata.entityTypeId,
                entityVersion: persistedEntity.metadata.identifier.version,
                linkedEntities: [],
                ownedById: persistedEntity.metadata.identifier.ownedById,
                properties: persistedEntity.inner,
              },
            };
            return [identifier, entityVertex];
          }
          // The OpenAPI spec currently incorrectly expresses these
          case "propertyType": {
            const propertyTypeVertex: PropertyTypeVertex = {
              kind: vertex.kind,
              inner: {
                ...vertex.inner,
                inner: vertex.inner.inner as PropertyType,
              },
            };
            return [identifier, propertyTypeVertex];
          }
          case "entityType": {
            const entityTypeVertex: EntityTypeVertex = {
              kind: vertex.kind,
              inner: {
                ...vertex.inner,
                inner: vertex.inner.inner as EntityType,
              },
            };
            return [identifier, entityTypeVertex];
          }
        }

        throw new Error(`unknown vertex kind: ${JSON.stringify(vertex)}`);
      }),
    ),
  };
};
