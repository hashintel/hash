import {
  type ActorGroupEntityUuid,
  extractWebIdFromEntityId,
} from "@blockprotocol/type-system";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
import { createOrgMembershipAuthorizationRelationships } from "@local/hash-isomorphic-utils/graph-queries";
import type { MutationAcceptOrgInvitationArgs } from "@local/hash-isomorphic-utils/graphql/api-types.gen";
import { systemLinkEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import type {
  IsInvitedTo,
  IsMemberOf,
} from "@local/hash-isomorphic-utils/system-types/shared";
import { ApolloError } from "apollo-server-errors";

import { addActorGroupMember } from "../../../../graph/account-permission-management";
import { getLatestEntityById } from "../../../../graph/knowledge/primitive/entity";
import { createLinkEntity } from "../../../../graph/knowledge/primitive/link-entity";
import {
  getOrgById,
  type Org,
} from "../../../../graph/knowledge/system-types/org";
import type {
  AcceptInvitationResult,
  ResolverFn,
} from "../../../api-types.gen";
import type { LoggedInGraphQLContext } from "../../../context";
import { graphQLContextToImpureGraphContext } from "../../util";

export const acceptOrgInvitationResolver: ResolverFn<
  Promise<AcceptInvitationResult>,
  Record<string, never>,
  LoggedInGraphQLContext,
  MutationAcceptOrgInvitationArgs
> = async (_, { orgInvitationEntityId }, graphQLContext) => {
  const { authentication, user } = graphQLContext;

  const context = graphQLContextToImpureGraphContext(graphQLContext);

  let invitation: HashEntity<IsInvitedTo>;

  try {
    invitation = (await getLatestEntityById(context, authentication, {
      entityId: orgInvitationEntityId,
    })) as HashEntity<IsInvitedTo>;
  } catch {
    throw new ApolloError("Invitation not found", "NOT_FOUND");
  }

  if (
    invitation.linkData?.leftEntityId !== user.entity.metadata.recordId.entityId
  ) {
    return {
      expired: false,
      notForUser: true,
      accepted: false,
    };
  }

  let org: Org | null;
  try {
    org = await getOrgById(context, authentication, {
      entityId: invitation.linkData.rightEntityId,
    });
  } catch {
    throw new ApolloError(
      `Organization not found with entityId ${invitation.linkData.rightEntityId} (the right side of the invitation link)`,
      "NOT_FOUND",
    );
  }

  if (
    new Date(
      invitation.properties[
        "https://hash.ai/@h/types/property-type/expired-at/"
      ],
    ) < new Date()
  ) {
    return {
      expired: true,
      notForUser: false,
      accepted: false,
    };
  }

  const orgWebId = extractWebIdFromEntityId(invitation.linkData.rightEntityId);

  const linkCreator = invitation.metadata.provenance.createdById;

  const creatorIsOrgAdmin = await context.graphApi
    .hasActorGroupRole(linkCreator, orgWebId, "administrator", linkCreator)
    .then(({ data }) => data);

  if (!creatorIsOrgAdmin) {
    throw new ApolloError(
      "Invitation sender is not an administrator of the organization",
      "UNAUTHORIZED",
    );
  }

  const membershipCreationAuthentication = {
    /**
     * We use the authority of the person who issued the invitation to create the membership link,
     * which makes sure we record who was responsible for the membership link.
     */
    actorId: linkCreator,
  };

  const linkEntity = await createLinkEntity<IsMemberOf>(
    context,
    membershipCreationAuthentication,
    {
      entityTypeIds: [systemLinkEntityTypes.isMemberOf.linkEntityTypeId],
      properties: { value: {} },
      linkData: {
        leftEntityId: user.entity.metadata.recordId.entityId,
        rightEntityId: org.entity.metadata.recordId.entityId,
      },
      relationships: createOrgMembershipAuthorizationRelationships({
        memberAccountId: user.accountId,
      }),
      webId: orgWebId,
    },
  );

  try {
    await addActorGroupMember(context, membershipCreationAuthentication, {
      actorId: user.accountId,
      actorGroupId: orgWebId as ActorGroupEntityUuid,
    });
  } catch (error) {
    await linkEntity.archive(
      context.graphApi,
      membershipCreationAuthentication,
      context.provenance,
    );

    throw new ApolloError(
      `Failed to add actor group member: ${(error as Error).message}`,
    );
  }

  await invitation.archive(
    context.graphApi,
    authentication,
    context.provenance,
  );

  return {
    expired: false,
    notForUser: false,
    accepted: true,
  };
};
