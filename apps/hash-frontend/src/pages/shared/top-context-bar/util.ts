import { types } from "@local/hash-isomorphic-utils/ontology-types";
import { Entity, EntityTypeWithMetadata } from "@local/hash-subgraph";

export const isItemEntityType = (
  item: Entity | EntityTypeWithMetadata,
): item is EntityTypeWithMetadata => "schema" in item;

export const isEntityPageEntity = (item: Entity) =>
  item.metadata.entityTypeId === types.entityType.page.entityTypeId;
