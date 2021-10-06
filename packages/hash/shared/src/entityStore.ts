import { BlockEntity, MappedEntity } from "./types";

export type EntityStoreType = BlockEntity | MappedEntity;

export type EntityStore = Record<string, EntityStoreType>;

// @todo should be more robust
export const isEntity = (value: unknown): value is EntityStoreType =>
  typeof value === "object" && value !== null && "entityId" in value;

type EntityLink = {
  __linkedData: unknown;
  data: EntityStoreType;
};

export const isEntityLink = (value: unknown): value is EntityLink =>
  typeof value === "object" &&
  value !== null &&
  "__linkedData" in value &&
  "data" in value;

export const isBlockEntity = (entity: unknown): entity is BlockEntity =>
  isEntity(entity) &&
  "properties" in entity &&
  "__typename" in entity &&
  entity.__typename === "Block";

export const createEntityStore = (contents: EntityStoreType[]): EntityStore => {
  const flattenPotentialEntity = (
    value: unknown
  ): [string, EntityStoreType][] => {
    let entities: [string, EntityStoreType][] = [];

    if (isEntityLink(value)) {
      entities = [...entities, [value.data.entityId, value.data]];
    } else if (isBlockEntity(value)) {
      entities = [
        ...entities,
        [value.entityId, value],
        [value.properties.entity.entityId, value.properties.entity],
      ];
    }

    if (typeof value === "object" && value !== null) {
      for (const property of Object.values(value)) {
        entities = [...entities, ...flattenPotentialEntity(property)];
      }
    }

    return entities;
  };

  return Object.fromEntries(contents.flatMap(flattenPotentialEntity));
};
