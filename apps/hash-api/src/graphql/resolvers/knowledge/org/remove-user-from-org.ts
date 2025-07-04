import { entityIdFromComponents } from "@blockprotocol/type-system";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";
import type { MutationRemoveUserFromOrgArgs } from "@local/hash-isomorphic-utils/graphql/api-types.gen";
import { systemLinkEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { ApolloError } from "apollo-server-errors";

import { removeActorGroupMember } from "../../../../graph/account-permission-management";
import { getEntities } from "../../../../graph/knowledge/primitive/entity";
import { getOrgById } from "../../../../graph/knowledge/system-types/org";
import { getUserById } from "../../../../graph/knowledge/system-types/user";
import type { ResolverFn } from "../../../api-types.gen";
import type { LoggedInGraphQLContext } from "../../../context";
import { graphQLContextToImpureGraphContext } from "../../util";

export const removeUserFromOrgResolver: ResolverFn<
  Promise<boolean>,
  Record<string, never>,
  LoggedInGraphQLContext,
  MutationRemoveUserFromOrgArgs
> = async (_, { orgWebId, userEntityId }, graphQLContext) => {
  const { authentication, user } = graphQLContext;

  const context = graphQLContextToImpureGraphContext(graphQLContext);

  const orgEntityId = entityIdFromComponents(orgWebId, orgWebId);

  try {
    await getOrgById(context, authentication, {
      entityId: orgEntityId,
    });
  } catch {
    throw new ApolloError(
      `Organization with webId ${orgWebId} not found`,
      "NOT_FOUND",
    );
  }

  try {
    await getUserById(context, authentication, {
      entityId: userEntityId,
    });
  } catch {
    throw new ApolloError(
      `User with entityId ${userEntityId} not found`,
      "NOT_FOUND",
    );
  }

  const membershipLink = await getEntities(context, authentication, {
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
              path: ["linkData", "rightEntityId"],
            },
            {
              parameter: orgEntityId,
            },
          ],
        },
        {
          equal: [
            {
              path: ["linkData", "leftEntityId"],
            },
            {
              parameter: userEntityId,
            },
          ],
        },
      ],
    },
  }).then((entities) => entities[0]);

  if (!membershipLink) {
    throw new ApolloError(
      "User is not a member of this organization",
      "BAD_REQUEST",
    );
  }

  await Promise.all([
    removeActorGroupMember(context, authentication, {
      actorId: user.accountId,
      actorGroupId: orgWebId,
    }),
    membershipLink.archive(
      context.graphApi,
      authentication,
      context.provenance,
    ),
  ]);

  return true;
};
