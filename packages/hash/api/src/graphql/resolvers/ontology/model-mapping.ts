import { Subgraph } from "@hashintel/hash-graph-client";
import {
  EntityTypeVertex,
  PropertyTypeVertex,
} from "@hashintel/hash-shared/graphql/types";
import { EntityType, PropertyType } from "@blockprotocol/type-system-web";
import {
  DataTypeModel,
  EntityTypeModel,
  LinkTypeModel,
  PropertyTypeModel,
} from "../../../model";
import {
  PersistedDataType as PersistedDataTypeGql,
  PersistedEntityType as PersistedEntityTypeGql,
  PersistedLinkType as PersistedLinkTypeGql,
  PersistedPropertyType as PersistedPropertyTypeGql,
  EntityTypeRootedSubgraph as EntityTypeRootedSubgraphGql,
  Subgraph as SubgraphGql,
} from "../../apiTypes.gen";

export const mapDataTypeModelToGQL = (
  dataType: DataTypeModel,
): PersistedDataTypeGql => ({
  ownedById: dataType.ownedById,
  accountId: dataType.ownedById,
  dataTypeId: dataType.schema.$id,
  dataType: dataType.schema,
});

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

export const mapEntityTypeRootedSubgraphToGQL = (params: {
  entityType: EntityTypeModel;
  referencedDataTypes: DataTypeModel[];
  referencedPropertyTypes: PropertyTypeModel[];
  referencedLinkTypes: LinkTypeModel[];
  referencedEntityTypes: EntityTypeModel[];
}): EntityTypeRootedSubgraphGql => ({
  ownedById: params.entityType.ownedById,
  accountId: params.entityType.ownedById,
  entityTypeId: params.entityType.schema.$id,
  entityType: params.entityType.schema,
  referencedDataTypes: params.referencedDataTypes.map(mapDataTypeModelToGQL),
  referencedPropertyTypes: params.referencedPropertyTypes.map(
    mapPropertyTypeModelToGQL,
  ),
  referencedLinkTypes: params.referencedLinkTypes.map(mapLinkTypeModelToGQL),
  referencedEntityTypes: params.referencedEntityTypes.map(
    mapEntityTypeModelToGQL,
  ),
});

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
          case "DATA_TYPE" || "LINK_TYPE" || "ENTITY" || "LINK": {
            return [identifier, vertex];
          }
          // The OpenAPI spec currently incorrectly expresses these
          case "PROPERTY_TYPE": {
            const propertyTypeVertex: PropertyTypeVertex = {
              kind: vertex.kind,
              inner: {
                ...vertex.inner,
                inner: vertex.inner.inner as PropertyType,
              },
            };
            return [identifier, propertyTypeVertex];
          }
          case "ENTITY_TYPE": {
            const entityTypeVertex: EntityTypeVertex = {
              kind: vertex.kind,
              inner: {
                ...vertex.inner,
                inner: vertex.inner.inner as EntityType,
              },
            };
            return [identifier, entityTypeVertex];
          }
          // TypeScript is failing to recognize this is unreachable (due to the combined initial case) and therefore
          // thinks the function can return undefined without it
          default: {
            throw new Error(
              `this should be unreachable, unknown vertex kind: ${vertex.kind}`,
            );
          }
        }
      }),
    ),
  };
};
