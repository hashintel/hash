import { getEntityRevisionsByEntityId } from "@blockprotocol/graph/stdlib";

import {
  isDraftBlockEntity,
  textualContentPropertyTypeBaseUrl,
} from "./entity-store.js";

import type {
  DraftEntity,
  EntityStore,
  EntityStoreType,
} from "./entity-store.js";
import type {
  Block,
  BlockCollection as BlockCollectionGql,
} from "./graphql/api-types.gen.js";
import type { HasSpatiallyPositionedContent } from "./system-types/canvas.js";
import type { HasIndexedContent, Text } from "./system-types/shared.js";
import type { TextToken } from "./types.js";
import type { Subgraph } from "@blockprotocol/graph";
import type { Entity, EntityId, LinkEntity } from "@blockprotocol/type-system";

export type BlockEntity = Omit<Block, "blockChildEntity"> & {
  blockChildEntity: Entity;
};

export interface BlockCollectionContentItem {
  linkEntity:
    | LinkEntity<HasIndexedContent>
    | LinkEntity<HasSpatiallyPositionedContent>;
  rightEntity: BlockEntity;
}

export type BlockCollection = Omit<BlockCollectionGql, "contents"> & {
  contents: BlockCollectionContentItem[];
};

export type TextProperties = Record<
  typeof textualContentPropertyTypeBaseUrl,
  TextToken[]
>;

export type TextEntityStoreEntity = Omit<EntityStoreType, "properties"> & {
  properties: TextProperties;
};

export type TextWithTokens = Omit<Text, "properties"> & {
  properties: TextProperties;
};

export const isRichTextProperties = (
  // oxlint-disable-next-line typescript/no-restricted-types -- type guard over arbitrary property values, narrowed by the check below
  properties: Record<string, unknown>,
): properties is TextEntityStoreEntity["properties"] =>
  textualContentPropertyTypeBaseUrl in properties &&
  Array.isArray(properties[textualContentPropertyTypeBaseUrl]);

export const getEntityChildEntity = (
  draftId: string,
  draftEntityStore: EntityStore["draft"],
): DraftEntity | null => {
  const entity = draftEntityStore[draftId];
  if (entity === undefined) {
    throw new Error("invariant: missing entity");
  }

  const childDraftId = entity.blockChildEntity?.draftId;

  if (childDraftId === undefined || childDraftId === "") {
    return null;
  }

  return draftEntityStore[childDraftId] ?? null;
};

export const getBlockChildEntity = (
  draftBlockId: string,
  entityStore: EntityStore,
): DraftEntity | null => {
  const blockEntity = entityStore.draft[draftBlockId];

  if (!isDraftBlockEntity(blockEntity)) {
    throw new Error("Can only get child entity from block entity");
  }

  const childEntity = getEntityChildEntity(
    blockEntity.draftId,
    entityStore.draft,
  );

  if (childEntity === null) {
    throw new Error("Missing entity from draft store");
  }

  return childEntity;
};

export const getFirstEntityRevision = (
  subgraph: Subgraph,
  entityId: EntityId,
): Entity => {
  const entityRevisions = getEntityRevisionsByEntityId(subgraph, entityId);

  const [firstRevision] = entityRevisions;

  if (firstRevision === undefined) {
    throw new Error("Could not find entity revisions in subgraph");
  }

  let earliestRevision: Entity = firstRevision;

  for (const currentRevision of entityRevisions) {
    const currentCreatedAt = new Date(
      currentRevision.metadata.temporalVersioning.decisionTime.start.limit,
    );

    const previousEarliestRevisionCreatedAt = new Date(
      earliestRevision.metadata.temporalVersioning.decisionTime.start.limit,
    );

    earliestRevision =
      previousEarliestRevisionCreatedAt < currentCreatedAt
        ? earliestRevision
        : currentRevision;
  }

  return earliestRevision;
};
