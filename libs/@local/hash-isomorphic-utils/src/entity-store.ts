import { VersionedUri } from "@blockprotocol/type-system/slim";
import {
  EntityId,
  EntityMetadata,
  EntityPropertiesObject,
  EntityTemporalVersioningMetadata,
  LinkData,
} from "@local/hash-types";
import { Draft, produce } from "immer";

import { BlockEntity } from "./entity";
import { generateDraftIdForEntity } from "./entity-store-plugin";
import { types } from "./ontology-types";

export type EntityStoreType = BlockEntity | BlockEntity["blockChildEntity"];

export const TEXT_ENTITY_TYPE_ID = types.entityType.text.entityTypeId;
// `extractBaseUri` does not work within this context, so this is a hacky way to get the base URI.
export const TEXT_TOKEN_PROPERTY_TYPE_BASE_URI =
  types.propertyType.tokens.propertyTypeId.slice(0, -3);

export type DraftEntity<Type extends EntityStoreType = EntityStoreType> = {
  metadata: {
    recordId: {
      entityId: EntityId | null;
    };
    temporalVersioning?: EntityTemporalVersioningMetadata;
    entityTypeId?: VersionedUri | null;
    provenance?: EntityMetadata["provenance"];
  };
  /** @todo properly type this part of the DraftEntity type https://app.asana.com/0/0/1203099452204542/f */
  blockChildEntity?: Type & { draftId?: string };
  properties: EntityPropertiesObject & { entity?: DraftEntity };
  linkData?: LinkData;

  componentId?: string;

  // @todo thinking about removing this – as they're keyed by this anyway
  //  and it makes it complicated to deal with types – should probably just
  //  keep a dict of entity ids to draft ids, and vice versa
  draftId: string;

  /** @todo use updated at from the Graph API https://app.asana.com/0/0/1203099452204542/f */
  // updatedAt: string;
};

export type EntityStore = {
  saved: Record<string, EntityStoreType>;
  draft: Record<string, DraftEntity>;
};

/**
 * @todo should be more robust
 */
export const isEntity = (value: unknown): value is EntityStoreType =>
  typeof value === "object" && value !== null && "metadata" in value;

// @todo does this need to be more robust?
export const isBlockEntity = (entity: unknown): entity is BlockEntity =>
  isEntity(entity) &&
  "blockChildEntity" in entity &&
  isEntity(entity.blockChildEntity);

// @todo does this need to be more robust?
export const isDraftEntity = <T extends EntityStoreType>(
  entity: T | DraftEntity<T>,
): entity is DraftEntity<T> => "draftId" in entity;

export const isDraftBlockEntity = (
  entity: unknown,
): entity is DraftEntity<BlockEntity> =>
  isBlockEntity(entity) && isDraftEntity(entity);

/**
 * Returns the draft entity associated with an entity id, or undefined if it does not.
 * Use mustGetDraftEntityFromEntityId if you want an error if the entity is missing.
 * @todo we could store a map of entity id <-> draft id to make this easier
 */
export const getDraftEntityByEntityId = (
  draft: EntityStore["draft"],
  entityId: EntityId,
): DraftEntity | undefined =>
  Object.values(draft).find(
    (entity) => entity.metadata.recordId.entityId === entityId,
  );

const findEntities = (contents: BlockEntity[]): EntityStoreType[] => {
  const entities: EntityStoreType[] = [];

  for (const entity of contents) {
    entities.push(entity);

    if (entity.blockChildEntity) {
      entities.push(entity.blockChildEntity);
    }
  }

  return entities;
};

const restoreDraftId = (
  identifiers: { entityId: string | null; draftId?: string },
  entityToDraft: Record<string, string>,
): string => {
  const textEntityId = identifiers.entityId;

  if (!textEntityId) {
    throw new Error("entity id does not exist when expected to");
  }

  return entityToDraft[textEntityId]!;
};

/**
 * @todo this should be flat – so that we don't have to traverse links
 * @todo clean up
 */
export const createEntityStore = (
  contents: BlockEntity[],
  draftData: Record<string, DraftEntity>,
  presetDraftIds: Record<string, string> = {},
): EntityStore => {
  const saved: EntityStore["saved"] = {};
  const draft: EntityStore["draft"] = {};

  const entityToDraft = Object.fromEntries(
    Object.entries(presetDraftIds).map(([draftId, entityId]) => [
      entityId,
      draftId,
    ]),
  );

  for (const row of Object.values(draftData)) {
    if (row.metadata.recordId.entityId) {
      entityToDraft[row.metadata.recordId.entityId] = row.draftId;
    }
  }

  const entities = findEntities(contents);

  for (const entity of entities) {
    const entityId = entity.metadata.recordId.entityId;

    if (entity && !entityToDraft[entityId]) {
      entityToDraft[entityId] = generateDraftIdForEntity(entityId);
    }
  }

  for (const entity of entities) {
    const entityId = entity.metadata.recordId.entityId;

    saved[entityId] = entity;
    const draftId = entityToDraft[entityId]!;
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
            new Date(
              draftData[draftId]!.metadata.temporalVersioning?.decisionTime
                .start.limit ?? 0,
            ).getTime() >
            new Date(
              draftEntity.metadata.temporalVersioning?.decisionTime.start
                .limit ?? 0,
            ).getTime()
          ) {
            Object.assign(draftEntity, draftData[draftId]);
          }
        }
      },
    );

    draft[draftId] = produce<DraftEntity>(
      draft[draftId]!,
      (draftEntity: Draft<DraftEntity>) => {
        if (isDraftBlockEntity(draftEntity)) {
          const restoredDraftId = restoreDraftId(
            {
              // This type is very deep now, so traversal causes TS to complain.
              // eslint-disable-next-line @typescript-eslint/ban-ts-comment
              // @ts-ignore
              entityId: draftEntity.metadata.recordId.entityId,
              draftId: draftEntity.draftId,
            },
            entityToDraft,
          );

          draftEntity.draftId = restoredDraftId;

          // Set the blockChildEntity's draft ID on a block draft.
          if (
            !draftEntity.blockChildEntity?.draftId &&
            draftEntity.blockChildEntity?.metadata.recordId.entityId
          ) {
            const restoredBlockDraftId = restoreDraftId(
              {
                entityId:
                  draftEntity.blockChildEntity.metadata.recordId.entityId,
                draftId: draftEntity.blockChildEntity.draftId,
              },
              entityToDraft,
            );

            draftEntity.blockChildEntity.draftId = restoredBlockDraftId;
          }
        }
      },
    );
  }

  for (const [draftId, draftEntity] of Object.entries(draftData)) {
    // BaseId is readonly, so we have to do this instead of assigning
    // updated.metadata.recordId.entityId
    const updated = {
      ...draftEntity,
      metadata: {
        ...draftEntity.metadata,
        recordId: {
          ...draftEntity.metadata.recordId,
          entityId: (presetDraftIds[draftEntity.draftId] ??
            draftEntity.metadata.recordId.entityId) as EntityId,
        },
      },
    };

    draft[draftId] ??= updated;
  }

  for (const [draftId, entityId] of Object.entries(presetDraftIds)) {
    const draftEntity = draft[draftId];
    if (!draftEntity) {
      throw new Error("Cannot update relevant entity id");
    }
    if (
      draftEntity.metadata.recordId.entityId &&
      draftEntity.metadata.recordId.entityId !== entityId
    ) {
      throw new Error("Cannot update entity id of existing draft entity");
    }

    draft[draftId] = produce(draftEntity, (draftDraftEntity) => {
      draftDraftEntity.metadata.recordId.entityId = entityId;
    });
  }

  return { saved, draft };
};
