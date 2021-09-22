import { Org, OrgEmailInvitation, VerificationCode } from "../model";
import { getRequiredEnv } from "../util";
import EmailTransporter from "./transporter";

const FRONTEND_DOMAIN = getRequiredEnv("FRONTEND_DOMAIN");

export const sendLoginCodeToEmailAddress =
  (transporter: EmailTransporter) =>
  async (verificationCode: VerificationCode, email: string): Promise<void> => {
    const magicLink = `http://${FRONTEND_DOMAIN}/login?verificationId=${encodeURIComponent(
      verificationCode.id
    )}&verificationCode=${encodeURIComponent(verificationCode.code)}`;

    await transporter.sendMail({
      to: email,
      subject: "Your HASH verification code",
      html: `
        <p>To log in, copy and paste your verification code or <a href="${magicLink}">click here</a>.</p>
        <code>${verificationCode.code}</code>
      `,
    });
  };

export const sendEmailVerificationCodeToEmailAddress =
  (transporter: EmailTransporter) =>
  async (verificationCode: VerificationCode, email: string): Promise<void> => {
    const magicLink = `http://${FRONTEND_DOMAIN}/signup?verificationId=${encodeURIComponent(
      verificationCode.id
    )}&verificationCode=${encodeURIComponent(verificationCode.code)}`;

    await transporter.sendMail({
      to: email,
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
    emailInvitation: OrgEmailInvitation;
    emailAddress: string;
  }): Promise<void> => {
    const { org, emailInvitation, emailAddress } = params;

    const invitationLink = [
      `http://${FRONTEND_DOMAIN}/signup?`,
      `orgAccountId=${encodeURIComponent(org.accountId)}&`,
      `orgEntityId=${encodeURIComponent(org.entityId)}&`,
      `accessToken=${encodeURIComponent(
        emailInvitation.properties.accessToken
      )}`,
    ].join("");

    await transporter.sendMail({
      to: emailAddress,
      subject: "You've been invited to join an organization at HASH",
      html: `
        <p>You've been invited to join the <strong>${org.properties.name}</strong> organization</p>
        <p>To join the organization <a href="${invitationLink}">click here</a>.</p>
      `,
    });
  };
