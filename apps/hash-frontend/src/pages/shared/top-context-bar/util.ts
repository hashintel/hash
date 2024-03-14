import type { Entity, EntityTypeWithMetadata } from "@local/hash-subgraph";

export const isItemEntityType = (
  item: Entity | EntityTypeWithMetadata,
): item is EntityTypeWithMetadata => "schema" in item;
