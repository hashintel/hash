import { produce } from "immer";
import { v4 as uuid } from "uuid";
import { AnyEntity, BlockEntity } from "./entity";
import { DistributiveOmit } from "./util";

// @todo should AnyEntity include BlockEntity, and should this just be AnyEntity
export type EntityStoreType = BlockEntity | AnyEntity;

export type DraftEntityStoreType = Partial<
  DistributiveOmit<EntityStoreType, "entityId">
> & {
  entityId: EntityStoreType["entityId"] | null;
  draftId: string;
};

export type EntityStore = {
  saved: Record<string, EntityStoreType>;
  // @todo typing here doesn't quite work
  draft: Record<string, DraftEntityStoreType>;
};

/**
 * @todo should be more robust
 */
export const isEntity = (value: unknown): value is EntityStoreType =>
  typeof value === "object" && value !== null && "entityId" in value;

type EntityLink<
  EntityType extends EntityStoreType | DraftEntityStoreType = EntityStoreType
> = {
  __linkedData: unknown;
  data: EntityType | EntityType[];
};

export const isEntityLink = <
  EntityType extends EntityStoreType | DraftEntityStoreType = EntityStoreType
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
  "entity" in entity.properties &&
  isEntity(entity.properties.entity);

export const createEntityStore = (
  contents: EntityStoreType[],
  draftData: Record<string, DraftEntityStoreType>
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

    // @ts-expect-error
    draft[draftId] = produce(entity, (draftEntity) => {
      // @ts-expect-error
      draftEntity.draftId = draftId;

      if (draftData[draftId]) {
        Object.assign(
          draftEntity,
          JSON.parse(JSON.stringify(draftData[draftId]))
        );
      }

      if (isBlockEntity(draftEntity)) {
        // @ts-expect-error
        draftEntity.properties.entity.draftId =
          entityToDraft[draftEntity.properties.entity.entityId];
      }
    });
  }

  return { saved, draft };
};
