import { TextToken } from "@local/hash-graphql-shared/graphql/types";

import {
  DraftEntity,
  EntityStore,
  EntityStoreType,
  isDraftBlockEntity,
  isDraftEntity,
  isEntity,
  TEXT_TOKEN_PROPERTY_TYPE_BASE_URL,
} from "./entity-store";
import { Block } from "./graphql/api-types.gen";
import { flatMapTree } from "./util";

export type BlockEntity = Block;

export type TextProperties = {
  // As TEXT_TOKEN_PROPERTY_TYPE_BASE_URL (and TEXT_TOKEN_PROPERTY_TYPE_ID) are
  // not const the type is just `string`. Not ideal.
  [_ in typeof TEXT_TOKEN_PROPERTY_TYPE_BASE_URL]: TextToken[];
};

export type TextEntityType = Omit<EntityStoreType, "properties"> & {
  properties: TextProperties;
};

// @todo make this more robust
export const isTextProperties =
  (properties: {}): properties is TextEntityType["properties"] =>
    TEXT_TOKEN_PROPERTY_TYPE_BASE_URL in properties;

export const isTextEntity = (
  entity: EntityStoreType | DraftEntity,
): entity is TextEntityType =>
  "properties" in entity &&
  // Draft text entities would not have an entity type ID assigned yet.
  // To have this check, we have to make a seperate check for draft text entities.
  // (entity.entityTypeId ?? "") === TEXT_ENTITY_TYPE_ID &&
  isTextProperties(entity.properties);

export const isDraftTextEntity = (
  entity: DraftEntity,
): entity is DraftEntity<TextEntityType> =>
  isTextEntity(entity) && isDraftEntity(entity);

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
    throw new Error("Can only get text entity from block entity");
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

/**
 * Flatmap a list of BlockEntities
 * @param blockEntities blocks to traverse
 * @param mapFn function to match each entity
 * @returns a list of mapped values
 */
export const flatMapBlocks = <T>(
  blockEntities: BlockEntity[],
  mapFn: (entity: EntityStoreType, block: BlockEntity) => T[],
) => {
  const result = [];

  for (const block of blockEntities) {
    result.push(
      ...flatMapTree(block, (node) => {
        if (isEntity(node)) {
          return mapFn(node, block);
        }

        return [];
      }),
    );
  }

  return result;
};
