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

export const isBlockEntity = (entity: unknown): entity is BlockEntity =>
  isEntity(entity) &&
  "properties" in entity &&
  "__typename" in entity &&
  entity.__typename === "Block";

// @todo links within these draft entities need a draft id too
export const createEntityStore = (
  contents: EntityStoreType[],
  draftData: Record<string, DraftEntityStoreType>
): EntityStore => {
  const draftDataRows = Object.values(draftData);

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

  const existingDraftByEntityId = Object.fromEntries(
    draftDataRows.map((row) => [row.entityId, row])
  );

  const savedDraft = Object.fromEntries(
    entities.map((entity) => {
      const existingDraft = existingDraftByEntityId[entity.entityId];
      const id = existingDraft?.draftId ?? uuid();

      return [id, { ...entity, draftId: id }];
    })
  );

  for (const row of draftDataRows) {
    savedDraft[row.draftId] = {
      ...savedDraft[row.draftId],
      ...row,
    };
  }

  return {
    saved: Object.fromEntries(
      entities.map((entity) => [entity.entityId, entity])
    ),
    draft: savedDraft,
  };
};
