import { produce } from "immer";

// oxlint-disable-next-line import/no-cycle -- entity-store-plugin also imports the types in this module; generateDraftIdForEntity cannot move without editing that module
import { generateDraftIdForEntity } from "./entity-store-plugin.js";
import { blockProtocolPropertyTypes } from "./ontology-type-ids.js";

import type { BlockEntity } from "./entity.js";
import type {
  EntityId,
  EntityTemporalMetadata,
  LinkData,
  PropertyObject,
  VersionedUrl,
} from "@blockprotocol/type-system";
import type { Draft } from "immer";

export type EntityStoreType = BlockEntity | BlockEntity["blockChildEntity"];

export const textualContentPropertyTypeBaseUrl =
  blockProtocolPropertyTypes.textualContent.propertyTypeBaseUrl;

// oxlint-disable-next-line typescript/consistent-type-definitions -- an interface has no implicit index signature, so it is not assignable to the `Record<string, unknown>` parameters that take draft entities
export type DraftEntity<Type extends EntityStoreType = EntityStoreType> = {
  metadata: {
    recordId: {
      entityId: EntityId | null;
      editionId: string;
    };
    /**
     * @todo H-2242 do we need to change this for multi-type entities
     */
    entityTypeId?: VersionedUrl | null;
    temporalVersioning: EntityTemporalMetadata;
  };

  /**
   * @todo properly type this part of the DraftEntity type
   * @see https://linear.app/hash/issue/H-3000
   */
  blockChildEntity?: Type & { draftId?: string };
  properties: PropertyObject;
  linkData?: LinkData;

  componentId?: string;

  // @todo thinking about removing this – as they're keyed by this anyway
  //  and it makes it complicated to deal with types – should probably just
  //  keep a dict of entity ids to draft ids, and vice versa
  draftId: string;

  /**
   * @todo use updated at from the Graph API
   * @see https://linear.app/hash/issue/H-3000
   */
  // updatedAt: string;
};

export interface EntityStore {
  saved: Record<string, EntityStoreType>;
  draft: Record<string, DraftEntity>;
}

/**
 * @todo should be more robust
 */
// oxlint-disable-next-line typescript/no-restricted-types -- type guard over arbitrary input
export const isEntity = (value: unknown): value is EntityStoreType =>
  typeof value === "object" && value !== null && "metadata" in value;

// @todo does this need to be more robust?
// oxlint-disable-next-line typescript/no-restricted-types -- type guard over arbitrary input
export const isBlockEntity = (entity: unknown): entity is BlockEntity =>
  isEntity(entity) &&
  "blockChildEntity" in entity &&
  isEntity(entity.blockChildEntity);

// @todo does this need to be more robust?
export const isDraftEntity = <T extends EntityStoreType>(
  entity: T | DraftEntity<T>,
): entity is DraftEntity<T> => "draftId" in entity;

export const isDraftBlockEntity = (
  // oxlint-disable-next-line typescript/no-restricted-types -- type guard over arbitrary input
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

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- @todo improve logic or types to remove this comment
    if (entity.blockChildEntity !== undefined) {
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

  if (textEntityId === null || textEntityId === "") {
    throw new Error("entity id does not exist when expected to");
  }

  const draftId = entityToDraft[textEntityId];

  if (draftId === undefined) {
    throw new Error(`no draft id exists for entity id ${textEntityId}`);
  }

  return draftId;
};

const getEntityToDraft = (
  draftData: Record<string, DraftEntity>,
  presetDraftIds: Record<string, string>,
): Record<string, string> => {
  const entityToDraft = Object.fromEntries(
    Object.entries(presetDraftIds).map(([draftId, entityId]) => [
      entityId,
      draftId,
    ]),
  );

  for (const row of Object.values(draftData)) {
    if (row.metadata.recordId.entityId !== null) {
      entityToDraft[row.metadata.recordId.entityId] = row.draftId;
    }
  }

  return entityToDraft;
};

/**
 * If we have a local draft of this entity, and it's recorded as being updated more recently than the API-provided one,
 * we prefer the local entity. We set the decision time manually in the entityStoreReducer when updating properties.
 * This is not a good long-term solution – we need a collaborative editing server to manage document state. H-1234
 */
const preferNewerLocalDraft = (
  draftEntity: Draft<DraftEntity>,
  localDraft: DraftEntity | undefined,
): void => {
  if (
    localDraft !== undefined &&
    new Date(
      localDraft.metadata.temporalVersioning.decisionTime.start.limit,
    ).getTime() >
      new Date(
        draftEntity.metadata.temporalVersioning.decisionTime.start.limit,
      ).getTime()
  ) {
    Object.assign(draftEntity, localDraft);
  }
};

const restoreDraftIds = (
  draftEntity: Draft<DraftEntity>,
  entityToDraft: Record<string, string>,
): void => {
  if (!isDraftBlockEntity(draftEntity)) {
    return;
  }

  const restoredDraftId = restoreDraftId(
    {
      // This type is very deep now, so traversal causes TS to complain.
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment -- see above
      // @ts-expect-error -- see above
      entityId: draftEntity.metadata.recordId.entityId,
      draftId: draftEntity.draftId,
    },
    entityToDraft,
  );

  draftEntity.draftId = restoredDraftId;

  // Set the blockChildEntity's draft ID on a block draft.
  const blockChildEntity = draftEntity.blockChildEntity;
  const blockChildEntityId = blockChildEntity?.metadata.recordId.entityId;

  if (
    blockChildEntity !== undefined &&
    (blockChildEntity.draftId === undefined ||
      blockChildEntity.draftId === "") &&
    blockChildEntityId !== undefined &&
    blockChildEntityId !== ""
  ) {
    const restoredBlockDraftId = restoreDraftId(
      {
        entityId: blockChildEntityId,
        draftId: blockChildEntity.draftId,
      },
      entityToDraft,
    );

    blockChildEntity.draftId = restoredBlockDraftId;
  }
};

/**
 * Creates an entity store from a list of entities and a list of draft entities.
 *
 * This is used to create the initial state of the entity store, and also in response to update the contents in the API.
 * The latter is a source of bugs, because more recent local updates can be overwritten by stale data from the API.
 *
 * This would be solved by having a collaborative editing server which managed document state centrally. H-1234
 *
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

  const entityToDraft = getEntityToDraft(draftData, presetDraftIds);

  const entities = findEntities(contents);

  for (const entity of entities) {
    const entityId = entity.metadata.recordId.entityId;
    const existingDraftId = entityToDraft[entityId];

    if (existingDraftId === undefined || existingDraftId === "") {
      entityToDraft[entityId] = generateDraftIdForEntity(entityId);
    }
  }

  for (const entity of entities) {
    const entityId = entity.metadata.recordId.entityId;

    saved[entityId] = entity;
    const draftId = entityToDraft[entityId];

    if (draftId === undefined) {
      throw new Error(`no draft id was generated for entity id ${entityId}`);
    }

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
      {
        componentId: "componentId" in entity ? entity.componentId : undefined,
        blockChildEntity:
          "blockChildEntity" in entity ? entity.blockChildEntity : undefined,
        metadata: entity.metadata,
        properties: entity.properties,
        draftId,
      },
      (draftEntity: Draft<DraftEntity>) => {
        preferNewerLocalDraft(draftEntity, draftData[draftId]);
      },
    );

    draft[draftId] = produce<DraftEntity>(
      draft[draftId],
      (draftEntity: Draft<DraftEntity>) => {
        restoreDraftIds(draftEntity, entityToDraft);
      },
    );
  }

  for (const [draftId, draftEntity] of Object.entries(draftData)) {
    // BaseId is readonly, so we have to do this instead of assigning
    // updated.metadata.recordId.baseUrl
    const presetEntityId =
      presetDraftIds[draftEntity.draftId] ??
      draftEntity.metadata.recordId.entityId;
    // SAFETY: preset draft ids map to entity ids, and the fallback is the draft's own entity id
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the preset value is an entity id by construction, but is typed as a plain string
    const baseId = presetEntityId as EntityId;

    const updated = {
      ...draftEntity,
      metadata: {
        ...draftEntity.metadata,
        editionId: {
          ...draftEntity.metadata.recordId,
          baseId,
        },
      },
    };

    draft[draftId] ??= updated;
  }

  for (const [draftId, entityId] of Object.entries(presetDraftIds)) {
    const draftEntity = draft[draftId];
    if (draftEntity === undefined) {
      throw new Error("Cannot update relevant entity id");
    }
    if (
      draftEntity.metadata.recordId.entityId !== null &&
      draftEntity.metadata.recordId.entityId !== entityId
    ) {
      throw new Error("Cannot update entity id of existing draft entity");
    }

    draft[draftId] = produce(draftEntity, (draftDraftEntity) => {
      // SAFETY: preset draft ids map to entity ids
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the preset value is an entity id by construction, but is typed as a plain string
      draftDraftEntity.metadata.recordId.entityId = entityId as EntityId;
    });
  }

  return { saved, draft };
};
