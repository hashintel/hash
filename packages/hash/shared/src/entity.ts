import {
  DraftEntity,
  EntityStore,
  EntityStoreType,
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
export type LegacyLink<
  Type extends EntityStoreType | DraftEntity = EntityStoreType,
> = {
  /**
   * @deprecated
   */
  data: Type;

  /**
   * @deprecated
   */
  __linkedData: {
    entityTypeId?: string;
    entityId?: string;
  };
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

/**
 * @todo this can be used when a text entity could exist on any property
 * @deprecated
 */
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

/**
 * @todo this can be used when a text entity could exist on any property
 * @deprecated
 */
export const isDraftTextContainingEntityProperties = (
  entityProperties: unknown,
): entityProperties is { text: LegacyLink<DraftEntity<Text>> } => {
  return (
    isTextContainingEntityProperties(entityProperties) &&
    isDraftEntity(entityProperties.text.data)
  );
};

/**
 * @todo this will need to change when we remove legacy links
 */
export const getChildDraftEntityFromTextBlock = (
  draftBlockId: string,
  entityStore: EntityStore,
): DraftEntity | null => {
  const blockEntity = entityStore.draft[draftBlockId];

  if (!isDraftBlockEntity(blockEntity)) {
    throw new Error("Can only get text entity from block entity");
  }

  const blockPropertiesEntityDraftId = blockEntity.properties.entity.draftId;
  const blockPropertiesEntity = entityStore.draft[blockPropertiesEntityDraftId];

  if (!blockPropertiesEntity) {
    throw new Error("invariant: missing block entity");
  }

  if (isTextContainingEntityProperties(blockPropertiesEntity.properties)) {
    // @todo look into why this was using entityId
    const linkEntity = blockPropertiesEntity.properties.text.data;

    if (!isDraftEntity(linkEntity)) {
      throw new Error("Expected linked entity to be draft");
    }

    const textEntity = entityStore.draft[linkEntity.draftId];

    if (!textEntity) {
      throw new Error("Missing text entity from draft store");
    }

    return textEntity;
  }

  return blockPropertiesEntity;
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
