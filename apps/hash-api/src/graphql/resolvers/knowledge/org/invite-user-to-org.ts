import {
  type Entity,
  entityIdFromComponents,
} from "@blockprotocol/type-system";
import { createDefaultAuthorizationRelationships } from "@local/hash-isomorphic-utils/graph-queries";
import type { MutationInviteUserToOrgArgs } from "@local/hash-isomorphic-utils/graphql/api-types.gen";
import {
  systemDataTypes,
  systemLinkEntityTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import type {
  InvitedUser,
  IsInvitedTo,
} from "@local/hash-isomorphic-utils/system-types/inviteduser";
import { ApolloError } from "apollo-server-errors";

import { createEntity } from "../../../../graph/knowledge/primitive/entity";
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
  } else if (userShortname) {
    userToInvite = await getUserByShortname(context, authentication, {
      shortname: userShortname,
    });

    if (!userToInvite) {
      throw new ApolloError(
        `User with shortname ${userShortname} not found`,
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

  /**
   * @TODO archive any existing invitation to this user from this organization
   */

  let userEntity: Entity | null = null;
  if (!userToInvite) {
    if (!userEmail) {
      throw new ApolloError(
        "No existing user found, and no email to issue an invitation to provided",
        "BAD_REQUEST",
      );
    }

    userEntity = await createEntity<InvitedUser>(context, authentication, {
      entityTypeIds: ["https://hash.ai/@h/types/entity-type/invited-user/v/1"],
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
      relationships: createDefaultAuthorizationRelationships({
        actorId: systemAccountId,
      }),
      webId: orgWebId,
    });
  } else {
    userEntity = userToInvite.entity;
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
