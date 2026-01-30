import {
  type EntityId,
  entityIdFromComponents,
  type WebId,
} from "@blockprotocol/type-system";
import {
  type HashEntity,
  queryEntitySubgraph,
} from "@local/hash-graph-sdk/entity";
import { getActorGroupRole } from "@local/hash-graph-sdk/principal/actor-group";
import { frontendUrl } from "@local/hash-isomorphic-utils/environment";
import {
  currentTimeInstantTemporalAxes,
  generateVersionedUrlMatchingFilter,
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
import dedent from "dedent";

import type { EmailTransporter } from "../../../../email/transporters";
import { createEntity } from "../../../../graph/knowledge/primitive/entity";
import { createLinkEntity } from "../../../../graph/knowledge/primitive/link-entity";
import {
  getOrgById,
  type Org,
} from "../../../../graph/knowledge/system-types/org";
import {
  getUser,
  isUserMemberOfOrg,
  type User,
} from "../../../../graph/knowledge/system-types/user";
import type { ResolverFn } from "../../../api-types.gen";
import type { LoggedInGraphQLContext } from "../../../context";
import * as Error from "../../../error";
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
    existingUserToInvite = await getUser(context, authentication, {
      emails: [userEmail],
    });
  } else if (userShortname) {
    existingUserToInvite = await getUser(context, authentication, {
      shortname: userShortname,
    });

    if (!existingUserToInvite) {
      throw Error.notFound(`User with username ${userShortname} not found`);
    }
  }

  if (!existingUserToInvite && !userEmail) {
    throw Error.badRequest(
      "Somehow no user found and no email address provided.",
    );
  }

  const orgEntityId = entityIdFromComponents(orgWebId, orgWebId);

  let org: Org | null = null;
  try {
    org = await getOrgById(context, authentication, {
      entityId: orgEntityId,
    });
  } catch {
    throw Error.notFound(`Organization with webId ${orgWebId} not found`);
  }

  const isAlreadyAMember = !existingUserToInvite
    ? null
    : await isUserMemberOfOrg(context, authentication, {
        userEntityId: existingUserToInvite.entity.metadata.recordId.entityId,
        orgEntityUuid: org.webId,
      });

  if (isAlreadyAMember) {
    throw Error.badRequest("User is already a member of this organization");
  }

  const isOrgAdmin = await getActorGroupRole(context.graphApi, authentication, {
    actorId: authentication.actorId,
    actorGroupId: org.webId,
  }).then((role) => role === "administrator");

  if (!isOrgAdmin) {
    throw Error.forbidden(
      "You must be an administrator to invite users to this organization",
    );
  }

  const existingInvitations = await queryEntitySubgraph(
    context,
    authentication,
    {
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
      traversalPaths: [
        {
          edges: [
            {
              kind: "has-right-entity",
              direction: "incoming",
            },
            {
              kind: "has-left-entity",
              direction: "outgoing",
            },
          ],
        },
      ],
      includeDrafts: false,
      includePermissions: false,
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
    throw Error.badRequest(
      `There is already an invitation pending for ${userEmail ?? userShortname}`,
    );
  }

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

  if (userEmail) {
    invitation = await createEntity<InvitationViaEmail>(
      context,
      authentication,
      {
        entityTypeIds: [systemEntityTypes.invitationViaEmail.entityTypeId],
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
        webId: orgWebId,
      },
    );
  } else {
    invitation = await createEntity<InvitationViaShortname>(
      context,
      authentication,
      {
        entityTypeIds: [systemEntityTypes.invitationViaShortname.entityTypeId],
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
        webId: orgWebId,
      },
    );
  }

  await createLinkEntity<HasIssuedInvitation>(context, authentication, {
    entityTypeIds: [systemLinkEntityTypes.hasIssuedInvitation.linkEntityTypeId],
    linkData: {
      leftEntityId: org.entity.metadata.recordId.entityId,
      rightEntityId: invitation.metadata.recordId.entityId,
    },
    properties: { value: {} },
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
