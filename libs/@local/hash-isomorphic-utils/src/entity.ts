import { TextToken } from "@local/hash-isomorphic-utils/types";
import { Entity, EntityId, Subgraph } from "@local/hash-subgraph";
import { getEntityRevisionsByEntityId } from "@local/hash-subgraph/stdlib";

import {
  DraftEntity,
  EntityStore,
  EntityStoreType,
  isDraftBlockEntity,
  textualContentPropertyTypeBaseUrl,
} from "./entity-store";
import { Block } from "./graphql/api-types.gen";

export type BlockEntity = Block;

export type TextProperties = {
  [_ in typeof textualContentPropertyTypeBaseUrl]: TextToken[];
};

export type TextEntityType = Omit<EntityStoreType, "properties"> & {
  properties: TextProperties;
};

const isRichTextProperties = (
  properties: Record<string, unknown>,
): properties is TextEntityType["properties"] =>
  textualContentPropertyTypeBaseUrl in properties &&
  Array.isArray(
    properties[textualContentPropertyTypeBaseUrl as keyof typeof properties],
  );

export const isRichTextContainingEntity = (
  entity: EntityStoreType | DraftEntity,
): entity is TextEntityType =>
  "properties" in entity && isRichTextProperties(entity.properties);

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

  if (!isDraftBlockEntity(blockEntity)) {
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
