import type {
  DataTypeWithMetadata,
  Entity,
  EntityTypeWithMetadata,
  PropertyTypeWithMetadata,
} from "@blockprotocol/type-system";
import { includesPageEntityTypeId } from "@local/hash-isomorphic-utils/page-entity-type-ids";

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

export const isTypeDataType = (
  type:
    | EntityTypeWithMetadata
    | PropertyTypeWithMetadata
    | DataTypeWithMetadata,
) => type.schema.kind === "dataType";

export const isEntityPageEntity = (item: Entity) =>
  includesPageEntityTypeId(item.metadata.entityTypeIds);
