import type { Entity } from "@local/hash-graph-sdk/entity";
import type { EntityTypeWithMetadata } from "@local/hash-graph-types/ontology";

export const isItemEntityType = (
  item: Entity | EntityTypeWithMetadata,
): item is EntityTypeWithMetadata => "schema" in item;
