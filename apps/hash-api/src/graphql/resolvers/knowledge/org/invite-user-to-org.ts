import {
  type EntityId,
  entityIdFromComponents,
  type EntityUuid,
  type WebId,
} from "@blockprotocol/type-system";
import type { EntityRelationAndSubjectBranded } from "@local/hash-graph-sdk/authorization";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
import { getActorGroupRole } from "@local/hash-graph-sdk/principal/actor-group";
import { frontendUrl } from "@local/hash-isomorphic-utils/environment";
import { generateUuid } from "@local/hash-isomorphic-utils/generate-uuid";
import {
  currentTimeInstantTemporalAxes,
  generateVersionedUrlMatchingFilter,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import type { MutationInviteUserToOrgArgs } from "@local/hash-isomorphic-utils/graphql/api-types.gen";
import {
  blockProtocolDataTypes,
  systemDataTypes,
  systemEntityTypes,
  systemLinkEntityTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import type {
  HasIssuedInvitation,
  InvitationViaEmail,
  InvitationViaShortname,
} from "@local/hash-isomorphic-utils/system-types/shared";
import type { CreateEntityPolicyParams } from "@rust/hash-graph-store/types";
import { ApolloError } from "apollo-server-errors";
import dedent from "dedent";

import type { EmailTransporter } from "../../../../email/transporters";
import {
  createEntity,
  getEntitySubgraphResponse,
} from "../../../../graph/knowledge/primitive/entity";
import { createLinkEntity } from "../../../../graph/knowledge/primitive/link-entity";
import {
  getOrgById,
  type Org,
} from "../../../../graph/knowledge/system-types/org";
import {
  getUserByEmail,
  getUserByShortname,
  isUserMemberOfOrg,
  type User,
} from "../../../../graph/knowledge/system-types/user";
import { systemAccountId } from "../../../../graph/system-account";
import type { ResolverFn } from "../../../api-types.gen";
import type { LoggedInGraphQLContext } from "../../../context";
import { graphQLContextToImpureGraphContext } from "../../util";
import { getPendingOrgInvitationsFromSubgraph } from "./shared";

const invitationDurationInDays = 30;

const sendOrgEmailInvitationToEmailAddress = async (params: {
  org: Org;
  invitationId: EntityId;
  emailAddress: string;
  emailTransporter: EmailTransporter;
  isSignedUpUser: boolean;
}): Promise<void> => {
  const { org, invitationId, emailAddress, emailTransporter, isSignedUpUser } =
    params;

  let html: string;

  if (isSignedUpUser) {
    html = dedent`
      <p>You've been invited to join the <strong>${org.orgName}</strong> organization in HASH.</p>
      <p>To join the organization or decline the invitation, <a href="${frontendUrl}/invites">click here</a>.</p>
    `;
  } else {
    const queryParams = new URLSearchParams({
      invitationId,
      email: emailAddress,
    }).toString();

    html = dedent`
      <p>You've been invited to join the <strong>${org.orgName}</strong> organization in the HASH platform.</p>
      <p>To set up your HASH account and join the organization <a href="${frontendUrl}/signup?${queryParams}">click here</a>.</p>
    `;
  }

  await emailTransporter.sendMail({
    to: emailAddress,
    subject: "You've been invited to join an organization at HASH",
    html,
  });
};

const generateExistingInvitationFilter = (
  orgWebId: WebId,
  invitation:
    | {
        type: "email";
        email: string;
      }
    | {
        type: "shortname";
        shortname: string;
      },
) => {
  const filter = {
    all: [
      generateVersionedUrlMatchingFilter(
        invitation.type === "email"
          ? systemEntityTypes.invitationViaEmail.entityTypeId
          : systemEntityTypes.invitationViaShortname.entityTypeId,
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
            path: [
              "properties",
              invitation.type === "email"
                ? systemPropertyTypes.email.propertyTypeBaseUrl
                : systemPropertyTypes.shortname.propertyTypeBaseUrl,
            ],
          },
          {
            parameter:
              invitation.type === "email"
                ? invitation.email
                : invitation.shortname,
          },
        ],
      },
    ],
  };

  return filter;
};

export const inviteUserToOrgResolver: ResolverFn<
  Promise<boolean>,
  Record<string, never>,
  LoggedInGraphQLContext,
  MutationInviteUserToOrgArgs
> = async (_, { userEmail, userShortname, orgWebId }, graphQLContext) => {
  const { authentication } = graphQLContext;

  const context = graphQLContextToImpureGraphContext(graphQLContext);

  let existingUserToInvite: User | null = null;

  if (userEmail) {
    existingUserToInvite = await getUserByEmail(context, authentication, {
      email: userEmail,
    });
  } else if (userShortname) {
    existingUserToInvite = await getUserByShortname(context, authentication, {
      shortname: userShortname,
      includeEmails: true,
    });

    if (!existingUserToInvite) {
      throw new ApolloError(
        `User with username ${userShortname} not found`,
        "NOT_FOUND",
      );
    }
  }

  if (!existingUserToInvite && !userEmail) {
    throw new ApolloError(
      "Somehow no user found and no email address provided.",
      "BAD_REQUEST",
    );
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

  const isAlreadyAMember = !existingUserToInvite
    ? null
    : await isUserMemberOfOrg(context, authentication, {
        userEntityId: existingUserToInvite.entity.metadata.recordId.entityId,
        orgEntityUuid: org.webId,
      });

  if (isAlreadyAMember) {
    throw new ApolloError(
      "User is already a member of this organization",
      "BAD_REQUEST",
    );
  }

  const isOrgAdmin = await getActorGroupRole(context.graphApi, authentication, {
    actorId: authentication.actorId,
    actorGroupId: org.webId,
  }).then((role) => role === "administrator");

  if (!isOrgAdmin) {
    throw new ApolloError(
      "You must be an administrator to invite users to this organization",
      "UNAUTHORIZED",
    );
  }

  const existingInvitations = await getEntitySubgraphResponse(
    context,
    authentication,
    {
      includeDrafts: false,
      temporalAxes: currentTimeInstantTemporalAxes,
      filter: generateExistingInvitationFilter(
        orgWebId,
        userEmail
          ? {
              type: "email",
              email: userEmail,
            }
          : {
              type: "shortname",
              shortname: userShortname!,
            },
      ),
      graphResolveDepths: {
        ...zeroedGraphResolveDepths,
        hasLeftEntity: {
          incoming: 0,
          outgoing: 1,
        },
        hasRightEntity: {
          incoming: 1,
          outgoing: 0,
        },
      },
    },
  ).then(({ subgraph }) =>
    getPendingOrgInvitationsFromSubgraph(context, authentication, subgraph),
  );

  let outstandingInvitationCount = existingInvitations.length;

  for (const {
    expiresAt,
    invitationEntity,
    linkEntity,
  } of existingInvitations) {
    if (new Date(expiresAt).valueOf() < new Date().valueOf() - 1000 * 60 * 60) {
      await Promise.all([
        invitationEntity.archive(
          context.graphApi,
          authentication,
          context.provenance,
        ),
        linkEntity.archive(
          context.graphApi,
          authentication,
          context.provenance,
        ),
      ]);

      outstandingInvitationCount--;
    }
  }

  if (outstandingInvitationCount > 0) {
    throw new ApolloError(
      `There is already an invitation pending for ${userEmail ?? userShortname}`,
      "BAD_REQUEST",
    );
  }

  const invitationAuthorizationRelationships: EntityRelationAndSubjectBranded[] =
    [
      {
        relation: "administrator",
        subject: {
          kind: "account",
          /**
           * We use the system account to manage invitations (viewing and archiving) on the invited user's behalf.
           * We cannot add the invited user directly, because:
           *
           * 1. They may not have an account yet (if invited via email with no account attached)
           * 2. If they DO have an account and are invited by email, giving them permission on the entity would reveal
           *    to the inviter which user account was associated with the email address (via inspection of the entity's permissions).
           *
           * Note that the inviter will know the user associated with an email if they accept the invitation.
           */
          subjectId: systemAccountId,
        },
      },
      {
        relation: "setting",
        subject: {
          kind: "setting",
          subjectId: "administratorFromWeb",
        },
      },
      /** We don't need any other permissions on the entity – normal web members don't need to view or manage pending invitations */
    ];

  let invitation: HashEntity<InvitationViaEmail | InvitationViaShortname>;

  const expiresAtIsoString = new Date(
    Date.now() + invitationDurationInDays * 24 * 60 * 60 * 1000,
  ).toISOString();

  const expiredAtProperty = {
    value: expiresAtIsoString,
    metadata: {
      dataTypeId: systemDataTypes.datetime.dataTypeId,
    },
  };

  const invitationEntityUuid = generateUuid() as EntityUuid;
  const systemAccountViewInvitationPolicy: CreateEntityPolicyParams = {
    name: `system-account-administer-org-invitation-${invitationEntityUuid}`,
    effect: "permit",
    actions: ["viewEntity"],
    principal: {
      type: "actor",
      actorType: "machine",
      id: systemAccountId,
    },
  };

  if (userEmail) {
    invitation = await createEntity<InvitationViaEmail>(
      context,
      authentication,
      {
        entityTypeIds: [systemEntityTypes.invitationViaEmail.entityTypeId],
        entityUuid: invitationEntityUuid,
        properties: {
          value: {
            "https://hash.ai/@h/types/property-type/expired-at/":
              expiredAtProperty,
            "https://hash.ai/@h/types/property-type/email/": {
              value: userEmail,
              metadata: {
                dataTypeId: systemDataTypes.email.dataTypeId,
              },
            },
          },
        },
        policies: [systemAccountViewInvitationPolicy],
        relationships: invitationAuthorizationRelationships,
        webId: orgWebId,
      },
    );
  } else {
    invitation = await createEntity<InvitationViaShortname>(
      context,
      authentication,
      {
        entityTypeIds: [systemEntityTypes.invitationViaShortname.entityTypeId],
        entityUuid: invitationEntityUuid,
        properties: {
          value: {
            "https://hash.ai/@h/types/property-type/expired-at/":
              expiredAtProperty,
            "https://hash.ai/@h/types/property-type/shortname/": {
              value: userShortname!,
              metadata: {
                dataTypeId: blockProtocolDataTypes.text.dataTypeId,
              },
            },
          },
        },
        policies: [systemAccountViewInvitationPolicy],
        relationships: invitationAuthorizationRelationships,
        webId: orgWebId,
      },
    );
  }

  const linkEntityUuid = generateUuid() as EntityUuid;
  await createLinkEntity<HasIssuedInvitation>(context, authentication, {
    entityTypeIds: [systemLinkEntityTypes.hasIssuedInvitation.linkEntityTypeId],
    linkData: {
      leftEntityId: org.entity.metadata.recordId.entityId,
      rightEntityId: invitation.metadata.recordId.entityId,
    },
    policies: [
      {
        name: `system-account-administer-org-invitation-link-${linkEntityUuid}`,
        effect: "permit",
        actions: ["viewEntity"],
        principal: {
          type: "actor",
          actorType: "machine",
          id: systemAccountId,
        },
      },
    ],
    properties: { value: {} },
    relationships: invitationAuthorizationRelationships,
    webId: orgWebId,
  });

  await sendOrgEmailInvitationToEmailAddress({
    org,
    invitationId: invitation.metadata.recordId.entityId,
    emailAddress: existingUserToInvite
      ? existingUserToInvite.emails[0]!
      : userEmail!,
    emailTransporter: graphQLContext.emailTransporter,
    isSignedUpUser: !!existingUserToInvite,
  });

  return true;
};
