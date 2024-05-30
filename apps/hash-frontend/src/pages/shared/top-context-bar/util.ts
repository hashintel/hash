import type { SimpleEntity } from "@local/hash-graph-types/entity";
import type { EntityTypeWithMetadata } from "@local/hash-graph-types/ontology";

export const isItemEntityType = (
  item: SimpleEntity | EntityTypeWithMetadata,
): item is EntityTypeWithMetadata => "schema" in item;
