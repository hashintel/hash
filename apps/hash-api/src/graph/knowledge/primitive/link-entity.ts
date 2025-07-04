import type {
  LinkData,
  PropertyPatchOperation,
  TypeIdsAndPropertiesForEntity,
} from "@blockprotocol/type-system";
import type {
  CreateEntityParameters,
  HashEntity,
} from "@local/hash-graph-sdk/entity";
import { HashLinkEntity } from "@local/hash-graph-sdk/entity";

import type { ImpureGraphFunction } from "../../context-types";
import { getLatestEntityById } from "./entity";
import { afterCreateEntityHooks } from "./entity/after-create-entity-hooks";

export const isEntityLinkEntity = (
  entity: HashEntity,
): entity is HashLinkEntity => !!entity.linkData;

type CreateLinkEntityFunction<
  Properties extends TypeIdsAndPropertiesForEntity,
> = ImpureGraphFunction<
  Omit<CreateEntityParameters<Properties>, "provenance"> & {
    linkData: LinkData;
  },
  Promise<HashLinkEntity<Properties>>
>;

/**
 * Create an entity.
 */
export const createLinkEntity = async <
  Properties extends TypeIdsAndPropertiesForEntity,
>(
  ...args: Parameters<CreateLinkEntityFunction<Properties>>
): ReturnType<CreateLinkEntityFunction<Properties>> => {
  const [context, authentication, params] = args;

  const linkEntity = await HashLinkEntity.create<Properties>(
    context.graphApi,
    authentication,
    {
      ...params,
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
    linkEntity: HashLinkEntity;
    propertyPatches?: PropertyPatchOperation[];
    draft?: boolean;
  },
  Promise<HashLinkEntity>
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
  { linkEntity: HashLinkEntity },
  Promise<HashEntity>
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
  { linkEntity: HashLinkEntity },
  Promise<HashEntity>
> = async (ctx, authentication, { linkEntity }) => {
  const leftEntity = await getLatestEntityById(ctx, authentication, {
    entityId: linkEntity.linkData.leftEntityId,
  });

  return leftEntity;
};
