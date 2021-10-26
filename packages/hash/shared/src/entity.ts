import {
  EntityStore,
  EntityStoreType,
  isBlockEntity,
  isEntityLink,
} from "./entityStore";
import {
  Entity,
  PageFieldsFragment,
  Text,
  UnknownEntity,
} from "./graphql/apiTypes.gen";
import { DistributiveOmit } from "./util";

export type AnyEntity = Entity | UnknownEntity | Text;

type ContentsEntity = PageFieldsFragment["properties"]["contents"][number];

export type BlockEntity = Omit<ContentsEntity, "properties"> & {
  properties: Omit<ContentsEntity["properties"], "entity"> & {
    entity: AnyEntity;
  };
};

export const isTextEntity = (entity: EntityStoreType): entity is Text =>
  "properties" in entity && "texts" in entity.properties;

const isTextEntityContainingEntity = (
  entity: DistributiveOmit<AnyEntity, "properties"> & {
    properties?: unknown;
  }
): entity is DistributiveOmit<AnyEntity, "properties"> & {
  properties: { text: { data: Text } };
} => {
  if (
    "properties" in entity &&
    typeof entity.properties === "object" &&
    entity.properties !== null
  ) {
    const properties: Partial<Record<string, unknown>> = entity.properties;

    return (
      "text" in properties &&
      isEntityLink(properties.text) &&
      // @todo deal with array entity links
      !Array.isArray(properties.text.data) &&
      isTextEntity(properties.text.data)
    );
  }
  return false;
};

/**
 * @todo reimplement links
 */
export const getTextEntityFromDraftBlock = (
  draftBlockId: string,
  entityStore: EntityStore
) => {
  const blockEntity = entityStore.draft[draftBlockId];

  if (!isBlockEntity(blockEntity)) {
    throw new Error("Can only get text entity from block entity");
  }

  // @todo type of this
  const blockPropertiesEntityDraftId = blockEntity.properties.entity.draftId;
  const blockPropertiesEntity = entityStore.draft[blockPropertiesEntityDraftId];

  if (!blockPropertiesEntity) {
    throw new Error("invariant: missing draft entity");
  }

  // @ts-expect-error: isTextEntity needs updating
  if (!isTextEntity(blockPropertiesEntity)) {
    return null;
  } else {
    return blockPropertiesEntity;
  }
};

/**
 * @deprecated
 * @todo need to use draft store
 */
export const getTextEntityFromBlock = (
  blockEntity: BlockEntity
): Text | null => {
  const blockPropertiesEntity = blockEntity.properties.entity;

  if (!isTextEntity(blockPropertiesEntity)) {
    if (isTextEntityContainingEntity(blockPropertiesEntity)) {
      return blockPropertiesEntity.properties.text.data;
    }
  } else {
    return blockPropertiesEntity;
  }

  return null;
};
