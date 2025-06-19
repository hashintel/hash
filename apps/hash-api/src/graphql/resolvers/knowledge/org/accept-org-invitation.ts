import type { Subgraph } from "@blockprotocol/graph";
import type {
  ActorEntityUuid,
  Entity,
  extractWebIdFromEntityId,
} from "@blockprotocol/type-system";
import { createOrgMembershipAuthorizationRelationships } from "@local/hash-isomorphic-utils/graph-queries";
import type { MutationAcceptOrgInvitationArgs } from "@local/hash-isomorphic-utils/graphql/api-types.gen";
import { systemLinkEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { ApolloError } from "apollo-server-errors";

import { addActorGroupMember } from "../../../../graph/account-permission-management";
import {
  createEntity,
  getLatestEntityById,
} from "../../../../graph/knowledge/primitive/entity";
import { getUserByEmail } from "../../../../graph/knowledge/system-types/user";
import type { ResolverFn } from "../../../api-types.gen";
import type { LoggedInGraphQLContext } from "../../../context";
import { graphQLContextToImpureGraphContext } from "../../util";

export const acceptOrgInvitationResolver: ResolverFn<
  Promise<Subgraph>,
  Record<string, never>,
  LoggedInGraphQLContext,
  MutationAcceptOrgInvitationArgs
> = async (_, { orgInvitationEntityId }, graphQLContext) => {
  const { authentication, user } = graphQLContext;

  const context = graphQLContextToImpureGraphContext(graphQLContext);

  let invitation: Entity;

  try {
    invitation = await getLatestEntityById(context, authentication, {
      entityId: orgInvitationEntityId,
    });
  } catch {
    throw new ApolloError("Invitation not found", "NOT_FOUND");
  }

  if (!user.emails.includes(invitation.properties.email)) {
    throw new ApolloError("Invitation is not for requesting user");
  }

  if (new Date(invitation.properties.expiresAt) < new Date()) {
    throw new ApolloError("Invitation has expired");
  }

  if (!userToInvite) {
    /**
     * @TODO user not signed up flow:
     * Need to somehow have a placeholder user which captures the email,
     * but before the user has entered a password and therefore has a Kratos identity.
     */
  }

  const orgAccountGroupId = extractWebIdFromEntityId(

  await addActorGroupMember(context.dataSources, context.authentication, {
    actorId: accountId,
    actorGroupId: accountGroupId,
  });

  await Promise.all([
    createEntity(context, authentication, {
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
  ]);
};
