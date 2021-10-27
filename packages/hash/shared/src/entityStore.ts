import { Draft, produce } from "immer";
import { v4 as uuid } from "uuid";
import { AnyEntity, BlockEntity } from "./entity";
import { DistributiveOmit } from "./util";

// @todo should AnyEntity include BlockEntity, and should this just be AnyEntity
export type EntityStoreType = BlockEntity | AnyEntity;

type PropertiesType<Properties extends {}> = Properties extends {
  entity: EntityStoreType;
}
  ? DistributiveOmit<Properties, "entity"> & {
      entity: DraftEntity<Properties["entity"]>;
    }
  : Properties;

export type DraftEntity<Type extends EntityStoreType = EntityStoreType> = {
  entityId: Type["entityId"] | null;
  draftId: string;
} & (Type extends { properties: any }
  ? { properties: PropertiesType<Type["properties"]> }
  : {});

export type EntityStore = {
  saved: Record<string, EntityStoreType>;
  draft: Record<string, DraftEntity>;
};

/**
 * @todo should be more robust
 */
export const isEntity = (value: unknown): value is EntityStoreType =>
  typeof value === "object" && value !== null && "entityId" in value;

// @todo remove this entity link stuff
type EntityLink<
  EntityType extends EntityStoreType | DraftEntity = EntityStoreType
> = {
  __linkedData: unknown;
  data: EntityType | EntityType[];
};

export const isEntityLink = <
  EntityType extends EntityStoreType | DraftEntity = EntityStoreType
>(
  value: unknown
): value is EntityLink<EntityType> =>
  typeof value === "object" &&
  value !== null &&
  "__linkedData" in value &&
  "data" in value;

// @todo does this need to be more robust?
export const isBlockEntity = (entity: unknown): entity is BlockEntity =>
  isEntity(entity) &&
  "properties" in entity &&
  entity.properties &&
  "entity" in entity.properties &&
  isEntity(entity.properties.entity);

export const isDraftBlockEntity = (
  entity: unknown
): entity is DraftEntity<BlockEntity> =>
  isBlockEntity(entity) && "draftId" in entity;

export const createEntityStore = (
  contents: EntityStoreType[],
  draftData: Record<string, DraftEntity>
): EntityStore => {
  const saved: EntityStore["saved"] = {};
  const draft: EntityStore["draft"] = {};

  const draftToEntity: Record<string, string | null> = {};
  const entityToDraft: Record<string, string> = {};

  for (const row of Object.values(draftData)) {
    draftToEntity[row.draftId!] = row.entityId;
    if (row.entityId) {
      entityToDraft[row.entityId] = row.draftId;
    }
  }

  const flattenPotentialEntity = (value: unknown): EntityStoreType[] => {
    let entities: EntityStoreType[] = [];

    if (isEntityLink(value)) {
      const linkedEntities = Array.isArray(value.data)
        ? value.data
        : [value.data];

      entities = [...entities, ...linkedEntities];
    } else if (isBlockEntity(value)) {
      entities = [...entities, value, value.properties.entity];
    }

    if (typeof value === "object" && value !== null) {
      for (const property of Object.values(value)) {
        entities = [...entities, ...flattenPotentialEntity(property)];
      }
    }

    return entities;
  };

  const entities = contents.flatMap(flattenPotentialEntity);

  for (const entity of entities) {
    if (!entityToDraft[entity.entityId]) {
      entityToDraft[entity.entityId] = uuid();
    }
  }

  for (const entity of entities) {
    saved[entity.entityId] = entity;
    const draftId = entityToDraft[entity.entityId];

    // @todo need to update links to this entity too / clean this up
    draft[draftId] = produce<DraftEntity>(
      { ...entity, draftId },
      (draftEntity: Draft<DraftEntity>) => {
        if (draftData[draftId]) {
          // @todo do something smarter here
          Object.assign(
            draftEntity,
            JSON.parse(JSON.stringify(draftData[draftId]))
          );
        }

        if (isBlockEntity(draftEntity)) {
          draftEntity.properties.entity.draftId =
            entityToDraft[draftEntity.properties.entity.entityId];
        }
      }
    );
  }

  return { saved, draft };
};
