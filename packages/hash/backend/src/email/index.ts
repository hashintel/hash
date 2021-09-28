import { URLSearchParams } from "url";
import { Org, OrgEmailInvitation, VerificationCode } from "../model";
import EmailTransporter from "./transporter";
const { FRONTEND_URL } = require("../lib/config");

export const sendLoginCodeToEmailAddress =
  (transporter: EmailTransporter) =>
  async (params: {
    verificationCode: VerificationCode;
    emailAddress: string;
    redirectPath?: string;
  }): Promise<void> => {
    const { verificationCode, emailAddress, redirectPath } = params;

    const queryParams = new URLSearchParams({
      verificationId: verificationCode.id,
      verificationCode: verificationCode.code,
      ...(redirectPath ? { redirectPath } : {}),
    }).toString();

    const magicLink = `${FRONTEND_URL}/login?${queryParams}`;

    await transporter.sendMail({
      to: emailAddress,
      subject: "Your HASH verification code",
      html: `
        <p>To log in, copy and paste your verification code or <a href="${magicLink}">click here</a>.</p>
        <code>${verificationCode.code}</code>
      `,
    });
  };

export const sendEmailVerificationCodeToEmailAddress =
  (transporter: EmailTransporter) =>
  async (params: {
    verificationCode: VerificationCode;
    emailAddress: string;
    magicLinkQueryParams?: string;
  }): Promise<void> => {
    const { verificationCode, emailAddress, magicLinkQueryParams } = params;

    const queryParams = new URLSearchParams({
      verificationId: verificationCode.id,
      verificationCode: verificationCode.code,
    }).toString();

    const magicLink = `${FRONTEND_URL}/signup?${queryParams}${
      magicLinkQueryParams || ""
    }`;

    await transporter.sendMail({
      to: emailAddress,
      subject: "Please verify your HASH email address",
      html: `
        <p>To verify your email address, copy and paste your verification code or <a href="${magicLink}">click here</a>.</p>
        <code>${verificationCode.code}</code>
      `,
    });
  };

export const sendOrgEmailInvitationToEmailAddress =
  (transporter: EmailTransporter) =>
  async (params: {
    org: Org;
    isExistingUser?: boolean;
    emailInvitation: OrgEmailInvitation;
    emailAddress: string;
  }): Promise<void> => {
    const { org, emailInvitation, emailAddress, isExistingUser } = params;

    const queryParams = new URLSearchParams({
      orgAccountId: org.accountId,
      orgEntityId: org.entityId,
      accessToken: emailInvitation.properties.accessToken,
      ...(isExistingUser ? { isExistingUser: "true" } : {}),
    }).toString();

    const invitationLink = `${FRONTEND_URL}/invite?${queryParams}`;

    await transporter.sendMail({
      to: emailAddress,
      subject: "You've been invited to join an organization at HASH",
      html: `
        <p>You've been invited to join the <strong>${org.properties.name}</strong> organization</p>
        <p>To join the organization <a href="${invitationLink}">click here</a>.</p>
      `,
    });
  };
