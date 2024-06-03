import type { EntityTypeWithMetadata } from "@local/hash-graph-types/ontology";
import type { Entity } from "@local/hash-subgraph";

export const isItemEntityType = (
  item: Entity | EntityTypeWithMetadata,
): item is EntityTypeWithMetadata => "schema" in item;
