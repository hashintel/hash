import type {
  DataTypeWithMetadata,
  Entity,
  EntityTypeWithMetadata,
  PropertyTypeWithMetadata,
} from "@blockprotocol/type-system";

export const isItemType = <
  Type extends
    | EntityTypeWithMetadata
    | DataTypeWithMetadata
    | PropertyTypeWithMetadata,
>(
  item: Entity | Type,
): item is Type => "schema" in item;
