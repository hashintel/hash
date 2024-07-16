import type { Entity, LinkEntity } from "@local/hash-graph-sdk/entity";
import type { EntityId } from "@local/hash-graph-types/entity";
import type { Subgraph } from "@local/hash-subgraph";
import { getEntityRevisionsByEntityId } from "@local/hash-subgraph/stdlib";

import type {
  DraftEntity,
  EntityStore,
  EntityStoreType,
} from "./entity-store.js";
import {
  isDraftBlockEntity,
  textualContentPropertyTypeBaseUrl,
} from "./entity-store.js";
import type {
  Block,
  BlockCollection as BlockCollectionGql,
} from "./graphql/api-types.gen.js";
import type { HasSpatiallyPositionedContent } from "./system-types/canvas.js";
import type { HasIndexedContent, Text } from "./system-types/shared.js";
import type { TextToken } from "./types.js";

export type BlockEntity = Omit<Block, "blockChildEntity"> & {
  blockChildEntity: Entity;
};

export type BlockCollectionContentItem = {
  linkEntity:
    | LinkEntity<HasIndexedContent>
    | LinkEntity<HasSpatiallyPositionedContent>;
  rightEntity: BlockEntity;
};

export type BlockCollection = Omit<BlockCollectionGql, "contents"> & {
  contents: BlockCollectionContentItem[];
};

export type TextProperties = {
  [_ in typeof textualContentPropertyTypeBaseUrl]: TextToken[];
};

export type TextEntityStoreEntity = Omit<EntityStoreType, "properties"> & {
  properties: TextProperties;
};

export type TextWithTokens = Omit<Text, "properties"> & {
  properties: TextProperties;
};

export const isRichTextProperties = (
  properties: Record<string, unknown>,
): properties is TextEntityStoreEntity["properties"] =>
  textualContentPropertyTypeBaseUrl in properties &&
  Array.isArray(
    properties[textualContentPropertyTypeBaseUrl as keyof typeof properties],
  );

export const getEntityChildEntity = (
  draftId: string,
  draftEntityStore: EntityStore["draft"],
) => {
  const entity = draftEntityStore[draftId];
  if (!entity) {
    throw new Error("invariant: missing entity");
  }

  const childEntity = entity.blockChildEntity?.draftId
    ? draftEntityStore[entity.blockChildEntity.draftId]
    : null;

  return childEntity;
};

export const getBlockChildEntity = (
  draftBlockId: string,
  entityStore: EntityStore,
): DraftEntity | null => {
  const blockEntity = entityStore.draft[draftBlockId];

  console.log(JSON.stringify(entityStore, undefined, 2));

  if (!isDraftBlockEntity(blockEntity)) {
    console.log(JSON.stringify(blockEntity, undefined, 2));
    throw new Error("Can only get child entity from block entity");
  }

  const childEntity = getEntityChildEntity(
    blockEntity.draftId,
    entityStore.draft,
  );

  if (!childEntity) {
    throw new Error("Missing entity from draft store");
  }

  return childEntity;
};

export const getFirstEntityRevision = (
  subgraph: Subgraph,
  entityId: EntityId,
) => {
  const entityRevisions = getEntityRevisionsByEntityId(subgraph, entityId);

  if (entityRevisions.length === 0) {
    throw new Error("Could not find entity revisions in subgraph");
  }

  return entityRevisions.reduce<Entity>(
    (previousEarliestRevision, currentRevision) => {
      const currentCreatedAt = new Date(
        currentRevision.metadata.temporalVersioning.decisionTime.start.limit,
      );

      const previousEarliestRevisionCreatedAt = new Date(
        previousEarliestRevision.metadata.temporalVersioning.decisionTime.start.limit,
      );

      return previousEarliestRevisionCreatedAt < currentCreatedAt
        ? previousEarliestRevision
        : currentRevision;
    },
    entityRevisions[0]!,
  );
};
