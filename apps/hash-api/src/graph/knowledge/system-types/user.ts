import { EntityTypeMismatchError } from "@local/hash-backend-utils/error";
import { getHashInstanceAdminAccountGroupId } from "@local/hash-backend-utils/hash-instance";
import { createWebMachineActor } from "@local/hash-backend-utils/machine-actors";
import type { Entity } from "@local/hash-graph-sdk/entity";
import type { AccountId } from "@local/hash-graph-types/account";
import type { EntityId, EntityUuid } from "@local/hash-graph-types/entity";
import type { OwnedById } from "@local/hash-graph-types/web";
import type { FeatureFlag } from "@local/hash-isomorphic-utils/feature-flags";
import {
  currentTimeInstantTemporalAxes,
  generateVersionedUrlMatchingFilter,
} from "@local/hash-isomorphic-utils/graph-queries";
import {
  systemEntityTypes,
  systemLinkEntityTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import { mapGraphApiEntityToEntity } from "@local/hash-isomorphic-utils/subgraph-mapping";
import type { User as UserEntity } from "@local/hash-isomorphic-utils/system-types/user";
import type {
  AccountEntityId,
  extractAccountId,
  extractEntityUuidFromEntityId,
} from "@local/hash-subgraph";

import type {
  kratosIdentityApi,
  KratosUserIdentity,
  KratosUserIdentityTraits,
} from "../../../auth/ory-kratos";
import { createAccount, createWeb } from "../../account-permission-management";
import type {
  ImpureGraphFunction,
  PureGraphFunction,
} from "../../context-types";
import { systemAccountId } from "../../system-account";
import {
  createEntity,
  getEntityOutgoingLinks,
  getLatestEntityById,
} from "../primitive/entity";

import {
  shortnameIsInvalid,
  shortnameIsRestricted,
  shortnameIsTaken,
} from "./account.fields";
import { addHashInstanceAdmin } from "./hash-instance";
import type {
  createOrgMembership,
  getOrgMembershipFromLinkEntity,
  getOrgMembershipOrg,
  OrgMembership,
} from "./org-membership";

export interface User {
  accountId: AccountId;
  kratosIdentityId: string;
  emails: string[];
  shortname?: string;
  displayName?: string;
  isAccountSignupComplete: boolean;
  entity: Entity<UserEntity>;
}

function assertUserEntity(
  entity: Entity,
): asserts entity is Entity<UserEntity> {
  if (entity.metadata.entityTypeId !== systemEntityTypes.user.entityTypeId) {
    throw new EntityTypeMismatchError(
      entity.metadata.recordId.entityId,
      systemEntityTypes.user.entityTypeId,
      entity.metadata.entityTypeId,
    );
  }
}

export const getUserFromEntity: PureGraphFunction<{ entity: Entity }, User> = ({
  entity,
}) => {
  assertUserEntity(entity);

  const {
    kratosIdentityId,
    shortname,
    displayName,
    email: emails,
  } = simplifyProperties(entity.properties);

  const isAccountSignupComplete = Boolean(shortname) && Boolean(displayName);

  return {
    accountId: extractAccountId(
      entity.metadata.recordId.entityId as AccountEntityId,
    ),
    shortname,
    displayName,
    isAccountSignupComplete,
    emails,
    kratosIdentityId,
    entity,
  };
};

/**
 * Get a system user entity by its entity id.
 *
 * @param params.entityId - The entity id of the user.
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
 * @param params.shortname - The shortname of the user.
 */
export const getUserByShortname: ImpureGraphFunction<
  { shortname: string; includeDrafts?: boolean },
  Promise<User | null>
> = async ({ graphApi }, { actorId }, params) => {
  const [userEntity, ...unexpectedEntities] = await graphApi
    .getEntities(actorId, {
      filter: {
        all: [
          generateVersionedUrlMatchingFilter(
            systemEntityTypes.user.entityTypeId,
            { ignoreParents: true },
          ),
          {
            equal: [
              {
                path: [
                  "properties",
                  systemPropertyTypes.shortname.propertyTypeBaseUrl,
                ],
              },
              { parameter: params.shortname },
            ],
          },
        ],
      },
      // TODO: Should this be an all-time query? What happens if the user is
      //       archived/deleted, do we want to allow users to replace their
      //       shortname?
      //   see https://linear.app/hash/issue/H-757
      temporalAxes: currentTimeInstantTemporalAxes,
      includeDrafts: params.includeDrafts ?? false,
    })
    .then(({ data: response }) =>
      response.entities.map((entity) =>
        mapGraphApiEntityToEntity(entity, actorId),
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
 * Get a system user entity by their kratos identity id – only to be used for resolving the requesting user,
 * or checking for conflicts with an existing kratosIdentityId.
 *
 * @param params.kratosIdentityId - The kratos identity id.
 */
export const getUserByKratosIdentityId: ImpureGraphFunction<
  { kratosIdentityId: string; includeDrafts?: boolean },
  Promise<User | null>
> = async (context, authentication, params) => {
  const [userEntity, ...unexpectedEntities] = await context.graphApi
    .getEntities(authentication.actorId, {
      filter: {
        all: [
          generateVersionedUrlMatchingFilter(
            systemEntityTypes.user.entityTypeId,
            { ignoreParents: true },
          ),
          {
            equal: [
              {
                path: [
                  "properties",
                  systemPropertyTypes.kratosIdentityId.propertyTypeBaseUrl,
                ],
              },
              { parameter: params.kratosIdentityId },
            ],
          },
        ],
      },
      temporalAxes: currentTimeInstantTemporalAxes,
      includeDrafts: params.includeDrafts ?? false,
    })
    .then(({ data: response }) =>
      response.entities.map((entity) =>
        /**
         * We don't have the user's actorId yet, so the mapping function can't match the requesting user
         * to the entity being sought – we pass 'true' to preserve their properties so that private properties aren't omitted.
         * This function should only be used to return the user entity to a user who is authenticated with the correct kratosIdentityId.
         */
        mapGraphApiEntityToEntity(entity, null, true),
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
 * @param params.emails - The emails of the user.
 * @param params.kratosIdentityId - The kratos identity id of the user.
 * @param params.enabledFeatureFlags - (optional) - the feature flags enabled for the user.
 * @param params.isInstanceAdmin - (optional) - whether or not the user is an instance admin of the HASH instance (defaults to `false`).
 * @param params.shortname - (optional) - the shortname of the user.
 * @param params.displayName - (optional) - the display name of the user.
 * @param params.accountId - (optional) - the pre-populated account Id of the user.
 */
export const createUser: ImpureGraphFunction<
  {
    emails: string[];
    kratosIdentityId: string;
    enabledFeatureFlags?: FeatureFlag[];
    shortname?: string;
    displayName?: string;
    isInstanceAdmin?: boolean;
    userAccountId?: AccountId;
  },
  Promise<User>
> = async (ctx, authentication, params) => {
  const {
    emails,
    kratosIdentityId,
    shortname,
    enabledFeatureFlags,
    displayName,
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

  const userShouldHavePermissionsOnWeb = shortname && displayName;

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
           * – we don't want them to do that until they've completed signup (have a shortname and display name)
           * - the web is created with the system account as the owner and will be updated to the user account as the
           *   owner once the user has completed signup.
           */
          subjectId: userShouldHavePermissionsOnWeb
            ? userAccountId
            : systemAccountId,
        },
      },
    );
  }

  const userWebMachineActorId = await createWebMachineActor(
    ctx,
    {
      actorId: userShouldHavePermissionsOnWeb ? userAccountId : systemAccountId,
    },
    {
      ownedById: userAccountId as OwnedById,
    },
  );

  const properties: UserEntity["propertiesWithMetadata"] = {
    value: {
      "https://hash.ai/@hash/types/property-type/email/": {
        value: emails.map((email) => ({
          value: email,
          metadata: {
            dataTypeId:
              "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
          },
        })),
      },
      "https://hash.ai/@hash/types/property-type/kratos-identity-id/": {
        value: kratosIdentityId,
        metadata: {
          dataTypeId:
            "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
        },
      },
      ...(shortname !== undefined
        ? {
            "https://hash.ai/@hash/types/property-type/shortname/": {
              value: shortname,
              metadata: {
                dataTypeId:
                  "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
              },
            },
          }
        : {}),
      ...(displayName !== undefined
        ? {
            "https://blockprotocol.org/@blockprotocol/types/property-type/display-name/":
              {
                value: displayName,
                metadata: {
                  dataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                },
              },
          }
        : {}),
      ...(enabledFeatureFlags !== undefined
        ? {
            "https://hash.ai/@hash/types/property-type/enabled-feature-flags/":
              {
                value: enabledFeatureFlags.map((flag) => ({
                  value: flag,
                  metadata: {
                    dataTypeId:
                      "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  },
                })),
              },
          }
        : {}),
    },
  };

  /** Grant permissions to the web machine actor to create a user entity */
  await ctx.graphApi.modifyEntityTypeAuthorizationRelationships(
    systemAccountId,
    [
      {
        operation: "create",
        resource: systemEntityTypes.user.entityTypeId,
        relationAndSubject: {
          subject: {
            kind: "account",
            subjectId: userWebMachineActorId,
          },
          relation: "instantiator",
        },
      },
    ],
  );

  const hashInstanceAdminsAccountGroupId =
    await getHashInstanceAdminAccountGroupId(ctx, authentication);

  const entity = await createEntity<UserEntity>(
    ctx,
    { actorId: userWebMachineActorId },
    {
      ownedById: userAccountId as OwnedById,
      properties,
      entityTypeId: systemEntityTypes.user.entityTypeId,
      entityUuid: userAccountId as string as EntityUuid,
      relationships: [
        {
          relation: "administrator",
          subject: {
            kind: "accountGroup",
            subjectId: hashInstanceAdminsAccountGroupId,
            subjectSet: "member",
          },
        },
        {
          relation: "viewer",
          subject: {
            kind: "public",
          },
        },
        {
          relation: "setting",
          subject: {
            kind: "setting",
            subjectId: "updateFromWeb",
          },
        },
      ],
    },
  );

  /** Remove permission from the web machine actor to create a user entity */
  await ctx.graphApi.modifyEntityTypeAuthorizationRelationships(
    systemAccountId,
    [
      {
        operation: "delete",
        resource: systemEntityTypes.user.entityTypeId,
        relationAndSubject: {
          subject: {
            kind: "account",
            subjectId: userWebMachineActorId,
          },
          relation: "instantiator",
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
 * @param params.user - The user.
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
 * @param params.user - The user.
 * @param params.updatedTraits - The updated kratos identity traits of the user.
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
 * @param params.user - The user.
 * @param params.org - The organization the user is joining.
 * @param params.actorId - The id of the account that is making the user a member of the organization.
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
 * @param params.userEntityId - The entityId of the user.
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
        systemLinkEntityTypes.isMemberOf.linkEntityTypeId,
    },
  );

  return outgoingOrgMembershipLinkEntities.map((linkEntity) =>
    getOrgMembershipFromLinkEntity({ linkEntity }),
  );
};

/**
 * Whether or not a user is a member of an org.
 *
 * @param params.user - The user.
 * @param params.orgEntityUuid - The entity Uuid of the org the user may be a member of.
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
      getOrgMembershipOrg(ctx, authentication, {
        orgMembership,
      }),
    ),
  );

  return Boolean(
    orgs.find(
      (org) =>
        extractEntityUuidFromEntityId(org.entity.metadata.recordId.entityId) ===
        params.orgEntityUuid,
    ),
  );
};
