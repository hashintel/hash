import {
  DraftEntity,
  EntityStore,
  EntityStoreType,
  isBlockEntity,
  isDraftBlockEntity,
  isDraftEntity,
  isEntity,
} from "./entityStore";
import { PageFieldsFragment, Text } from "./graphql/apiTypes.gen";
import {
  DistributiveOmit,
  DistributivePick,
  flatMapTree,
  isUnknownObject,
} from "./util";

type ContentsEntity = DistributiveOmit<
  PageFieldsFragment["contents"][number],
  "__typename"
>;

export type BlockEntity = DistributiveOmit<ContentsEntity, "properties"> & {
  properties: DistributiveOmit<ContentsEntity["properties"], "entity"> & {
    entity: DistributivePick<
      ContentsEntity["properties"]["entity"] | Text,
      keyof ContentsEntity["properties"]["entity"] &
        keyof (ContentsEntity["properties"]["entity"] | Text)
    >;
  };
};

// @todo make this more robust, checking system type name of entity type
export const isTextEntity = (
  entity: EntityStoreType | DraftEntity,
): entity is Text => "properties" in entity && "tokens" in entity.properties;

export const isDraftTextEntity = (
  entity: DraftEntity,
): entity is DraftEntity<Text> => isTextEntity(entity) && isDraftEntity(entity);

/**
 * @deprecated
 */
type LegacyLink<Type extends EntityStoreType | DraftEntity = EntityStoreType> =
  {
    /**
     * @deprecated
     */
    data: Type;

    /**
     * @deprecated
     */
    __linkedData: {};
  };

/**
 * @deprecated
 */
const isLegacyLink = (data: unknown): data is LegacyLink => {
  return (
    isUnknownObject(data) &&
    "__linkedData" in data &&
    "data" in data &&
    typeof data.data === "object" &&
    isEntity(data.data)
  );
};

export const isTextContainingEntityProperties = (
  entityProperties: unknown,
): entityProperties is { text: LegacyLink<Text> } => {
  return (
    isUnknownObject(entityProperties) &&
    "text" in entityProperties &&
    isLegacyLink(entityProperties.text) &&
    isTextEntity(entityProperties.text.data)
  );
};

// @todo use in more places
export const isDraftTextContainingEntityProperties = (
  entityProperties: unknown,
): entityProperties is { text: LegacyLink<DraftEntity<Text>> } => {
  return (
    isTextContainingEntityProperties(entityProperties) &&
    isDraftEntity(entityProperties.text.data)
  );
};

/**
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

  if (isTextEntity(blockPropertiesEntity)) {
    return blockPropertiesEntity;
  }

  if (isTextContainingEntityProperties(blockPropertiesEntity.properties)) {
    // @todo look into why this was using entityId
    const linkEntity = blockPropertiesEntity.properties.text.data;

    if (!isDraftEntity(linkEntity)) {
      throw new Error("Expected linked entity to be draft");
    }

    const textEntity = entityStore.draft[linkEntity.draftId];

    if (!textEntity || !isTextEntity(textEntity)) {
      throw new Error("Missing text entity from draft store");
    }

    return textEntity;
  }

  return null;
};

/**
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

  if (isTextEntity(blockPropertiesEntity)) {
    return blockPropertiesEntity;
  }

  if (isTextContainingEntityProperties(blockPropertiesEntity.properties)) {
    return blockPropertiesEntity.properties.text.data;
  }

  return null;
};

export const blockEntityIdExists = (entities: BlockEntity[]) => {
  const ids = new Set(entities.map((block) => block.entityId));

  return (blockEntityId: string | null): blockEntityId is string =>
    !!blockEntityId && ids.has(blockEntityId);
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
