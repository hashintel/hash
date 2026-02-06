import { entityIdFromComponents } from "@blockprotocol/type-system";
import { queryEntities } from "@local/hash-graph-sdk/entity";
import { removeActorGroupMember } from "@local/hash-graph-sdk/principal/actor-group";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";
import type { MutationRemoveUserFromOrgArgs } from "@local/hash-isomorphic-utils/graphql/api-types.gen";
import { systemLinkEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import { getOrgById } from "../../../../graph/knowledge/system-types/org";
import { getUser } from "../../../../graph/knowledge/system-types/user";
import type { ResolverFn } from "../../../api-types.gen";
import type { LoggedInGraphQLContext } from "../../../context";
import * as Error from "../../../error";
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
    throw Error.notFound(`Organization with webId ${orgWebId} not found`);
  }

  const foundUser = await getUser(context, authentication, {
    entityId: userEntityId,
  });
  if (!foundUser) {
    throw Error.notFound(`User with entityId ${userEntityId} not found`);
  }

  const membershipLink = await queryEntities(context, authentication, {
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
    includeDrafts: false,
    includePermissions: false,
  }).then(({ entities }) => entities[0]);

  if (!membershipLink) {
    throw Error.badRequest("User is not a member of this organization");
  }

  await Promise.all([
    removeActorGroupMember(context.graphApi, authentication, {
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
