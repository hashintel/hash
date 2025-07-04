import type { EntityId, EntityUuid, UserId } from "@blockprotocol/type-system";
import {
  extractBaseUrl,
  extractEntityUuidFromEntityId,
  extractWebIdFromEntityId,
} from "@blockprotocol/type-system";
import { EntityTypeMismatchError } from "@local/hash-backend-utils/error";
import { getInstanceAdminsTeam } from "@local/hash-backend-utils/hash-instance";
import { createWebMachineActorEntity } from "@local/hash-backend-utils/machine-actors";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
import {
  type FeatureFlag,
  featureFlags,
} from "@local/hash-isomorphic-utils/feature-flags";
import {
  currentTimeInstantTemporalAxes,
  generateVersionedUrlMatchingFilter,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import type { PendingOrgInvitation } from "@local/hash-isomorphic-utils/graphql/api-types.gen";
import {
  systemEntityTypes,
  systemLinkEntityTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import { mapGraphApiEntityToEntity } from "@local/hash-isomorphic-utils/subgraph-mapping";
import type {
  EnabledFeatureFlagsPropertyValue,
  User as UserEntity,
} from "@local/hash-isomorphic-utils/system-types/user";

import type {
  KratosUserIdentity,
  KratosUserIdentityTraits,
} from "../../../auth/ory-kratos";
import { kratosIdentityApi } from "../../../auth/ory-kratos";
import { getPendingOrgInvitationsFromSubgraph } from "../../../graphql/resolvers/knowledge/org/shared";
import { logger } from "../../../logger";
import {
  addActorGroupMember,
  createUserActor,
} from "../../account-permission-management";
import type {
  ImpureGraphFunction,
  PureGraphFunction,
} from "../../context-types";
import { systemAccountId } from "../../system-account";
import {
  createEntity,
  getEntityOutgoingLinks,
  getEntitySubgraphResponse,
  getLatestEntityById,
} from "../primitive/entity";
import {
  shortnameIsInvalid,
  shortnameIsRestricted,
  shortnameIsTaken,
} from "./account.fields";
import type { OrgMembership } from "./org-membership";
import {
  createOrgMembership,
  getOrgMembershipFromLinkEntity,
  getOrgMembershipOrg,
} from "./org-membership";

export type User = {
  accountId: UserId;
  displayName?: string;
  emails: string[];
  enabledFeatureFlags: FeatureFlag[];
  entity: HashEntity<UserEntity>;
  isAccountSignupComplete: boolean;
  kratosIdentityId: string;
  shortname?: string;
};

function assertFeatureFlags(
  uncheckedFeatureFlags: EnabledFeatureFlagsPropertyValue,
): asserts uncheckedFeatureFlags is FeatureFlag[] {
  for (const maybeFlag of uncheckedFeatureFlags) {
    if (!featureFlags.includes(maybeFlag as FeatureFlag)) {
      throw new Error(`Invalid feature flag: ${maybeFlag}`);
    }
  }
}

function assertUserEntity(
  entity: HashEntity,
): asserts entity is HashEntity<UserEntity> {
  if (
    !entity.metadata.entityTypeIds.some(
      (entityTypeId) =>
        extractBaseUrl(entityTypeId) ===
        systemEntityTypes.user.entityTypeBaseUrl,
    )
  ) {
    throw new EntityTypeMismatchError(
      entity.metadata.recordId.entityId,
      systemEntityTypes.user.entityTypeId,
      entity.metadata.entityTypeIds,
    );
  }
}

export const getUserFromEntity: PureGraphFunction<
  { entity: HashEntity },
  User
> = ({ entity }) => {
  assertUserEntity(entity);

  const {
    displayName,
    email: emails,
    enabledFeatureFlags: maybeFeatureFlags,
    kratosIdentityId,
    shortname,
  } = simplifyProperties(entity.properties);

  const isAccountSignupComplete = !!shortname && !!displayName;

  const enabledFeatureFlags = maybeFeatureFlags ?? [];

  assertFeatureFlags(enabledFeatureFlags);

  return {
    accountId: extractWebIdFromEntityId(
      entity.metadata.recordId.entityId,
    ) as UserId,
    displayName,
    emails,
    enabledFeatureFlags,
    entity,
    isAccountSignupComplete,
    kratosIdentityId,
    shortname,
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
 * Get a system user entity by their email.
 *
 * @param params.email - the email of the user
 */
export const getUserByEmail: ImpureGraphFunction<
  { email: string; includeDrafts?: boolean },
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
                /**
                 * @todo H-4936 update when users can have more than one email
                 */
                path: [
                  "properties",
                  systemPropertyTypes.email.propertyTypeBaseUrl,
                  0,
                ],
              },
              { parameter: params.email },
            ],
          },
        ],
      },
      temporalAxes: currentTimeInstantTemporalAxes,
      includeDrafts: false,
    })
    .then(({ data: response }) =>
      response.entities.map((entity) =>
        mapGraphApiEntityToEntity(entity, actorId),
      ),
    );

  if (unexpectedEntities.length > 0) {
    throw new Error(
      `Critical: More than one user entity with email ${params.email} found in the graph.`,
    );
  }

  return userEntity ? getUserFromEntity({ entity: userEntity }) : null;
};

/**
 * Get a system user entity by their shortname.
 *
 * @param params.shortname - the shortname of the user
 */
export const getUserByShortname: ImpureGraphFunction<
  { shortname: string; includeDrafts?: boolean; includeEmails?: boolean },
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
        mapGraphApiEntityToEntity(entity, actorId, params.includeEmails),
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
 * @param params.kratosIdentityId - the kratos identity id
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
 * @param params.emails - the emails of the user
 * @param params.kratosIdentityId - the kratos identity id of the user
 * @param params.enabledFeatureFlags (optional) - the feature flags enabled for the user
 * @param params.isInstanceAdmin (optional) - whether or not the user is an instance admin of the HASH instance (defaults to `false`)
 * @param params.shortname (optional) - the shortname of the user
 * @param params.displayName (optional) - the display name of the user
 * @param params.accountId (optional) - the pre-populated account Id of the user
 */
export const createUser: ImpureGraphFunction<
  {
    emails: string[];
    kratosIdentityId: string;
    enabledFeatureFlags?: FeatureFlag[];
    shortname?: string;
    displayName?: string;
    isInstanceAdmin?: boolean;
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

  const userShouldHavePermissionsOnWeb = !!shortname && !!displayName;

  const { userId, machineId } = await createUserActor(ctx, authentication, {
    shortname,
    registrationComplete: userShouldHavePermissionsOnWeb,
  });

  await createWebMachineActorEntity(ctx, {
    webId: userId,
    machineId,
    logger,
  });

  const properties: UserEntity["propertiesWithMetadata"] = {
    value: {
      "https://hash.ai/@h/types/property-type/email/": {
        value: emails.map((email) => ({
          value: email,
          metadata: {
            dataTypeId: "https://hash.ai/@h/types/data-type/email/v/1",
          },
        })),
      },
      "https://hash.ai/@h/types/property-type/kratos-identity-id/": {
        value: kratosIdentityId,
        metadata: {
          dataTypeId:
            "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
        },
      },
      ...(shortname !== undefined
        ? {
            "https://hash.ai/@h/types/property-type/shortname/": {
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
            "https://hash.ai/@h/types/property-type/enabled-feature-flags/": {
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

  // TODO: Move User-Entity creation to Graph
  //   see https://linear.app/hash/issue/H-4559/move-user-entity-creation-to-graph

  const { id: hashInstanceAdminsAccountGroupId } = await getInstanceAdminsTeam(
    ctx,
    authentication,
  );

  const entity = await createEntity<UserEntity>(
    ctx,
    { actorId: machineId },
    {
      webId: userId,
      properties,
      entityTypeIds: [systemEntityTypes.user.entityTypeId],
      entityUuid: userId,
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

  const user = getUserFromEntity({ entity });

  if (isInstanceAdmin) {
    const instanceAdmins = await getInstanceAdminsTeam(ctx, authentication);
    await addActorGroupMember(ctx, authentication, {
      actorGroupId: instanceAdmins.id,
      actorId: user.accountId,
    });
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
 * @param params.userEntityId - the entityId of the user
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
      getOrgMembershipOrg(ctx, authentication, {
        orgMembership,
      }),
    ),
  );

  return !!orgs.find(
    (org) =>
      extractEntityUuidFromEntityId(org.entity.metadata.recordId.entityId) ===
      params.orgEntityUuid,
  );
};

export const getUserPendingInvitations: ImpureGraphFunction<
  { user: User },
  Promise<PendingOrgInvitation[]>
> = async (context, _authentication, { user }) => {
  /**
   * The system account is used to manage invitations on behalf of the user,
   * because the user does not have permissions on them,
   * to avoid accidentally leaking their identity before they have accepted the invitation.
   *
   * Otherwise an org admin could issue an invitation to an email address and check which user was given permission on the invitation.
   */
  const systemAccountAuthentication = {
    actorId: systemAccountId,
  };

  const { subgraph: invitationSubgraph } = await getEntitySubgraphResponse(
    context,
    systemAccountAuthentication,
    {
      includeDrafts: false,
      temporalAxes: currentTimeInstantTemporalAxes,
      filter: {
        all: [
          generateVersionedUrlMatchingFilter(
            systemEntityTypes.invitation.entityTypeId,
          ),
          {
            equal: [
              {
                path: ["archived"],
              },
              { parameter: false },
            ],
          },
          {
            any: [
              {
                equal: [
                  {
                    /**
                     * @todo H-4936 update when users can have more than one email
                     */
                    path: [
                      "properties",
                      systemPropertyTypes.email.propertyTypeBaseUrl,
                    ],
                  },
                  { parameter: user.emails[0] },
                ],
              },
              ...(user.shortname
                ? [
                    {
                      equal: [
                        {
                          path: [
                            "properties",
                            systemPropertyTypes.shortname.propertyTypeBaseUrl,
                          ],
                        },
                        { parameter: user.shortname },
                      ],
                    },
                  ]
                : []),
            ],
          },
        ],
      },
      graphResolveDepths: {
        ...zeroedGraphResolveDepths,
        hasLeftEntity: {
          incoming: 0,
          outgoing: 1,
        },
        hasRightEntity: {
          incoming: 1,
          outgoing: 0,
        },
      },
    },
  );

  const pendingInvitations = await getPendingOrgInvitationsFromSubgraph(
    context,
    systemAccountAuthentication,
    invitationSubgraph,
  );

  return pendingInvitations;
};
