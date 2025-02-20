import type { Entity } from "@local/hash-graph-sdk/entity";
import type {
  DataTypeWithMetadata,
  EntityTypeWithMetadata,
  PropertyTypeWithMetadata,
} from "@local/hash-graph-types/ontology";

export const isItemType = <
  Type extends
    | EntityTypeWithMetadata
    | DataTypeWithMetadata
    | PropertyTypeWithMetadata,
>(
  item: Entity | Type,
): item is Type => "schema" in item;
