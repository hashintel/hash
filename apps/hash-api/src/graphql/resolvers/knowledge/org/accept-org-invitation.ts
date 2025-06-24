import { type ActorGroupEntityUuid } from "@blockprotocol/type-system";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
import { createOrgMembershipAuthorizationRelationships } from "@local/hash-isomorphic-utils/graph-queries";
import type { MutationAcceptOrgInvitationArgs } from "@local/hash-isomorphic-utils/graphql/api-types.gen";
import { systemLinkEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import {
  isInvitationByEmail,
  isInvitationByShortname,
} from "@local/hash-isomorphic-utils/organization";
import type { IsMemberOf } from "@local/hash-isomorphic-utils/system-types/shared";
import { ApolloError } from "apollo-server-errors";

import { addActorGroupMember } from "../../../../graph/account-permission-management";
import {
  getEntityIncomingLinks,
  getLatestEntityById,
} from "../../../../graph/knowledge/primitive/entity";
import { createLinkEntity } from "../../../../graph/knowledge/primitive/link-entity";
import {
  getOrgById,
  type Org,
} from "../../../../graph/knowledge/system-types/org";
import { systemAccountId } from "../../../../graph/system-account";
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
  const { user } = graphQLContext;

  const context = graphQLContextToImpureGraphContext(graphQLContext);

  let invitation: HashEntity;

  /**
   * We use the system account to access the invitations, because the user does not have permissions over it.
   * so that org admins cannot issue invitations to emails and discover who the user is without them accepting the invite
   * – which they could do by inspecting the entity's permissions, if gave the invited user permissions over it.
   */
  const systemAccountAuthentication = {
    actorId: systemAccountId,
  };

  try {
    invitation = await getLatestEntityById(
      context,
      systemAccountAuthentication,
      {
        entityId: orgInvitationEntityId,
      },
    );
  } catch {
    throw new ApolloError("Invitation not found", "NOT_FOUND");
  }

  let isForUser: boolean;

  if (isInvitationByEmail(invitation)) {
    isForUser = user.emails.includes(
      invitation.properties["https://hash.ai/@h/types/property-type/email/"],
    );
  } else if (isInvitationByShortname(invitation)) {
    isForUser =
      invitation.properties[
        "https://hash.ai/@h/types/property-type/shortname/"
      ] === user.shortname;
  } else {
    throw new ApolloError(
      `Invalid invitation type ${invitation.metadata.entityTypeIds.join(", ")}`,
      "INVALID_INVITATION_TYPE",
    );
  }

  if (!isForUser) {
    return {
      expired: false,
      notForUser: true,
      accepted: false,
    };
  }

  const invitationLink = (
    await getEntityIncomingLinks(context, systemAccountAuthentication, {
      entityId: invitation.entityId,
    })
  ).find((link) =>
    link.metadata.entityTypeIds.includes(
      systemLinkEntityTypes.hasIssuedInvitation.linkEntityTypeId,
    ),
  );

  if (!invitationLink) {
    throw new ApolloError("Invitation link not found", "NOT_FOUND");
  }

  const archiveInvitation = () =>
    Promise.all([
      invitation.archive(
        context.graphApi,
        systemAccountAuthentication,
        context.provenance,
      ),
      invitationLink.archive(
        context.graphApi,
        systemAccountAuthentication,
        context.provenance,
      ),
    ]);

  let org: Org | null;
  try {
    org = await getOrgById(context, systemAccountAuthentication, {
      entityId: invitationLink.linkData.leftEntityId,
    });
  } catch {
    throw new ApolloError(
      `Organization not found with entityId ${invitationLink.linkData.leftEntityId} (the left side of the invitation link)`,
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
    await archiveInvitation();

    return {
      expired: true,
      notForUser: false,
      accepted: false,
    };
  }

  const orgWebId = org.webId;

  const linkCreator = invitation.metadata.provenance.createdById;

  /**
   * Although the creator must have been an administrator of the organization to issue the invitation,
   * they may have been removed as an admin since, in which case the link is no longer valid.
   */
  const creatorIsOrgAdmin = await context.graphApi
    .hasActorGroupRole(linkCreator, orgWebId, "administrator", linkCreator)
    .then(({ data }) => data);

  if (!creatorIsOrgAdmin) {
    await archiveInvitation();

    throw new ApolloError(
      "Invitation issuer is not an administrator of the organization",
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

  await archiveInvitation();

  return {
    expired: false,
    notForUser: false,
    accepted: true,
  };
};
