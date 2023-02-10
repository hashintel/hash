import {
  Entity,
  EntityId,
  PropertyObject,
  Subgraph,
  SubgraphRootTypes,
} from "@local/hash-subgraph";
import { getRootsAsEntities } from "@local/hash-subgraph/src/stdlib/element/entity";
import { mapSubgraph } from "@local/hash-subgraph/src/temp";
import {
  AccountId,
  EntityUuid,
  extractEntityUuidFromEntityId,
  OwnedById,
  Uuid,
} from "@local/hash-subgraph/src/types";

import {
  kratosIdentityApi,
  KratosUserIdentity,
  KratosUserIdentityTraits,
} from "../../../auth/ory-kratos";
import { EntityTypeMismatchError } from "../../../lib/error";
import {
  ImpureGraphFunction,
  PureGraphFunction,
  zeroedGraphResolveDepths,
} from "../..";
import { SYSTEM_TYPES } from "../../system-types";
import { systemUserAccountId } from "../../system-user";
import {
  createEntity,
  CreateEntityParams,
  getEntityOutgoingLinks,
  getLatestEntityById,
  updateEntityProperty,
} from "../primitive/entity";
import {
  shortnameIsInvalid,
  shortnameIsRestricted,
  shortnameIsTaken,
} from "./account.fields";
import { addHashInstanceAdmin, getHashInstance } from "./hash-instance";
import { Org } from "./org";
import {
  createOrgMembership,
  getOrgMembershipFromLinkEntity,
  getOrgMembershipOrg,
  OrgMembership,
} from "./org-membership";

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
    SYSTEM_TYPES.propertyType.kratosIdentityId.metadata.recordId.baseUri
  ] as string;

  const shortname = entity.properties[
    SYSTEM_TYPES.propertyType.shortName.metadata.recordId.baseUri
  ] as string | undefined;

  const preferredName = entity.properties[
    SYSTEM_TYPES.propertyType.shortName.metadata.recordId.baseUri
  ] as string | undefined;

  const emails = entity.properties[
    SYSTEM_TYPES.propertyType.email.metadata.recordId.baseUri
  ] as string[];

  const isAccountSignupComplete = !!shortname && !!preferredName;

  return {
    accountId: extractEntityUuidFromEntityId(
      entity.metadata.recordId.entityId,
    ) as Uuid as AccountId,
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
> = async (ctx, { entityId }) => {
  const entity = await getLatestEntityById(ctx, { entityId });

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
> = async ({ graphApi }, params) => {
  const [userEntity, ...unexpectedEntities] = await graphApi
    .getEntitiesByQuery({
      filter: {
        all: [
          {
            equal: [
              { path: ["type", "versionedUri"] },
              { parameter: SYSTEM_TYPES.entityType.user.schema.$id },
            ],
          },
          {
            equal: [
              {
                path: [
                  "properties",
                  SYSTEM_TYPES.propertyType.shortName.metadata.recordId.baseUri,
                ],
              },
              { parameter: params.shortname },
            ],
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
    .then(({ data: userEntitiesSubgraph }) =>
      getRootsAsEntities(
        mapSubgraph(userEntitiesSubgraph) as Subgraph<
          SubgraphRootTypes["entity"]
        >,
      ),
    );

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
> = async ({ graphApi }, params) => {
  const [userEntity, ...unexpectedEntities] = await graphApi
    .getEntitiesByQuery({
      filter: {
        all: [
          {
            equal: [
              { path: ["type", "versionedUri"] },
              { parameter: SYSTEM_TYPES.entityType.user.schema.$id },
            ],
          },
          {
            equal: [
              {
                path: [
                  "properties",
                  SYSTEM_TYPES.propertyType.kratosIdentityId.metadata.recordId
                    .baseUri,
                ],
              },
              { parameter: params.kratosIdentityId },
            ],
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
    .then(({ data: userEntitiesSubgraph }) =>
      getRootsAsEntities(
        mapSubgraph(userEntitiesSubgraph) as Subgraph<
          SubgraphRootTypes["entity"]
        >,
      ),
    );

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
> = async (ctx, params) => {
  const {
    emails,
    kratosIdentityId,
    actorId,
    shortname,
    preferredName,
    isInstanceAdmin = false,
  } = params;

  const existingUserWithKratosIdentityId = await getUserByKratosIdentityId(
    ctx,
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
      (await shortnameIsTaken(ctx, { shortname }))
    ) {
      throw new Error(
        `An account with shortname "${shortname}" already exists.`,
      );
    }
  }

  const { graphApi } = ctx;

  const userAccountId =
    params.userAccountId ?? (await graphApi.createAccountId()).data;

  const properties: PropertyObject = {
    [SYSTEM_TYPES.propertyType.email.metadata.recordId.baseUri]: emails,
    [SYSTEM_TYPES.propertyType.kratosIdentityId.metadata.recordId.baseUri]:
      kratosIdentityId,
    ...(shortname
      ? {
          [SYSTEM_TYPES.propertyType.shortName.metadata.recordId.baseUri]:
            shortname,
        }
      : {}),
    ...(preferredName
      ? {
          [SYSTEM_TYPES.propertyType.preferredName.metadata.recordId.baseUri]:
            preferredName,
        }
      : {}),
  };

  const entity = await createEntity(ctx, {
    ownedById: systemUserAccountId as OwnedById,
    properties,
    entityTypeId: SYSTEM_TYPES.entityType.user.schema.$id,
    entityUuid: userAccountId as EntityUuid,
    actorId,
  });

  const user = getUserFromEntity({ entity });

  if (isInstanceAdmin) {
    await addHashInstanceAdmin(ctx, { user, actorId });
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
> = async (_, { user }) => {
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
> = async (ctx, { user, updatedTraits }) => {
  const {
    id: kratosIdentityId,
    traits: currentKratosTraits,
    schema_id,
    state,
  } = await getUserKratosIdentity(ctx, { user });

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
 * Update the shortname of a User.
 *
 * @param params.user - the user
 * @param params.updatedShortname - the new shortname to assign to the User
 * @param params.actorId - the id of the account that is updating the shortname
 */
export const updateUserShortname: ImpureGraphFunction<
  { user: User; updatedShortname: string; actorId: AccountId },
  Promise<User>
> = async (ctx, params) => {
  const { user, updatedShortname, actorId } = params;

  if (shortnameIsInvalid({ shortname: updatedShortname })) {
    throw new Error(`The shortname "${updatedShortname}" is invalid`);
  }

  if (
    shortnameIsRestricted({ shortname: updatedShortname }) ||
    (await shortnameIsTaken(ctx, { shortname: updatedShortname }))
  ) {
    throw new Error(
      `An account with shortname "${updatedShortname}" already exists.`,
    );
  }

  const previousShortname = user.shortname;

  const updatedUser = await updateEntityProperty(ctx, {
    entity: user.entity,
    propertyTypeBaseUri:
      SYSTEM_TYPES.propertyType.shortName.metadata.recordId.baseUri,
    value: updatedShortname,
    actorId,
  }).then((updatedEntity) => getUserFromEntity({ entity: updatedEntity }));

  await updateUserKratosIdentityTraits(ctx, {
    user: updatedUser,
    updatedTraits: { shortname: updatedShortname },
  }).catch(async (error) => {
    // If an error occurred updating the entity, set the property to have the previous shortname
    await updateEntityProperty(ctx, {
      entity: user.entity,
      propertyTypeBaseUri:
        SYSTEM_TYPES.propertyType.shortName.metadata.recordId.baseUri,
      value: previousShortname,
      actorId,
    });

    return Promise.reject(error);
  });

  return updatedUser;
};

/**
 * Update the preferred name of a User.
 *
 * @param params.user - the user
 * @param params.updatedPreferredName - the new preferred name to assign to the User
 * @param params.actorId - the id of the account that is updating the preferred name
 */
export const updateUserPreferredName: ImpureGraphFunction<
  { user: User; updatedPreferredName: string; actorId: AccountId },
  Promise<User>
> = async (ctx, params) => {
  const { user, updatedPreferredName, actorId } = params;

  if (updatedPreferredName === "") {
    throw new Error(
      `Preferred name "${updatedPreferredName}" cannot be removed.`,
    );
  }

  const updatedEntity = await updateEntityProperty(ctx, {
    entity: user.entity,
    propertyTypeBaseUri:
      SYSTEM_TYPES.propertyType.preferredName.metadata.recordId.baseUri,
    value: updatedPreferredName,
    actorId,
  });

  return getUserFromEntity({ entity: updatedEntity });
};

/**
 * Make the user a member of an organization.
 *
 * @param params.user - the user
 * @param params.org - the organization the user is joining
 * @param params.responsibility - the responsibility of the user at the organization
 * @param params.actorId - the id of the account that is making the user a member of the organization
 */
export const joinOrg: ImpureGraphFunction<
  {
    user: User;
    org: Org;
    responsibility: string;
    actorId: AccountId;
  },
  Promise<void>
> = async (ctx, params) => {
  const { user, org, responsibility, actorId } = params;

  await createOrgMembership(ctx, {
    responsibility,
    org,
    user,
    actorId,
  });
};

/**
 * Get the org memberships of a user.
 *
 * @param params.user - the user
 */
export const getUserOrgMemberships: ImpureGraphFunction<
  { user: User },
  Promise<OrgMembership[]>
> = async (ctx, { user }) => {
  const outgoingOrgMembershipLinkEntities = await getEntityOutgoingLinks(ctx, {
    entity: user.entity,
    linkEntityType: SYSTEM_TYPES.linkEntityType.orgMembership,
  });

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
  { user: User; orgEntityUuid: EntityUuid },
  Promise<boolean>
> = async (ctx, params) => {
  const orgMemberships = await getUserOrgMemberships(ctx, params);

  const orgs = await Promise.all(
    orgMemberships.map((orgMembership) =>
      getOrgMembershipOrg(ctx, { orgMembership }),
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
> = async (ctx, { user }) => {
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

  return outgoingAdminLinkEntities.length === 1;
};
