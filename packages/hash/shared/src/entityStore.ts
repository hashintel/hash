import { BlockEntity, MappedEntity } from "./types";

// @todo clean up this type
export type EntityStoreType = BlockEntity | MappedEntity;

export type EntityStore = Record<string, EntityStoreType>;

export const isBlockEntity = (entity: EntityStoreType): entity is BlockEntity =>
  "properties" in entity &&
  "__typename" in entity &&
  entity.__typename === "Block";

/**
 * Should only be used by createEntityStore – needs to be called with flatMap
 *
 * @todo this needs to descend the entire tree – not just the direct descendent
 *       of blocks
 */
const mapEntityToEntityStoreItems = <T extends EntityStoreType>(
  entity: T
): [string, EntityStoreType][] => [
  [entity.entityId, entity],
  ...(isBlockEntity(entity)
    ? mapEntityToEntityStoreItems(entity.properties.entity)
    : []),
];

export const createEntityStore = (contents: EntityStoreType[]): EntityStore =>
  Object.fromEntries(contents.flatMap(mapEntityToEntityStoreItems));
