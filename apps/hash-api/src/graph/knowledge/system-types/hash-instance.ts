import {
  AccountId,
  Entity,
  OwnedById,
  Subgraph,
  SubgraphRootTypes,
} from "@local/hash-subgraph/main";
import { getRootsAsEntities } from "@local/hash-subgraph/stdlib/element/entity";
import { mapSubgraph } from "@local/hash-subgraph/temp";

import { EntityTypeMismatchError, NotFoundError } from "../../../lib/error";
import {
  ImpureGraphFunction,
  PureGraphFunction,
  zeroedGraphResolveDepths,
} from "../..";
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
  userSelfRegistrationIsEnabled: boolean;
  userRegistrationByInviteIsEnabled: boolean;
  orgSelfRegistrationIsEnabled: boolean;
  entity: Entity;
};

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

  const userSelfRegistrationIsEnabled = entity.properties[
    SYSTEM_TYPES.propertyType.userSelfRegistrationIsEnabled.metadata.recordId
      .baseUri
  ] as boolean;

  const userRegistrationByInviteIsEnabled = entity.properties[
    SYSTEM_TYPES.propertyType.userRegistrationByInviteIsEnabled.metadata
      .recordId.baseUri
  ] as boolean;

  const orgSelfRegistrationIsEnabled = entity.properties[
    SYSTEM_TYPES.propertyType.orgSelfRegistrationIsEnabled.metadata.recordId
      .baseUri
  ] as boolean;

  return {
    userSelfRegistrationIsEnabled,
    userRegistrationByInviteIsEnabled,
    orgSelfRegistrationIsEnabled,
    entity,
  };
};

/**
 * Get the hash instance.
 */
export const getHashInstance: ImpureGraphFunction<
  {},
  Promise<HashInstance>
> = async ({ graphApi }) => {
  const entities = await graphApi
    .getEntitiesByQuery({
      filter: {
        equal: [
          { path: ["type", "versionedUri"] },
          {
            parameter: SYSTEM_TYPES.entityType.hashInstance.schema.$id,
          },
        ],
      },
      graphResolveDepths: zeroedGraphResolveDepths,
      timeProjection: {
        kernel: {
          axis: "transaction",
          timestamp: null,
        },
        image: {
          axis: "decision",
          start: null,
          end: null,
        },
      },
    })
    .then(({ data: subgraph }) =>
      getRootsAsEntities(
        mapSubgraph(subgraph) as Subgraph<SubgraphRootTypes["entity"]>,
      ),
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
 * @param params.userSelfRegistrationIsEnabled - whether or not user self registration is enabled
 * @param params.userRegistrationByInviteIsEnabled - whether or not user registration by invitation is enabled
 * @param params.orgSelfRegistrationIsEnabled - whether or not org registration is enabled
 *
 * @see {@link EntityModel.create} for the remaining params
 */
export const createHashInstance: ImpureGraphFunction<
  Omit<CreateEntityParams, "properties" | "entityTypeId" | "ownedById"> & {
    userSelfRegistrationIsEnabled?: boolean;
    userRegistrationByInviteIsEnabled?: boolean;
    orgSelfRegistrationIsEnabled?: boolean;
  },
  Promise<HashInstance>
> = async (ctx, params) => {
  // Ensure the hash instance entity has not already been created.
  const existingHashInstance = await getHashInstance(ctx, {}).catch(
    (error: Error) => {
      if (error instanceof NotFoundError) {
        return null;
      }
      throw error;
    },
  );

  if (existingHashInstance) {
    throw new Error("Hash instance entity already exists.");
  }

  const { actorId } = params;

  const entity = await createEntity(ctx, {
    ownedById: systemUserAccountId as OwnedById,
    properties: {
      [SYSTEM_TYPES.propertyType.userSelfRegistrationIsEnabled.metadata.recordId
        .baseUri]: params.userSelfRegistrationIsEnabled ?? true,
      [SYSTEM_TYPES.propertyType.userRegistrationByInviteIsEnabled.metadata
        .recordId.baseUri]: params.userRegistrationByInviteIsEnabled ?? true,
      [SYSTEM_TYPES.propertyType.orgSelfRegistrationIsEnabled.metadata.recordId
        .baseUri]: params.orgSelfRegistrationIsEnabled ?? true,
    },
    entityTypeId: SYSTEM_TYPES.entityType.hashInstance.schema.$id,
    actorId,
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
  { user: User; actorId: AccountId },
  Promise<void>
> = async (ctx, params) => {
  const { user, actorId } = params;

  const isAlreadyHashInstanceAdmin = await isUserHashInstanceAdmin(ctx, {
    user,
  });

  if (isAlreadyHashInstanceAdmin) {
    throw new Error(
      `User with entityId "${user.entity.metadata.recordId.entityId}" is already a hash instance admin.`,
    );
  }

  const hashInstance = await getHashInstance(ctx, {});

  await createLinkEntity(ctx, {
    ownedById: systemUserAccountId as OwnedById,
    linkEntityType: SYSTEM_TYPES.linkEntityType.admin,
    leftEntityId: hashInstance.entity.metadata.recordId.entityId,
    rightEntityId: user.entity.metadata.recordId.entityId,
    actorId,
  });
};

/**
 * Remove an instance admin from the hash instance.
 *
 * @param params.user - the user to be removed as a hash instance admin.
 */
export const removeHashInstanceAdmin: ImpureGraphFunction<
  { user: User; actorId: AccountId },
  Promise<void>
> = async (ctx, params): Promise<void> => {
  const { user, actorId } = params;

  const hashInstance = await getHashInstance(ctx, {});

  const outgoingAdminLinkEntities = await getEntityOutgoingLinks(ctx, {
    entity: hashInstance.entity,
    linkEntityType: SYSTEM_TYPES.linkEntityType.admin,
    rightEntity: user.entity,
  });

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

  await archiveEntity(ctx, { entity: outgoingAdminLinkEntity, actorId });
};
