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
import {
  DistributiveOmit,
  DistributivePick,
  flatMapTree,
  isUnknownObject,
} from "./util";

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
// const isLegacyLink = (data: unknown): data is LegacyLink => {
//   return (
//     isUnknownObject(data) &&
//     "__linkedData" in data &&
//     "data" in data &&
//     typeof data.data === "object" &&
//     isEntity(data.data)
//   );
// };

// /**
//  * @todo this can be used when a text entity could exist on any property
//  */
// export const isTextContainingEntityProperties = (
//   entityProperties: unknown,
// ): entityProperties is TextEntityType["properties"] => {
//   return (
//     isUnknownObject(entityProperties) &&
//     TEXT_TOKEN_PROPERTY_TYPE_ID in entityProperties
//   );
// };

// /**
//  * @todo this can be used when a text entity could exist on any property
//  * @deprecated
//  */
// export const isDraftTextContainingEntityProperties = (
//   entityProperties: unknown,
// ): entityProperties is TextEntityType["properties"] => {
//   return isTextContainingEntityProperties(entityProperties);
//   // && isDraftEntity(entityProperties)
// };

/**
 * @todo this will need to change when we remove legacy links
 */
export const getEntityChildEntity = (
  draftId: string,
  draftEntityStore: EntityStore["draft"],
) => {
  const entity = draftEntityStore[draftId];
  if (!entity) {
    throw new Error("invariant: missing entity");
  }

  // if (isTextContainingEntityProperties(entity.properties)) {
  //   const linkEntity = entity.properties.text.data;

  //   if (!isDraftEntity(linkEntity)) {
  //     throw new Error("Expected linked entity to be draft");
  //   }

  //   /** @todo this any type coercion is incorrect, we need to adjust typings https://app.asana.com/0/0/1203099452204542/f */
  //   const textEntity = draftEntityStore[(linkEntity as any).draftId];

  //   if (!textEntity) {
  //     throw new Error("Missing text entity from draft store");
  //   }

  //   return textEntity;
  // }

  const childEntity = entity.dataEntity?.draftId
    ? draftEntityStore[entity.dataEntity.draftId]
    : null;

  if (!childEntity) {
    throw new Error("Missing entity from draft store");
  }

  return childEntity;
};

/**
 * @todo this will need to change when we remove legacy links
 */
export const getBlockChildEntity = (
  draftBlockId: string,
  entityStore: EntityStore,
): DraftEntity | null => {
  const blockEntity = entityStore.draft[draftBlockId];

  if (!isDraftBlockEntity(blockEntity)) {
    throw new Error("Can only get text entity from block entity");
  }

  return getEntityChildEntity(blockEntity.draftId, entityStore.draft);
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
