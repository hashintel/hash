import {
  currentTimeInstantTemporalAxes,
  generateVersionedUrlMatchingFilter,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import {
  AccountEntityId,
  AccountId,
  Entity,
  EntityId,
  EntityPropertiesObject,
  EntityRootType,
  EntityUuid,
  extractAccountId,
  extractEntityUuidFromEntityId,
  OwnedById,
} from "@local/hash-subgraph";
import {
  getRoots,
  mapGraphApiSubgraphToSubgraph,
} from "@local/hash-subgraph/stdlib";

import {
  kratosIdentityApi,
  KratosUserIdentity,
  KratosUserIdentityTraits,
} from "../../../auth/ory-kratos";
import { EntityTypeMismatchError } from "../../../lib/error";
import { createAccount, createWeb } from "../../account-permission-management";
import { ImpureGraphFunction, PureGraphFunction } from "../../context-types";
import { SYSTEM_TYPES } from "../../system-types";
import {
  checkEntityPermission,
  createEntity,
  CreateEntityParams,
  getEntityOutgoingLinks,
  getLatestEntityById,
  modifyEntityAuthorizationRelationships,
} from "../primitive/entity";
import {
  shortnameIsInvalid,
  shortnameIsRestricted,
  shortnameIsTaken,
} from "./account.fields";
import { addHashInstanceAdmin, getHashInstance } from "./hash-instance";
import {
  createOrgMembership,
  getOrgMembershipFromLinkEntity,
  getOrgMembershipOrg,
  OrgMembership,
} from "./org-membership";
import { systemAccountId } from "../../system-account";
import { modifyWebAuthorizationRelationships } from "../../ontology/primitive/util";

export type User = {
  accountId: AccountId;
  kratosIdentityId: string;
  emails: string[];
  shortname?: string;
  preferredName?: string;
  isAccountSignupComplete: boolean;
  entity: Entity;
};

export const getUserFromEntity: PureGraphFunction<{ entity: Entity }, User> = ({
  entity,
}) => {
  if (
    entity.metadata.entityTypeId !== SYSTEM_TYPES.entityType.user.schema.$id
  ) {
    throw new EntityTypeMismatchError(
      entity.metadata.recordId.entityId,
      SYSTEM_TYPES.entityType.user.schema.$id,
      entity.metadata.entityTypeId,
    );
  }

  const kratosIdentityId = entity.properties[
    SYSTEM_TYPES.propertyType.kratosIdentityId.metadata.recordId.baseUrl
  ] as string;

  const shortname = entity.properties[
    SYSTEM_TYPES.propertyType.shortname.metadata.recordId.baseUrl
  ] as string | undefined;

  const preferredName = entity.properties[
    SYSTEM_TYPES.propertyType.shortname.metadata.recordId.baseUrl
  ] as string | undefined;

  const emails = entity.properties[
    SYSTEM_TYPES.propertyType.email.metadata.recordId.baseUrl
  ] as string[];

  const isAccountSignupComplete = !!shortname && !!preferredName;

  return {
    accountId: extractAccountId(
      entity.metadata.recordId.entityId as AccountEntityId,
    ),
    shortname,
    preferredName,
    isAccountSignupComplete,
    emails,
    kratosIdentityId,
    entity,
  };
};

/**
 * Get a system user entity by its entity id.
 *
 * @param params.entityId - the entity id of the user
 */
export const getUserById: ImpureGraphFunction<
  { entityId: EntityId },
  Promise<User>
> = async (ctx, authentication, { entityId }) => {
  const entity = await getLatestEntityById(ctx, authentication, { entityId });

  return getUserFromEntity({ entity });
};

/**
 * Get a system user entity by their shortname.
 *
 * @param params.shortname - the shortname of the user
 */
export const getUserByShortname: ImpureGraphFunction<
  { shortname: string },
  Promise<User | null>
> = async ({ graphApi }, { actorId }, params) => {
  const [userEntity, ...unexpectedEntities] = await graphApi
    .getEntitiesByQuery(actorId, {
      filter: {
        all: [
          generateVersionedUrlMatchingFilter(
            SYSTEM_TYPES.entityType.user.schema.$id,
            { ignoreParents: true },
          ),
          {
            equal: [
              {
                path: [
                  "properties",
                  SYSTEM_TYPES.propertyType.shortname.metadata.recordId.baseUrl,
                ],
              },
              { parameter: params.shortname },
            ],
          },
        ],
      },
      graphResolveDepths: zeroedGraphResolveDepths,
      // TODO: Should this be an all-time query? What happens if the user is
      //       archived/deleted, do we want to allow users to replace their
      //       shortname?
      //   see https://linear.app/hash/issue/H-757
      temporalAxes: currentTimeInstantTemporalAxes,
    })
    .then(({ data }) => {
      const subgraph = mapGraphApiSubgraphToSubgraph<EntityRootType>(data);

      return getRoots(subgraph);
    });

  if (unexpectedEntities.length > 0) {
    throw new Error(
      `Critical: More than one user entity with shortname ${params.shortname} found in the graph.`,
    );
  }

  return userEntity ? getUserFromEntity({ entity: userEntity }) : null;
};

/**
 * Get a system user entity by their kratos identity id.
 *
 * @param params.kratosIdentityId - the kratos identity id
 */
export const getUserByKratosIdentityId: ImpureGraphFunction<
  { kratosIdentityId: string },
  Promise<User | null>
> = async ({ graphApi }, { actorId }, params) => {
  const [userEntity, ...unexpectedEntities] = await graphApi
    .getEntitiesByQuery(actorId, {
      filter: {
        all: [
          generateVersionedUrlMatchingFilter(
            SYSTEM_TYPES.entityType.user.schema.$id,
            { ignoreParents: true },
          ),
          {
            equal: [
              {
                path: [
                  "properties",
                  SYSTEM_TYPES.propertyType.kratosIdentityId.metadata.recordId
                    .baseUrl,
                ],
              },
              { parameter: params.kratosIdentityId },
            ],
          },
        ],
      },
      graphResolveDepths: zeroedGraphResolveDepths,
      temporalAxes: currentTimeInstantTemporalAxes,
    })
    .then(({ data }) => {
      const subgraph = mapGraphApiSubgraphToSubgraph<EntityRootType>(data);

      return getRoots(subgraph);
    });

  if (unexpectedEntities.length > 0) {
    throw new Error(
      `Critical: More than one user entity with kratos identity Id ${params.kratosIdentityId} found in the graph.`,
    );
  }

  return userEntity ? getUserFromEntity({ entity: userEntity }) : null;
};

/**
 * Create a system user entity.
 *
 * @param params.emails - the emails of the user
 * @param params.kratosIdentityId - the kratos identity id of the user
 * @param params.isInstanceAdmin (optional) - whether or not the user is an instance admin of the HASH instance (defaults to `false`)
 * @param params.shortname (optional) - the shortname of the user
 * @param params.preferredName (optional) - the preferred name of the user
 * @param params.accountId (optional) - the pre-populated account Id of the user
 */
export const createUser: ImpureGraphFunction<
  Omit<CreateEntityParams, "properties" | "entityTypeId" | "ownedById"> & {
    emails: string[];
    kratosIdentityId: string;
    shortname?: string;
    preferredName?: string;
    isInstanceAdmin?: boolean;
    userAccountId?: AccountId;
  },
  Promise<User>
> = async (ctx, authentication, params) => {
  const {
    emails,
    kratosIdentityId,
    shortname,
    preferredName,
    isInstanceAdmin = false,
  } = params;

  const existingUserWithKratosIdentityId = await getUserByKratosIdentityId(
    ctx,
    authentication,
    {
      kratosIdentityId,
    },
  );

  if (existingUserWithKratosIdentityId) {
    throw new Error(
      `A user entity with kratos identity id "${kratosIdentityId}" already exists.`,
    );
  }

  if (shortname) {
    if (shortnameIsInvalid({ shortname })) {
      throw new Error(`The shortname "${shortname}" is invalid`);
    }

    if (
      shortnameIsRestricted({ shortname }) ||
      (await shortnameIsTaken(ctx, authentication, { shortname }))
    ) {
      throw new Error(
        `An account with shortname "${shortname}" already exists.`,
      );
    }
  }

  let userAccountId: AccountId;
  if (params.userAccountId) {
    userAccountId = params.userAccountId;
  } else {
    userAccountId = await createAccount(ctx, authentication, {});

    await createWeb(
      ctx,
      { actorId: systemAccountId },
      {
        ownedById: userAccountId as OwnedById,
        owner: {
          kind: "account",
          /**
           * Creating a web allows users to create further entities in it
           * – we don't want them to do that until they've completed signup (have a shortname and preferredName)
           * - the web is created with the system account as the owner and will be updated to the user account as the
           *   owner once the user has completed signup
           */
          subjectId:
            shortname && preferredName ? userAccountId : systemAccountId,
        },
      },
    );
  }

  const properties: EntityPropertiesObject = {
    [SYSTEM_TYPES.propertyType.email.metadata.recordId.baseUrl]: emails,
    [SYSTEM_TYPES.propertyType.kratosIdentityId.metadata.recordId.baseUrl]:
      kratosIdentityId,
    ...(shortname
      ? {
          [SYSTEM_TYPES.propertyType.shortname.metadata.recordId.baseUrl]:
            shortname,
        }
      : {}),
    ...(preferredName
      ? {
          [SYSTEM_TYPES.propertyType.preferredName.metadata.recordId.baseUrl]:
            preferredName,
        }
      : {}),
  };

  const entity = await createEntity(
    ctx,
    { actorId: userAccountId },
    {
      ownedById: userAccountId as OwnedById,
      properties,
      entityTypeId: SYSTEM_TYPES.entityType.user.schema.$id,
      entityUuid: userAccountId as string as EntityUuid,
    },
  );
  await modifyEntityAuthorizationRelationships(
    ctx,
    { actorId: userAccountId },
    [
      {
        operation: "create",
        relationship: {
          subject: {
            kind: "public",
          },
          relation: "viewer",
          resource: {
            kind: "entity",
            resourceId: entity.metadata.recordId.entityId,
          },
        },
      },
    ],
  );

  const user = getUserFromEntity({ entity });

  if (isInstanceAdmin) {
    await addHashInstanceAdmin(ctx, authentication, { user });
  }

  return user;
};

/**
 * Get the kratos identity associated with the user.
 *
 * @param params.user - the user
 */
export const getUserKratosIdentity: ImpureGraphFunction<
  { user: User },
  Promise<KratosUserIdentity>
> = async (_, __, { user }) => {
  const { kratosIdentityId } = user;

  const { data: kratosIdentity } = await kratosIdentityApi.getIdentity({
    id: kratosIdentityId,
  });

  return kratosIdentity;
};

/**
 * Update the kratos identity associated with a user.
 *
 * @param params.user - the user
 * @param params.updatedTraits - the updated kratos identity traits of the user
 */
export const updateUserKratosIdentityTraits: ImpureGraphFunction<
  { user: User; updatedTraits: Partial<KratosUserIdentityTraits> },
  Promise<void>
> = async (ctx, authentication, { user, updatedTraits }) => {
  const {
    id: kratosIdentityId,
    traits: currentKratosTraits,
    schema_id,
    state,
  } = await getUserKratosIdentity(ctx, authentication, { user });

  /** @todo: figure out why the `state` can be undefined */
  if (!state) {
    throw new Error("Previous user identity state is undefined");
  }

  await kratosIdentityApi.updateIdentity({
    id: kratosIdentityId,
    updateIdentityBody: {
      schema_id,
      state,
      traits: {
        ...currentKratosTraits,
        ...updatedTraits,
      },
    },
  });
};

/**
 * Make the user a member of an organization.
 *
 * @param params.user - the user
 * @param params.org - the organization the user is joining
 * @param params.actorId - the id of the account that is making the user a member of the organization
 */
export const joinOrg: ImpureGraphFunction<
  {
    userEntityId: EntityId;
    orgEntityId: EntityId;
  },
  Promise<void>
> = async (ctx, authentication, params) => {
  const { userEntityId, orgEntityId } = params;

  await createOrgMembership(ctx, authentication, {
    orgEntityId,
    userEntityId,
  });
};

/**
 * Get the org memberships of a user.
 *
 * @param params.user - the user
 */
export const getUserOrgMemberships: ImpureGraphFunction<
  { userEntityId: EntityId },
  Promise<OrgMembership[]>
> = async (ctx, authentication, { userEntityId }) => {
  const outgoingOrgMembershipLinkEntities = await getEntityOutgoingLinks(
    ctx,
    authentication,
    {
      entityId: userEntityId,
      linkEntityTypeVersionedUrl:
        SYSTEM_TYPES.linkEntityType.orgMembership.schema.$id,
    },
  );

  return outgoingOrgMembershipLinkEntities.map((linkEntity) =>
    getOrgMembershipFromLinkEntity({ linkEntity }),
  );
};

/**
 * Whether or not a user is a member of an org.
 *
 * @param params.user - the user
 * @param params.orgEntityUuid - the entity Uuid of the org the user may be a member of
 */
export const isUserMemberOfOrg: ImpureGraphFunction<
  { userEntityId: EntityId; orgEntityUuid: EntityUuid },
  Promise<boolean>
> = async (ctx, authentication, params) => {
  const orgMemberships = await getUserOrgMemberships(
    ctx,
    authentication,
    params,
  );

  const orgs = await Promise.all(
    orgMemberships.map((orgMembership) =>
      getOrgMembershipOrg(ctx, authentication, { orgMembership }),
    ),
  );

  return !!orgs.find(
    (org) =>
      extractEntityUuidFromEntityId(org.entity.metadata.recordId.entityId) ===
      params.orgEntityUuid,
  );
};

/**
 * Check whether or not the user is a hash instance admin.
 *
 * @param params.user - the user that may be a hash instance admin.
 */
export const isUserHashInstanceAdmin: ImpureGraphFunction<
  { user: User },
  Promise<boolean>
> = async (ctx, authentication, { user }) =>
  getHashInstance(ctx, authentication, {}).then((hashInstance) =>
    checkEntityPermission(
      ctx,
      { actorId: user.accountId },
      {
        entityId: hashInstance.entity.metadata.recordId.entityId,
        permission: "update",
      },
    ),
  );
