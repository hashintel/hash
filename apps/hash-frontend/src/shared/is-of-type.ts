import { systemTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import {
  DataTypeWithMetadata,
  Entity,
  EntityTypeWithMetadata,
  PropertyTypeWithMetadata,
} from "@local/hash-subgraph";

export const isType = (
  item:
    | Entity
    | EntityTypeWithMetadata
    | PropertyTypeWithMetadata
    | DataTypeWithMetadata,
): item is
  | EntityTypeWithMetadata
  | PropertyTypeWithMetadata
  | DataTypeWithMetadata => "schema" in item;

export const isTypeEntityType = (
  type:
    | EntityTypeWithMetadata
    | PropertyTypeWithMetadata
    | DataTypeWithMetadata,
) => type.schema.kind === "entityType";

export const isTypePropertyType = (
  type:
    | EntityTypeWithMetadata
    | PropertyTypeWithMetadata
    | DataTypeWithMetadata,
) => type.schema.kind === "propertyType";

export const isEntityPageEntity = (item: Entity) =>
  item.metadata.entityTypeId === systemTypes.entityType.page.entityTypeId;
