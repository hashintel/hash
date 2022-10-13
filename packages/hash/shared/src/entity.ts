import {
  DraftEntity,
  EntityStore,
  EntityStoreType,
  isDraftBlockEntity,
  isDraftEntity,
  isEntity,
  TEXT_TOKEN_PROPERTY_TYPE_ID,
} from "./entityStore";
import { PersistedPageFieldsFragment, Text } from "./graphql/apiTypes.gen";
import { TextToken } from "./graphql/types";
import { DistributiveOmit, DistributivePick, flatMapTree } from "./util";

type ContentsEntity = DistributiveOmit<
  PersistedPageFieldsFragment["contents"][number],
  "__typename"
>;

export type BlockEntity = ContentsEntity & {
  dataEntity: DistributivePick<
    ContentsEntity["dataEntity"] | Text,
    keyof ContentsEntity["dataEntity"] &
      keyof (ContentsEntity["dataEntity"] | Text)
  >;
};

export type TextProperties = {
  [TEXT_TOKEN_PROPERTY_TYPE_ID]: TextToken[];
};

export type TextEntityType = Omit<EntityStoreType, "properties"> & {
  properties: TextProperties;
};

// @todo make this more robust
export const isTextProperties =
  (properties: {}): properties is TextEntityType["properties"] =>
    TEXT_TOKEN_PROPERTY_TYPE_ID in properties;

// @todo make this more robust, checking system type name of entity type
export const isTextEntity = (
  entity: EntityStoreType | DraftEntity,
): entity is TextEntityType =>
  "properties" in entity && isTextProperties(entity.properties);

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

  const childEntity = entity.dataEntity?.draftId
    ? draftEntityStore[entity.dataEntity.draftId]
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
