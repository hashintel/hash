import type {
  CreateEntityParameters,
  Entity,
 LinkEntity } from "@local/hash-graph-sdk/entity";
import type {
  EntityProperties,
  LinkData,
  PropertyPatchOperation,
} from "@local/hash-graph-types/entity";

import type { ImpureGraphFunction } from "../../context-types";
import {
  getEntityTypeById,
  isEntityTypeLinkEntityType,
} from "../../ontology/primitive/entity-type";

import { getLatestEntityById } from "./entity";
import { afterCreateEntityHooks } from "./entity/after-create-entity-hooks";

export const isEntityLinkEntity = (entity: Entity): entity is LinkEntity =>
  Boolean(entity.linkData);

type CreateLinkEntityFunction<Properties extends EntityProperties> =
  ImpureGraphFunction<
    Omit<CreateEntityParameters<Properties>, "provenance"> & {
      linkData: LinkData;
    },
    Promise<LinkEntity<Properties>>
  >;

/**
 * Create an entity.
 */
export const createLinkEntity = async <Properties extends EntityProperties>(
  ...args: Parameters<CreateLinkEntityFunction<Properties>>
): ReturnType<CreateLinkEntityFunction<Properties>> => {
  const [context, authentication, params] = args;
  const {
    ownedById,
    linkData,
    properties = { value: {} },
    draft = false,
    relationships,
    confidence,
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

  const linkEntity = await LinkEntity.create<Properties>(
    context.graphApi,
    authentication,
    {
      ownedById,
      linkData,
      entityTypeId: linkEntityType.schema.$id,
      properties,
      draft,
      relationships,
      confidence,
      provenance: context.provenance,
    },
  );

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
 * @param params.linkEntity - The link entity being updated.
 * @param params.properties - (optional) - the updated properties object of the link entity.
 * @param params.actorId - The id of the account that is updating the entity.
 */
export const updateLinkEntity: ImpureGraphFunction<
  {
    linkEntity: LinkEntity;
    propertyPatches?: PropertyPatchOperation[];
    draft?: boolean;
  },
  Promise<LinkEntity>
> = async ({ graphApi, provenance }, { actorId }, params) => {
  const { linkEntity, propertyPatches } = params;

  return linkEntity.patch(
    graphApi,
    { actorId },
    {
      propertyPatches,
      draft: params.draft,
      provenance,
    },
  );
};

/**
 * Get the right entity of a link entity.
 *
 * @param params.linkEntity - The link entity.
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
 * @param params.linkEntity - The link entity.
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
