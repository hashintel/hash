/**
 * @todo Fix relevant portions of this file and remove the rest
 * @see https://linear.app/hash/issue/H-591
 */
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck

import { URLSearchParams } from "node:url";

import { frontendUrl } from "@local/hash-isomorphic-utils/environment";
import dedent from "dedent";

import type { EmailTransporter } from "./transporters";

export const sendOrgEmailInvitationToEmailAddress =
  (emailTransporter: EmailTransporter) =>
  async (params: {
    org: Org;
    isExistingUser?: boolean;
    emailInvitation: OrgEmailInvitation;
    emailAddress: string;
  }): Promise<void> => {
    const { org, emailInvitation, emailAddress, isExistingUser } = params;

    const queryParams = new URLSearchParams({
      orgEntityId: org.entityId,
      invitationEmailToken: emailInvitation.properties.accessToken,
      email: emailAddress,
      ...(isExistingUser ? { isExistingUser: "true" } : {}),
    }).toString();

    const invitationLink = `${frontendUrl}/invite?${queryParams}`;

    await emailTransporter.sendMail({
      to: emailAddress,
      subject: "You've been invited to join an organization at HASH",
      html: dedent`
        <p>You've been invited to join the <strong>${org.properties.name}</strong> organization</p>
        <p>To join the organization <a href="${invitationLink}">click here</a>.</p>
      `,
    });
  };
