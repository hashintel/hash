import type {
  DataTypeWithMetadata,
  EntityTypeWithMetadata,
  PropertyTypeWithMetadata,
} from "@blockprotocol/type-system";
import type { Entity } from "@local/hash-graph-sdk/entity";

export const isItemType = <
  Type extends
    | EntityTypeWithMetadata
    | DataTypeWithMetadata
    | PropertyTypeWithMetadata,
>(
  item: Entity | Type,
): item is Type => "schema" in item;
