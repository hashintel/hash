import {
  currentTimeInstantTemporalAxes,
  generateVersionedUrlMatchingFilter,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
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
import {
  createAccountGroup,
  createWeb,
} from "../../account-permission-management";
import { ImpureGraphFunction, PureGraphFunction } from "../../context-types";
import {
  createEntity,
  CreateEntityParams,
  modifyEntityAuthorizationRelationships,
} from "../primitive/entity";
import { User } from "./user";

export type HashInstance = {
  entity: Entity;
} & SimpleProperties<HASHInstanceProperties>;

export const getHashInstanceFromEntity: PureGraphFunction<
  { entity: Entity },
  HashInstance
> = ({ entity }) => {
  if (
    entity.metadata.entityTypeId !== systemEntityTypes.hashInstance.entityTypeId
  ) {
    throw new EntityTypeMismatchError(
      entity.metadata.recordId.entityId,
      systemEntityTypes.hashInstance.entityTypeId,
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
        systemEntityTypes.hashInstance.entityTypeId,
        { ignoreParents: true },
      ),
      graphResolveDepths: zeroedGraphResolveDepths,
      temporalAxes: currentTimeInstantTemporalAxes,
      includeDrafts: false,
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
  Omit<
    CreateEntityParams,
    | "properties"
    | "entityTypeId"
    | "ownedById"
    | "relationships"
    | "inheritedPermissions"
  > & {
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
  await createWeb(ctx, authentication, {
    ownedById: hashInstanceAdmins as OwnedById,
    owner: { kind: "accountGroup", subjectId: hashInstanceAdmins },
  });

  const entity = await createEntity(ctx, authentication, {
    ownedById: hashInstanceAdmins as OwnedById,
    properties: {
      "https://hash.ai/@hash/types/property-type/pages-are-enabled/":
        params.pagesAreEnabled ?? true,
      "https://hash.ai/@hash/types/property-type/user-self-registration-is-enabled/":
        params.userSelfRegistrationIsEnabled ?? true,
      "https://hash.ai/@hash/types/property-type/user-registration-by-invitation-is-enabled/":
        params.userRegistrationByInviteIsEnabled ?? true,
      "https://hash.ai/@hash/types/property-type/org-self-registration-is-enabled/":
        params.orgSelfRegistrationIsEnabled ?? true,
    } as HASHInstanceProperties,
    entityTypeId: systemEntityTypes.hashInstance.entityTypeId,
    relationships: [
      {
        relation: "viewer",
        subject: { kind: "public" },
      },
    ],
    inheritedPermissions: ["administratorFromWeb", "updateFromWeb"],
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
