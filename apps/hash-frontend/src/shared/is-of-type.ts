import type { Entity } from "@local/hash-graph-sdk/entity";
import type {
  DataTypeWithMetadata,
  EntityTypeWithMetadata,
  PropertyTypeWithMetadata,
} from "@local/hash-graph-types/ontology";
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

export const isEntityPageEntity = (item: Entity) =>
  includesPageEntityTypeId(item.metadata.entityTypeId);
