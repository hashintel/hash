import { Draft, produce } from "immer";
import { BlockEntity, isTextContainingEntityProperties } from "./entity";
import { DistributiveOmit } from "./util";

export type EntityStoreType = BlockEntity | BlockEntity["properties"]["entity"];

type PropertiesType<Properties extends {}> = Properties extends {
  entity: EntityStoreType;
}
  ? DistributiveOmit<Properties, "entity"> & {
      entity: DraftEntity<Properties["entity"]>;
    }
  : Properties;

export type DraftEntity<Type extends EntityStoreType = EntityStoreType> = {
  accountId?: string | null;
  entityId: Type["entityId"] | null;
  entityTypeId?: string | null;
  entityVersionId?: string | null;

  // @todo thinking about removing this – as they're keyed by this anyway
  //  and it makes it complicated to deal with types – should probably just
  //  keep a dict of entity ids to draft ids, and vice versa
  draftId: string;

  entityVersionCreatedAt: string;

  linkGroups?: Type extends { linkGroups: any }
    ? Type["linkGroups"]
    : undefined;
  linkedEntities?: Type extends { linkedEntities: any }
    ? Type["linkedEntities"]
    : undefined;
  linkedAggregations?: Type extends { linkedAggregations: any }
    ? Type["linkedAggregations"]
    : undefined;
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

// @todo does this need to be more robust?
export const isDraftEntity = <T extends EntityStoreType>(
  entity: T | DraftEntity<T>,
): entity is DraftEntity<T> => "draftId" in entity;

export const isDraftBlockEntity = (
  entity: unknown,
): entity is DraftEntity<BlockEntity> =>
  isBlockEntity(entity) && isDraftEntity(entity);

/**
 * @todo we could store a map of entity id <-> draft id to make this easier
 */
export const draftEntityForEntityId = (
  draft: EntityStore["draft"],
  entityId: string,
) => Object.values(draft).find((entity) => entity.entityId === entityId);

const findEntities = (contents: BlockEntity[]): EntityStoreType[] => {
  const entities: EntityStoreType[] = [];

  for (const entity of contents) {
    entities.push(entity, entity.properties.entity);

    if (isTextContainingEntityProperties(entity.properties.entity.properties)) {
      entities.push(entity.properties.entity.properties.text.data);
    }
  }

  return entities;
};

/**
 * @todo remove need to cast in this function
 */
const restoreDraftId = (
  entity: { entityId: string | null; draftId?: string },
  entityToDraft: Record<string, string>,
) => {
  const textEntityId = entity.entityId;

  if (!textEntityId) {
    throw new Error("entity id does not exist when expected to");
  }

  // eslint-disable-next-line no-param-reassign
  (entity as unknown as DraftEntity).draftId = entityToDraft[textEntityId];
};
/**
 * @todo this should be flat – so that we don't have to traverse links
 * @todo clean up
 */
export const createEntityStore = (
  contents: BlockEntity[],
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
          if (
            new Date(draftData[draftId].entityVersionCreatedAt).getTime() >
            new Date(draftEntity.entityVersionCreatedAt).getTime()
          ) {
            Object.assign(draftEntity, draftData[draftId]);
          }
        }
      },
    );

    draft[draftId] = produce<DraftEntity>(
      draft[draftId],
      (draftEntity: Draft<DraftEntity>) => {
        if (isTextContainingEntityProperties(draftEntity.properties)) {
          restoreDraftId(draftEntity.properties.text.data, entityToDraft);
        }

        if (isDraftBlockEntity(draftEntity)) {
          restoreDraftId(draftEntity.properties.entity, entityToDraft);

          if (
            isTextContainingEntityProperties(
              draftEntity.properties.entity.properties,
            )
          ) {
            restoreDraftId(
              draftEntity.properties.entity.properties.text.data,
              entityToDraft,
            );
          }
        }
      },
    );
  }

  for (const [draftId, draftEntity] of Object.entries(draftData)) {
    draft[draftId] ??= draftEntity;
  }

  return { saved, draft };
};
