import type { Subgraph } from "@blockprotocol/graph";
import type {
  ActorEntityUuid,
  extractWebIdFromEntityId,
} from "@blockprotocol/type-system";
import { createOrgMembershipAuthorizationRelationships } from "@local/hash-isomorphic-utils/graph-queries";
import type { MutationInviteUserToOrgArgs } from "@local/hash-isomorphic-utils/graphql/api-types.gen";
import { systemLinkEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import { createEntity } from "../../../../graph/knowledge/primitive/entity";
import { getUserByEmail } from "../../../../graph/knowledge/system-types/user";
import type { ResolverFn } from "../../../api-types.gen";
import type { LoggedInGraphQLContext } from "../../../context";
import { graphQLContextToImpureGraphContext } from "../../util";

export const inviteUserToOrgResolver: ResolverFn<
  Promise<Subgraph>,
  Record<string, never>,
  LoggedInGraphQLContext,
  MutationInviteUserToOrgArgs
> = async (_, { userEmail, orgWebId }, graphQLContext) => {
  const { authentication, user } = graphQLContext;

  const context = graphQLContextToImpureGraphContext(graphQLContext);

  const userToInvite = await getUserByEmail(context, authentication, {
    email: userEmail,
  });

  if (!userToInvite) {
    /**
     * @TODO user not signed up flow:
     * Need to somehow have a placeholder user which captures the email,
     * but before the user has entered a password and therefore has a Kratos identity.
     */
  }

  await Promise.all([
    createEntity({
      variables: {
        entityTypeIds: [systemLinkEntityTypes.isMemberOf.linkEntityTypeId],
        properties: { value: {} },
        linkData: {
          leftEntityId: user.metadata.recordId.entityId,
          rightEntityId: org.entity.metadata.recordId.entityId,
        },
        relationships: createOrgMembershipAuthorizationRelationships({
          memberAccountId: extractWebIdFromEntityId(
            user.metadata.recordId.entityId,
          ) as ActorEntityUuid,
        }),
      },
    }),
    addMemberPermission({
      variables: {
        accountGroupId: org.webId,
        accountId: extractWebIdFromEntityId(
          user.metadata.recordId.entityId,
        ) as ActorEntityUuid,
      },
    }),
  ]);
};
