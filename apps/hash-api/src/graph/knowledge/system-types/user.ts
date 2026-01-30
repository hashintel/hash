import type { EntityId, EntityUuid, UserId } from "@blockprotocol/type-system";
import {
  atLeastOne,
  extractBaseUrl,
  extractEntityUuidFromEntityId,
  extractWebIdFromEntityId,
} from "@blockprotocol/type-system";
import { EntityTypeMismatchError } from "@local/hash-backend-utils/error";
import { createWebMachineActorEntity } from "@local/hash-backend-utils/machine-actors";
import type { Filter } from "@local/hash-graph-client";
import {
  type HashEntity,
  queryEntities,
  queryEntitySubgraph,
} from "@local/hash-graph-sdk/entity";
import {
  addActorGroupMember,
  createUserActor,
} from "@local/hash-graph-sdk/principal/actor-group";
import { getInstanceAdminsTeam } from "@local/hash-graph-sdk/principal/hash-instance-admins";
import {
  type FeatureFlag,
  featureFlags,
} from "@local/hash-isomorphic-utils/feature-flags";
import {
  currentTimeInstantTemporalAxes,
  generateVersionedUrlMatchingFilter,
} from "@local/hash-isomorphic-utils/graph-queries";
import type { PendingOrgInvitation } from "@local/hash-isomorphic-utils/graphql/api-types.gen";
import {
  systemEntityTypes,
  systemLinkEntityTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
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

/**
 * Fetch user emails from Kratos identity traits.
 * This is the source of truth for emails since DB-level masking hides them from non-owners.
 */
const getEmailsFromKratos = async (
  kratosIdentityId: string,
): Promise<string[]> => {
  try {
    const { data: identity } = await kratosIdentityApi.getIdentity({
      id: kratosIdentityId,
    });
    return (identity.traits as KratosUserIdentityTraits).emails;
  } catch (error) {
    logger.warn(
      `Failed to fetch emails from Kratos for identity ${kratosIdentityId}: ${error}`,
    );
    return [];
  }
};

/**
 * Lookup a Kratos identity by email address.
 * Returns the kratosIdentityId if found, null otherwise.
 */
const getKratosIdentityIdByEmail = async (
  email: string,
): Promise<string | null> => {
  try {
    const { data: identities } = await kratosIdentityApi.listIdentities({
      credentialsIdentifier: email,
    });
    return identities.length > 0 ? identities[0]!.id : null;
  } catch (error) {
    logger.warn(`Failed to lookup Kratos identity by email ${email}: ${error}`);
    return null;
  }
};

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
 * Get a user by any available identifier.
 * Emails are always fetched from Kratos (the source of truth) since DB-level
 * masking hides them from non-owners.
 *
 * @param params.entityId - the entity id of the user
 * @param params.shortname - the shortname of the user
 * @param params.kratosIdentityId - the kratos identity id of the user
 * @param params.emails - the emails of the user
 */
export const getUser: ImpureGraphFunction<
  | {
      entityId: EntityId;
      emails?: [string, ...string[]];
    }
  | {
      shortname: string;
      emails?: [string, ...string[]];
      includeDrafts?: boolean;
    }
  | {
      kratosIdentityId: string;
      emails?: [string, ...string[]];
      includeDrafts?: boolean;
    }
  | {
      emails: [string, ...string[]];
      kratosIdentityId?: string;
      includeDrafts?: boolean;
    },
  Promise<User | null>
> = async (context, authentication, params) => {
  const knownShortname = "shortname" in params ? params.shortname : null;

  let emails = params.emails;
  let kratosIdentityId =
    "kratosIdentityId" in params ? params.kratosIdentityId : null;

  let entity: HashEntity<UserEntity>;

  if ("entityId" in params) {
    try {
      entity = await getLatestEntityById<UserEntity>(context, authentication, {
        entityId: params.entityId,
      });
    } catch {
      return null;
    }
  } else {
    let queryFilter: Filter;

    if (emails && !kratosIdentityId && !knownShortname) {
      // If we would have the shortname, we could use it to find the user, but we don't have it so we use the email to find the kratos Identity ID.
      kratosIdentityId = await getKratosIdentityIdByEmail(emails[0]);
      if (!kratosIdentityId) {
        return null;
      }
    }

    if (kratosIdentityId) {
      queryFilter = {
        equal: [
          {
            path: [
              "properties",
              systemPropertyTypes.kratosIdentityId.propertyTypeBaseUrl,
            ],
          },
          { parameter: kratosIdentityId },
        ],
      };
    } else {
      queryFilter = {
        equal: [
          {
            path: [
              "properties",
              systemPropertyTypes.shortname.propertyTypeBaseUrl,
            ],
          },
          { parameter: knownShortname },
        ],
      };
    }

    const {
      entities: [userEntity, ...unexpectedEntities],
    } = await queryEntities<UserEntity>(context, authentication, {
      filter: {
        all: [
          generateVersionedUrlMatchingFilter(
            systemEntityTypes.user.entityTypeId,
            {
              ignoreParents: true,
            },
          ),
          queryFilter,
        ],
      },
      temporalAxes: currentTimeInstantTemporalAxes,
      includeDrafts: !!params.includeDrafts,
      includePermissions: false,
    });

    if (!userEntity) {
      return null;
    }

    if (unexpectedEntities.length > 0) {
      throw new Error(
        `Critical: More than one user entity found for query params: ${JSON.stringify(params)}`,
      );
    }

    entity = userEntity;
  }

  emails ??= atLeastOne(
    await getEmailsFromKratos(
      entity.properties[
        "https://hash.ai/@h/types/property-type/kratos-identity-id/"
      ],
    ),
  );

  if (!emails) {
    throw new Error(
      `Critical: No email found for user with kratos identity id: ${
        entity.properties[
          "https://hash.ai/@h/types/property-type/kratos-identity-id/"
        ]
      }`,
    );
  }
  entity.properties["https://hash.ai/@h/types/property-type/email/"] = emails;

  return getUserFromEntity({ entity });
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
    emails: [string, ...string[]];
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

  const existingUserWithKratosIdentityId = await getUser(ctx, authentication, {
    kratosIdentityId,
    emails,
  });

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

  const { userId, machineId } = await createUserActor(
    ctx.graphApi,
    authentication,
    {
      shortname,
      registrationComplete: userShouldHavePermissionsOnWeb,
    },
  );

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

  const entity = await createEntity<UserEntity>(
    ctx,
    { actorId: machineId },
    {
      webId: userId,
      properties,
      entityTypeIds: [systemEntityTypes.user.entityTypeId],
      entityUuid: userId,
    },
  );

  const user = getUserFromEntity({ entity });

  if (isInstanceAdmin) {
    const instanceAdmins = await getInstanceAdminsTeam(ctx, authentication);
    await addActorGroupMember(ctx.graphApi, authentication, {
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

  const { subgraph: invitationSubgraph } = await queryEntitySubgraph(
    context,
    systemAccountAuthentication,
    {
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
      traversalPaths: [
        {
          edges: [
            {
              kind: "has-right-entity",
              direction: "incoming",
            },
            {
              kind: "has-left-entity",
              direction: "outgoing",
            },
          ],
        },
      ],
      includeDrafts: false,
      includePermissions: false,
    },
  );

  const pendingInvitations = await getPendingOrgInvitationsFromSubgraph(
    context,
    systemAccountAuthentication,
    invitationSubgraph,
  );

  return pendingInvitations;
};
