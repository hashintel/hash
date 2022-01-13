import { Draft, produce } from "immer";
import { BlockEntity } from "./entity";
import { DistributiveOmit, typeSafeEntries } from "./util";

export type EntityStoreType = BlockEntity | BlockEntity["properties"]["entity"];

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

// @todo does this need to be more robust?
export const isBlockEntity = (entity: unknown): entity is BlockEntity =>
  isEntity(entity) &&
  "properties" in entity &&
  entity.properties &&
  "entity" in entity.properties &&
  isEntity(entity.properties.entity);

export const isDraftBlockEntity = (
  entity: unknown,
): entity is DraftEntity<BlockEntity> =>
  isBlockEntity(entity) && "draftId" in entity;

/**
 * @todo we could store a map of entity id <-> draft id to make this easier
 */
export const draftEntityForEntityId = (
  draft: EntityStore["draft"],
  entityId: string,
) => Object.values(draft).find((entity) => entity.entityId === entityId);

export const walkObjectValueForEntity = <T extends {}>(
  value: T,
  entityHandler: <E extends EntityStoreType>(entity: E) => E,
): T => {
  let changed = false;
  let result = value;

  for (const [key, innerValue] of typeSafeEntries(value)) {
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    const nextValue = walkValueForEntity(innerValue, entityHandler);

    if (nextValue !== innerValue) {
      if (!changed) {
        result = (Array.isArray(value) ? [...value] : { ...value }) as T;
      }

      changed = true;
      result[key] = nextValue;
    }
  }

  if (isEntity(value)) {
    const nextValue = entityHandler(value);

    if (nextValue !== value) {
      changed = true;
      result = nextValue;
    }
  }

  return changed ? result : value;
};

/**
 * @deprecated
 * @todo remove this when we have a flat entity store
 */
export const walkValueForEntity = <T>(
  value: T,
  entityHandler: <E extends EntityStoreType>(entity: E) => E,
): T => {
  if (typeof value !== "object" || value === null) {
    return value;
  }

  return walkObjectValueForEntity(value, entityHandler);
};

const findEntities = (contents: EntityStoreType[]) => {
  const entities: EntityStoreType[] = [];

  walkValueForEntity(contents, (entity) => {
    if (isBlockEntity(entity)) {
      entities.push(entity, entity.properties.entity);
    }
    return entity;
  });

  return entities;
};

/**
 * @todo restore dealing with links
 * @todo this should be flat – so that we don't have to traverse links
 */
export const createEntityStore = (
  contents: EntityStoreType[],
  draftData: Record<string, DraftEntity>,
): EntityStore => {
  const saved: EntityStore["saved"] = {};
  const draft: EntityStore["draft"] = {};

  const entityToDraft: Record<string, string> = {};

  for (const row of Object.values(draftData)) {
    if (row.entityId) {
      entityToDraft[row.entityId] = row.draftId;
    }
  }
  const entities = findEntities(contents);

  for (const entity of entities) {
    if (!entityToDraft[entity.entityId]) {
      entityToDraft[entity.entityId] = `draft-${entity.entityId}`;
    }
  }

  for (const entity of entities) {
    saved[entity.entityId] = entity;
    const draftId = entityToDraft[entity.entityId];

    /**
     * We current violate Immer's rules, as properties inside entities can be
     * other entities themselves, and we expect `entity.property.entity` to be
     * the same object as the other entity. We either need to change that, or
     * remove immer, or both.
     *
     * @todo address this
     * @see https://immerjs.github.io/immer/pitfalls#immer-only-supports-unidirectional-trees
     */
    draft[draftId] = produce<DraftEntity>(
      { ...entity, draftId },
      (draftEntity: Draft<DraftEntity>) => {
        if (draftData[draftId]) {
          Object.assign(draftEntity, draftData[draftId]);
        }
      },
    );

    draft[draftId] = produce<DraftEntity>(
      draft[draftId],
      (draftEntity: Draft<DraftEntity>) => {
        if (isDraftBlockEntity(draftEntity)) {
          const innerEntityId = draftEntity.properties.entity.entityId;
          if (innerEntityId) {
            draftEntity.properties.entity.draftId =
              entityToDraft[innerEntityId];
          } else {
            throw new Error("entity id does not exist when expected to");
          }
        }
      },
    );
  }

  return { saved, draft };
};
