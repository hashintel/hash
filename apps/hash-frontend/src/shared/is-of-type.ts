import type {
  DataTypeWithMetadata,
  EntityTypeWithMetadata,
  PropertyTypeWithMetadata,
} from "@blockprotocol/type-system";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
import { includesPageEntityTypeId } from "@local/hash-isomorphic-utils/page-entity-type-ids";

export const isType = (
  item:
    | HashEntity
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

export const isEntityPageEntity = (item: HashEntity) =>
  includesPageEntityTypeId(item.metadata.entityTypeIds);
