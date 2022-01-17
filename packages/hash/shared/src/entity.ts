import {
  DraftEntity,
  EntityStore,
  EntityStoreType,
  isBlockEntity,
  isDraftBlockEntity,
} from "./entityStore";
import { PageFieldsFragment, Text } from "./graphql/apiTypes.gen";
import { DistributiveOmit, DistributivePick } from "./util";

type ContentsEntity = PageFieldsFragment["properties"]["contents"][number];

export type BlockEntity = DistributiveOmit<ContentsEntity, "properties"> & {
  properties: DistributiveOmit<ContentsEntity["properties"], "entity"> & {
    entity: DistributivePick<
      ContentsEntity["properties"]["entity"] | Text,
      keyof ContentsEntity["properties"]["entity"] &
        keyof (ContentsEntity["properties"]["entity"] | Text)
    >;
  };
};

export const isTextEntity = (
  entity: EntityStoreType | DraftEntity,
): entity is Text => "properties" in entity && "tokens" in entity.properties;

/**
 * @todo reimplement links
 * @todo reduce duplication
 */
export const getTextEntityFromDraftBlock = (
  draftBlockId: string,
  entityStore: EntityStore,
): DraftEntity<Text> | null => {
  const blockEntity = entityStore.draft[draftBlockId];

  if (!isDraftBlockEntity(blockEntity)) {
    throw new Error("Can only get text entity from block entity");
  }

  const blockPropertiesEntityDraftId = blockEntity.properties.entity.draftId;
  const blockPropertiesEntity = entityStore.draft[blockPropertiesEntityDraftId];

  if (!blockPropertiesEntity) {
    throw new Error("invariant: missing block entity");
  }

  if (!isTextEntity(blockPropertiesEntity)) {
    return null;
  } else {
    return blockPropertiesEntity;
  }
};

/**
 * @todo reimplement links
 * @todo reduce duplication
 */
export const getTextEntityFromSavedBlock = (
  blockId: string,
  entityStore: EntityStore,
): Text | null => {
  const blockEntity = entityStore.saved[blockId];

  if (!isBlockEntity(blockEntity)) {
    throw new Error("Can only get text entity from block entity");
  }

  const blockPropertiesEntityDraftId = blockEntity.properties.entity.entityId;
  const blockPropertiesEntity = entityStore.saved[blockPropertiesEntityDraftId];

  if (!blockPropertiesEntity) {
    throw new Error("invariant: missing block entity");
  }

  if (!isTextEntity(blockPropertiesEntity)) {
    return null;
  } else {
    return blockPropertiesEntity;
  }
};

export const blockEntityIdExists = (entities: BlockEntity[]) => {
  const ids = new Set(entities.map((block) => block.entityId));

  return (blockEntityId: string | null): blockEntityId is string =>
    !!blockEntityId && ids.has(blockEntityId);
};
