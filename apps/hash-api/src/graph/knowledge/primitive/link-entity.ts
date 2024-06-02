import type { ProvidedEntityEditionProvenance } from "@local/hash-graph-client";
import type {
  CreateEntityParameters,
  Entity,
} from "@local/hash-graph-sdk/entity";
import { LinkEntity } from "@local/hash-graph-sdk/entity";
import type {
  EntityPropertiesObject,
  LinkData,
} from "@local/hash-graph-types/entity";

import type { ImpureGraphFunction } from "../../context-types";
import {
  getEntityTypeById,
  isEntityTypeLinkEntityType,
} from "../../ontology/primitive/entity-type";
import { getLatestEntityById } from "./entity";
import { afterCreateEntityHooks } from "./entity/after-create-entity-hooks";

export const isEntityLinkEntity = (entity: Entity): entity is LinkEntity =>
  !!entity.linkData;

/**
 * Create a link entity between a left and a right entity.
 *
 * @param params.ownedById - the id of the account who owns the new link entity
 * @param params.linkEntityTypeId - the link entity type ID of the link entity
 * @param params.leftEntityId - the ID of the left entity
 * @param params.rightEntityId - the ID of the right entity
 * @param params.actorId - the id of the account that is creating the link
 */
export const createLinkEntity: ImpureGraphFunction<
  CreateEntityParameters & {
    linkData: LinkData;
  },
  Promise<LinkEntity>
> = async (context, authentication, params) => {
  const {
    ownedById,
    linkData,
    properties = {},
    draft = false,
    relationships,
    confidence,
    propertyMetadata,
    provenance,
  } = params;

  const linkEntityType = await getEntityTypeById(context, authentication, {
    entityTypeId: params.entityTypeId,
  });

  /**
   * @todo: remove this check once it is made in the Graph API
   * @see https://linear.app/hash/issue/H-972/validate-links-when-creatingupdating-an-entity-or-links-tofrom-an
   */
  if (
    !(await isEntityTypeLinkEntityType(
      context,
      authentication,
      linkEntityType.schema,
    ))
  ) {
    throw new Error(
      `Entity type with ID "${linkEntityType.schema.$id}" is not a link entity type.`,
    );
  }

  const linkEntity = await LinkEntity.create(context.graphApi, authentication, {
    ownedById,
    linkData,
    entityTypeId: linkEntityType.schema.$id,
    properties,
    draft,
    relationships,
    confidence,
    propertyMetadata,
    provenance,
  });

  for (const afterCreateHook of afterCreateEntityHooks) {
    if (afterCreateHook.entityTypeId === linkEntity.metadata.entityTypeId) {
      void afterCreateHook.callback({
        context,
        entity: linkEntity,
        authentication,
      });
    }
  }

  return linkEntity;
};

/**
 * Update a link entity.
 *
 * @param params.linkEntity - the link entity being updated
 * @param params.properties (optional) - the updated properties object of the link entity
 * @param params.actorId - the id of the account that is updating the entity
 */
export const updateLinkEntity: ImpureGraphFunction<
  {
    linkEntity: LinkEntity;
    properties?: EntityPropertiesObject;
    draft?: boolean;
    provenance?: ProvidedEntityEditionProvenance;
  },
  Promise<LinkEntity>
> = async ({ graphApi }, { actorId }, params) => {
  const { linkEntity } = params;

  const properties = params.properties ?? linkEntity.properties;

  const { data: metadata } = await graphApi.patchEntity(actorId, {
    entityId: linkEntity.metadata.recordId.entityId,
    properties: [
      {
        op: "replace",
        path: [],
        value: properties,
      },
    ],
    draft: params.draft,
    provenance: params.provenance,
  });

  return new LinkEntity({
    metadata,
    properties,
    linkData: linkEntity.linkData,
  });
};

/**
 * Get the right entity of a link entity.
 *
 * @param params.linkEntity - the link entity
 */
export const getLinkEntityRightEntity: ImpureGraphFunction<
  { linkEntity: LinkEntity },
  Promise<Entity>
> = async (ctx, authentication, { linkEntity }) => {
  const rightEntity = await getLatestEntityById(ctx, authentication, {
    entityId: linkEntity.linkData.rightEntityId,
  });

  return rightEntity;
};

/**
 * Get the left entity of a link entity.
 *
 * @param params.linkEntity - the link entity
 */
export const getLinkEntityLeftEntity: ImpureGraphFunction<
  { linkEntity: LinkEntity },
  Promise<Entity>
> = async (ctx, authentication, { linkEntity }) => {
  const leftEntity = await getLatestEntityById(ctx, authentication, {
    entityId: linkEntity.linkData.leftEntityId,
  });

  return leftEntity;
};
