import {
  currentTimeInstantTemporalAxes,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import {
  SimpleProperties,
  simplifyProperties,
} from "@local/hash-isomorphic-utils/simplify-properties";
import { HASHInstanceProperties } from "@local/hash-isomorphic-utils/system-types/hashinstance";
  Entity,
  EntityRootType,
  OwnedById,
  Subgraph,
} from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/stdlib";

import { EntityTypeMismatchError, NotFoundError } from "../../../lib/error";
import { ImpureGraphFunction, PureGraphFunction } from "../..";
import { SYSTEM_TYPES } from "../../system-types";
import { systemUserAccountId } from "../../system-user";
import {
  archiveEntity,
  createEntity,
  CreateEntityParams,
  getEntityOutgoingLinks,
} from "../primitive/entity";
import { createLinkEntity } from "../primitive/link-entity";
import { isUserHashInstanceAdmin, User } from "./user";

export type HashInstance = {
  entity: Entity;
} & SimpleProperties<HASHInstanceProperties>;

export const getHashInstanceFromEntity: PureGraphFunction<
  { entity: Entity },
  HashInstance
> = ({ entity }) => {
  if (
    entity.metadata.entityTypeId !==
    SYSTEM_TYPES.entityType.hashInstance.schema.$id
  ) {
    throw new EntityTypeMismatchError(
      entity.metadata.recordId.entityId,
      SYSTEM_TYPES.entityType.user.schema.$id,
      entity.metadata.entityTypeId,
    );
  }

  return {
    ...simplifyProperties(entity.properties as HASHInstanceProperties),
    entity,
  };
};

/**
 * Get the hash instance.
 */
export const getHashInstance: ImpureGraphFunction<
  {},
  Promise<HashInstance>
> = async ({ graphApi }, { actorId }) => {
  const entities = await graphApi
    .getEntitiesByQuery(actorId, {
      filter: {
        equal: [
          { path: ["type", "versionedUrl"] },
          {
            parameter: SYSTEM_TYPES.entityType.hashInstance.schema.$id,
          },
        ],
      },
      graphResolveDepths: zeroedGraphResolveDepths,
      temporalAxes: currentTimeInstantTemporalAxes,
    })
    .then(({ data: subgraph }) =>
      getRoots(subgraph as Subgraph<EntityRootType>),
    );

  if (entities.length > 1) {
    throw new Error("More than one hash instance entity found in the graph.");
  }

  const entity = entities[0];

  if (!entity) {
    throw new NotFoundError("Could not find hash instance entity.");
  }

  return getHashInstanceFromEntity({ entity });
};

/**
 * Create the hash instance entity.
 *
 * @param params.pagesAreEnabled - whether or not pages are enabled
 * @param params.userSelfRegistrationIsEnabled - whether or not user self registration is enabled
 * @param params.userRegistrationByInviteIsEnabled - whether or not user registration by invitation is enabled
 * @param params.orgSelfRegistrationIsEnabled - whether or not org registration is enabled
 *
 * @see {@link EntityModel.create} for the remaining params
 */
export const createHashInstance: ImpureGraphFunction<
  Omit<CreateEntityParams, "properties" | "entityTypeId" | "ownedById"> & {
    pagesAreEnabled?: boolean;
    userSelfRegistrationIsEnabled?: boolean;
    userRegistrationByInviteIsEnabled?: boolean;
    orgSelfRegistrationIsEnabled?: boolean;
  },
  Promise<HashInstance>
> = async (ctx, authentication, params) => {
  // Ensure the hash instance entity has not already been created.
  const existingHashInstance = await getHashInstance(
    ctx,
    authentication,
    {},
  ).catch((error: Error) => {
    if (error instanceof NotFoundError) {
      return null;
    }
    throw error;
  });

  if (existingHashInstance) {
    throw new Error("Hash instance entity already exists.");
  }

  const entity = await createEntity(ctx, authentication, {
    ownedById: systemUserAccountId as OwnedById,
    properties: {
      [SYSTEM_TYPES.propertyType.pagesAreEnabled.metadata.recordId.baseUrl]:
        params.pagesAreEnabled ?? true,
      [SYSTEM_TYPES.propertyType.userSelfRegistrationIsEnabled.metadata.recordId
        .baseUrl]: params.userSelfRegistrationIsEnabled ?? true,
      [SYSTEM_TYPES.propertyType.userRegistrationByInviteIsEnabled.metadata
        .recordId.baseUrl]: params.userRegistrationByInviteIsEnabled ?? true,
      [SYSTEM_TYPES.propertyType.orgSelfRegistrationIsEnabled.metadata.recordId
        .baseUrl]: params.orgSelfRegistrationIsEnabled ?? true,
    },
    entityTypeId: SYSTEM_TYPES.entityType.hashInstance.schema.$id,
  });

  return getHashInstanceFromEntity({ entity });
};

/**
 * Add an instance admin to the hash instance.
 *
 * @param params.user - the user to be added as a hash instance admin.
 *
 * @see {@link createEntity} for the documentation of the remaining parameters
 */
export const addHashInstanceAdmin: ImpureGraphFunction<
  { user: User },
  Promise<void>
> = async (ctx, authentication, params) => {
  const { user } = params;

  const isAlreadyHashInstanceAdmin = await isUserHashInstanceAdmin(
    ctx,
    authentication,
    {
      user,
    },
  );

  if (isAlreadyHashInstanceAdmin) {
    throw new Error(
      `User with entityId "${user.entity.metadata.recordId.entityId}" is already a hash instance admin.`,
    );
  }

  const hashInstance = await getHashInstance(ctx, authentication, {});

  await createLinkEntity(ctx, authentication, {
    ownedById: systemUserAccountId as OwnedById,
    linkEntityType: SYSTEM_TYPES.linkEntityType.admin,
    leftEntityId: hashInstance.entity.metadata.recordId.entityId,
    rightEntityId: user.entity.metadata.recordId.entityId,
  });
};

/**
 * Remove an instance admin from the hash instance.
 *
 * @param params.user - the user to be removed as a hash instance admin.
 */
export const removeHashInstanceAdmin: ImpureGraphFunction<
  { user: User },
  Promise<void>
> = async (ctx, authentication, params): Promise<void> => {
  const { user } = params;

  const hashInstance = await getHashInstance(ctx, authentication, {});

  const outgoingAdminLinkEntities = await getEntityOutgoingLinks(
    ctx,
    authentication,
    {
      entityId: hashInstance.entity.metadata.recordId.entityId,
      linkEntityTypeVersionedUrl: SYSTEM_TYPES.linkEntityType.admin.schema.$id,
      rightEntityId: user.entity.metadata.recordId.entityId,
    },
  );

  if (outgoingAdminLinkEntities.length > 1) {
    throw new Error(
      "Critical: more than one outgoing admin link from the HASH instance entity to the same user was found.",
    );
  }

  const [outgoingAdminLinkEntity] = outgoingAdminLinkEntities;

  if (!outgoingAdminLinkEntity) {
    throw new Error(
      `The user with entity ID ${user.entity.metadata.recordId.entityId} is not a HASH instance admin.`,
    );
  }

  await archiveEntity(ctx, authentication, {
    entity: outgoingAdminLinkEntity,
  });
};
