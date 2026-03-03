import { extractWebIdFromEntityId } from "@blockprotocol/type-system";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
import { getActorGroupRole } from "@local/hash-graph-sdk/principal/actor-group";
import type { MutationAcceptOrgInvitationArgs } from "@local/hash-isomorphic-utils/graphql/api-types.gen";
import { systemLinkEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import {
  isInvitationByEmail,
  isInvitationByShortname,
} from "@local/hash-isomorphic-utils/organization";

import {
  getEntityIncomingLinks,
  getLatestEntityById,
} from "../../../../graph/knowledge/primitive/entity";
import {
  getOrgById,
  type Org,
} from "../../../../graph/knowledge/system-types/org";
import {
  isUserMemberOfOrg,
  joinOrg,
} from "../../../../graph/knowledge/system-types/user";
import { systemAccountId } from "../../../../graph/system-account";
import type {
  AcceptInvitationResult,
  ResolverFn,
} from "../../../api-types.gen";
import type { LoggedInGraphQLContext } from "../../../context";
import * as Error from "../../../error";
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
    throw Error.notFound("Invitation not found");
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
    throw Error.invalidInvitationType(
      `Invalid invitation type ${invitation.metadata.entityTypeIds.join(", ")}`,
    );
  }

  if (!isForUser) {
    return {
      accepted: false,
      alreadyAMember: false,
      expired: false,
      notForUser: true,
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
    throw Error.notFound("Invitation link not found");
  }

  const isAlreadyAMember = await isUserMemberOfOrg(
    context,
    graphQLContext.authentication,
    {
      userEntityId: user.entity.metadata.recordId.entityId,
      orgEntityUuid: extractWebIdFromEntityId(invitation.entityId),
    },
  );

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

  if (isAlreadyAMember) {
    await archiveInvitation();

    return {
      accepted: false,
      alreadyAMember: true,
      expired: false,
      notForUser: false,
    };
  }

  let org: Org | null;
  try {
    org = await getOrgById(context, systemAccountAuthentication, {
      entityId: invitationLink.linkData.leftEntityId,
    });
  } catch {
    throw Error.notFound(
      `Organization not found with entityId ${invitationLink.linkData.leftEntityId} (the left side of the invitation link)`,
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
      accepted: false,
      alreadyAMember: false,
      expired: true,
      notForUser: false,
    };
  }

  const orgWebId = org.webId;

  const linkCreator = invitation.metadata.provenance.createdById;

  /**
   * Although the creator must have been an administrator of the organization to issue the invitation,
   * they may have been removed as an admin since, in which case the link is no longer valid.
   */
  const creatorIsOrgAdmin = await getActorGroupRole(
    context.graphApi,
    systemAccountAuthentication,
    {
      actorId: linkCreator,
      actorGroupId: orgWebId,
    },
  ).then((role) => role === "administrator");

  if (!creatorIsOrgAdmin) {
    await archiveInvitation();

    throw Error.forbidden(
      "Invitation issuer is not an administrator of the organization",
    );
  }

  const membershipCreationAuthentication = {
    /**
     * We use the authority of the person who issued the invitation to create the membership link,
     * which makes sure we record who was responsible for the membership link.
     */
    actorId: linkCreator,
  };

  await joinOrg(context, membershipCreationAuthentication, {
    userEntityId: user.entity.metadata.recordId.entityId,
    orgEntityId: org.entity.metadata.recordId.entityId,
  });

  await archiveInvitation();

  return {
    accepted: true,
    alreadyAMember: false,
    expired: false,
    notForUser: false,
  };
};
