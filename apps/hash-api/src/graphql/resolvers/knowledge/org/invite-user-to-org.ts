import {
  type Entity,
  type EntityId,
  entityIdFromComponents,
  extractEntityUuidFromEntityId,
  type WebId,
} from "@blockprotocol/type-system";
import {
  createDefaultAuthorizationRelationships,
  currentTimeInstantTemporalAxes,
  generateVersionedUrlMatchingFilter,
} from "@local/hash-isomorphic-utils/graph-queries";
import type { MutationInviteUserToOrgArgs } from "@local/hash-isomorphic-utils/graphql/api-types.gen";
import {
  systemDataTypes,
  systemEntityTypes,
  systemLinkEntityTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import type {
  InvitedUser,
  IsInvitedTo,
} from "@local/hash-isomorphic-utils/system-types/inviteduser";
import { ApolloError } from "apollo-server-errors";

import {
  createEntity,
  getEntities,
} from "../../../../graph/knowledge/primitive/entity";
import { createLinkEntity } from "../../../../graph/knowledge/primitive/link-entity";
import {
  getOrgById,
  type Org,
} from "../../../../graph/knowledge/system-types/org";
import {
  getUserByEmail,
  getUserByShortname,
  type User,
} from "../../../../graph/knowledge/system-types/user";
import { systemAccountId } from "../../../../graph/system-account";
import type { ResolverFn } from "../../../api-types.gen";
import type { LoggedInGraphQLContext } from "../../../context";
import { graphQLContextToImpureGraphContext } from "../../util";

const invitationDurationInDays = 30;

const generateExistingInvitationFilter = (
  orgWebId: WebId,
  userEntityId: EntityId,
) => {
  return {
    all: [
      generateVersionedUrlMatchingFilter(
        systemLinkEntityTypes.isInvitedTo.linkEntityTypeId,
      ),
      {
        equal: [
          {
            path: ["webId"],
          },
          {
            parameter: orgWebId,
          },
        ],
      },
      {
        equal: [
          {
            path: ["archived"],
          },
          {
            parameter: false,
          },
        ],
      },
      {
        equal: [
          {
            path: ["rightEntity", "uuid"],
          },
          {
            parameter: orgWebId,
          },
        ],
      },
      {
        equal: [
          {
            path: ["leftEntity", "uuid"],
          },
          {
            parameter: extractEntityUuidFromEntityId(userEntityId),
          },
        ],
      },
    ],
  };
};

export const inviteUserToOrgResolver: ResolverFn<
  Promise<boolean>,
  Record<string, never>,
  LoggedInGraphQLContext,
  MutationInviteUserToOrgArgs
> = async (_, { userEmail, userShortname, orgWebId }, graphQLContext) => {
  const { authentication } = graphQLContext;

  const context = graphQLContextToImpureGraphContext(graphQLContext);

  let userToInvite: User | null = null;

  if (userEmail) {
    userToInvite = await getUserByEmail(context, authentication, {
      email: userEmail,
    });

    if (userToInvite) {
      throw new ApolloError(
        "User with email already exists, please provide their username instead",
        "BAD_REQUEST",
      );
    }
  } else if (userShortname) {
    userToInvite = await getUserByShortname(context, authentication, {
      shortname: userShortname,
    });

    if (!userToInvite) {
      throw new ApolloError(
        `User with username ${userShortname} not found`,
        "NOT_FOUND",
      );
    }
  }

  const orgEntityId = entityIdFromComponents(orgWebId, orgWebId);

  let org: Org | null = null;
  try {
    org = await getOrgById(context, authentication, {
      entityId: orgEntityId,
    });
  } catch {
    throw new ApolloError(
      `Organization with webId ${orgWebId} not found`,
      "NOT_FOUND",
    );
  }

  const existingMembershipLink = !userToInvite
    ? null
    : await getEntities(context, authentication, {
        includeDrafts: false,
        temporalAxes: currentTimeInstantTemporalAxes,
        filter: {
          all: [
            {
              equal: [
                {
                  path: ["webId"],
                },
                {
                  parameter: orgWebId,
                },
              ],
            },
            {
              equal: [
                {
                  path: ["type", "versionedUrl"],
                },
                {
                  parameter: systemLinkEntityTypes.isMemberOf.linkEntityTypeId,
                },
              ],
            },
            {
              equal: [
                {
                  path: ["rightEntity", "uuid"],
                },
                {
                  parameter: orgWebId,
                },
              ],
            },
            {
              equal: [
                {
                  path: ["leftEntity", "uuid"],
                },
                {
                  parameter: extractEntityUuidFromEntityId(
                    userToInvite.entity.metadata.recordId.entityId,
                  ),
                },
              ],
            },
          ],
        },
      }).then((entities) => entities[0]);

  if (existingMembershipLink) {
    throw new ApolloError(
      "User is already a member of this organization",
      "BAD_REQUEST",
    );
  }

  const isOrgAdmin = await context.graphApi
    .hasActorGroupRole(
      authentication.actorId,
      org.webId,
      "administrator",
      authentication.actorId,
    )
    .then(({ data }) => data);

  if (!isOrgAdmin) {
    throw new ApolloError(
      "You must be an administrator to invite users to this organization",
      "UNAUTHORIZED",
    );
  }

  let userEntity: Entity | null = null;
  if (!userToInvite) {
    if (!userEmail) {
      throw new ApolloError(
        "No existing user found, and no email to issue an invitation to provided",
        "BAD_REQUEST",
      );
    }

    const existingPendingUserEntity = await getEntities(
      context,
      authentication,
      {
        includeDrafts: false,
        temporalAxes: currentTimeInstantTemporalAxes,
        filter: {
          all: [
            generateVersionedUrlMatchingFilter(
              systemEntityTypes.invitedUser.entityTypeId,
            ),
            {
              equal: [
                {
                  path: [
                    "properties",
                    systemPropertyTypes.email.propertyTypeBaseUrl,
                  ],
                },
                {
                  parameter: userEmail,
                },
              ],
            },
          ],
        },
      },
    ).then((entities) => entities[0]);

    const existingLink = !existingPendingUserEntity
      ? null
      : await getEntities(context, authentication, {
          includeDrafts: false,
          temporalAxes: currentTimeInstantTemporalAxes,
          filter: generateExistingInvitationFilter(
            orgWebId,
            existingPendingUserEntity.metadata.recordId.entityId,
          ),
        });

    if (existingLink) {
      throw new ApolloError(
        "There is already an invitation pending for this user",
        "BAD_REQUEST",
      );
    }

    userEntity =
      existingPendingUserEntity ??
      (await createEntity<InvitedUser>(context, authentication, {
        entityTypeIds: [systemEntityTypes.invitedUser.entityTypeId],
        properties: {
          value: {
            "https://hash.ai/@h/types/property-type/email/": {
              value: userEmail,
              metadata: {
                dataTypeId: systemDataTypes.email.dataTypeId,
              },
            },
          },
        },
        /**
         * We need the system account to be able to see this entity, because we need to be able to check for it when a new user signs up
         */
        relationships: createDefaultAuthorizationRelationships({
          actorId: systemAccountId,
        }),
        webId: orgWebId,
      }));
  } else {
    userEntity = userToInvite.entity;

    const existingLink = await getEntities(context, authentication, {
      includeDrafts: false,
      temporalAxes: currentTimeInstantTemporalAxes,
      filter: generateExistingInvitationFilter(
        orgWebId,
        userToInvite.entity.metadata.recordId.entityId,
      ),
    }).then((entities) => entities[0]);

    if (existingLink) {
      throw new ApolloError(
        "There is already an invitation pending for this user",
        "BAD_REQUEST",
      );
    }
  }

  await createLinkEntity<IsInvitedTo>(context, authentication, {
    entityTypeIds: [systemLinkEntityTypes.isInvitedTo.linkEntityTypeId],
    properties: {
      value: {
        "https://hash.ai/@h/types/property-type/expired-at/": {
          value: new Date(
            Date.now() + invitationDurationInDays * 24 * 60 * 60 * 1000,
          ).toISOString(),
          metadata: {
            dataTypeId: systemDataTypes.datetime.dataTypeId,
          },
        },
      },
    },
    linkData: {
      leftEntityId: userEntity.metadata.recordId.entityId,
      rightEntityId: org.entity.metadata.recordId.entityId,
    },
    relationships: createDefaultAuthorizationRelationships({
      /**
       * There are two circumstances in which we need to be able to see this link:
       * 1. When a user already has an account, and has been invited – in which case _they_ need to see it
       * 2. If someone arrives from an invitation link sent to their email, but doesn't yet have an account
       *    - in which case we need to retrieve it on their behalf using the system account.
       */
      actorId: userToInvite ? userToInvite.accountId : systemAccountId,
    }),
    webId: orgWebId,
  });

  return true;
};
