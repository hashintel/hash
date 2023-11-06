import {
  currentTimeInstantTemporalAxes,
  generateVersionedUrlMatchingFilter,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import {
  SimpleProperties,
  simplifyProperties,
} from "@local/hash-isomorphic-utils/simplify-properties";
import { HASHInstanceProperties } from "@local/hash-isomorphic-utils/system-types/hashinstance";
import {
  Entity,
  EntityRootType,
  extractOwnedByIdFromEntityId,
  OwnedById,
} from "@local/hash-subgraph";
import {
  getRoots,
  mapGraphApiSubgraphToSubgraph,
} from "@local/hash-subgraph/stdlib";

import { EntityTypeMismatchError, NotFoundError } from "../../../lib/error";
import { ImpureGraphFunction, PureGraphFunction } from "../../context-types";
import { SYSTEM_TYPES } from "../../system-types";
import {
  createEntity,
  CreateEntityParams,
  modifyEntityAuthorizationRelationships,
} from "../primitive/entity";
import { createAccountGroup, createWeb } from "./account.fields";
import { User } from "./user";

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
      SYSTEM_TYPES.entityType.hashInstance.schema.$id,
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
      filter: generateVersionedUrlMatchingFilter(
        SYSTEM_TYPES.entityType.hashInstance.schema.$id,
        { ignoreParents: true },
      ),
      graphResolveDepths: zeroedGraphResolveDepths,
      temporalAxes: currentTimeInstantTemporalAxes,
    })
    .then(({ data }) => {
      const subgraph = mapGraphApiSubgraphToSubgraph<EntityRootType>(data);

      return getRoots(subgraph);
    });

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

  const hashInstanceAdmins = await createAccountGroup(ctx, authentication, {});
  await createWeb(ctx, authentication, { owner: hashInstanceAdmins });

  const entity = await createEntity(ctx, authentication, {
    ownedById: hashInstanceAdmins as OwnedById,
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
  await modifyEntityAuthorizationRelationships(ctx, authentication, [
    {
      operation: "create",
      relationship: {
        subject: {
          kind: "public",
        },
        relation: "generalViewer",
        resource: {
          kind: "entity",
          resourceId: entity.metadata.recordId.entityId,
        },
      },
    },
  ]);

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
  const hashInstance = await getHashInstance(ctx, authentication, {});

  await ctx.graphApi.addAccountGroupMember(
    authentication.actorId,
    extractOwnedByIdFromEntityId(
      hashInstance.entity.metadata.recordId.entityId,
    ),
    params.user.accountId,
  );
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
  const hashInstance = await getHashInstance(ctx, authentication, {});

  await ctx.graphApi.removeAccountGroupMember(
    authentication.actorId,
    extractOwnedByIdFromEntityId(
      hashInstance.entity.metadata.recordId.entityId,
    ),
    params.user.accountId,
  );
};
