import type {
  LinkData,
  PropertyPatchOperation,
} from "@blockprotocol/type-system";
import type {
  CreateEntityParameters,
  Entity,
} from "@local/hash-graph-sdk/entity";
import { LinkEntity } from "@local/hash-graph-sdk/entity";
import type { EntityProperties } from "@local/hash-graph-types/entity";

import type { ImpureGraphFunction } from "../../context-types";
import { getLatestEntityById } from "./entity";
import { afterCreateEntityHooks } from "./entity/after-create-entity-hooks";

export const isEntityLinkEntity = (entity: Entity): entity is LinkEntity =>
  !!entity.linkData;

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
    webId,
    linkData,
    entityTypeIds,
    properties = { value: {} },
    draft = false,
    relationships,
    confidence,
  } = params;

  const linkEntity = await LinkEntity.create<Properties>(
    context.graphApi,
    authentication,
    {
      webId,
      linkData,
      entityTypeIds,
      properties,
      draft,
      relationships,
      confidence,
      provenance: context.provenance,
    },
  );

  for (const afterCreateHook of afterCreateEntityHooks) {
    if (
      linkEntity.metadata.entityTypeIds.includes(afterCreateHook.entityTypeId)
    ) {
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
    propertyPatches?: PropertyPatchOperation[];
    draft?: boolean;
  },
  Promise<LinkEntity>
> = async ({ graphApi, provenance }, { actorId }, params) => {
  const { linkEntity, propertyPatches } = params;

  return await linkEntity.patch(
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
