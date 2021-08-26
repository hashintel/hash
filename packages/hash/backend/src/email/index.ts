import { SendMailOptions } from "nodemailer";
import { convert } from "html-to-text";
import VerificationCode from "../model/verificationCode.model";
import awsSesTransporter from "./transporters/awsSes";
import { getRequiredEnv } from "../util";

const FRONTEND_DOMAIN = getRequiredEnv("FRONTEND_DOMAIN");

// TODO: support configurable domains
export const sendMail = ({
  from = "HASH <support@hash.ai>",
  to,
  subject,
  text,
  html,
}: SendMailOptions) =>
  awsSesTransporter
    .sendMail({
      from,
      to,
      subject:
        process.env.NODE_ENV !== "production"
          ? `[DEV SITE] ${subject}`
          : subject,
      text: !text && typeof html === "string" ? convert(html) : text,
      html,
    })
    .catch((err) => console.log("Error sending mail: ", err));

export const sendLoginCodeToEmailAddress = async (
  verificationCode: VerificationCode,
  email: string
): Promise<void> => {
  const magicLink = `http://${FRONTEND_DOMAIN}/login?verificationId=${encodeURIComponent(
    verificationCode.id
  )}&verificationCode=${encodeURIComponent(verificationCode.code)}`;

  await sendMail({
    to: email,
    subject: "Your HASH verification code",
    html: `
        <p>To log in, copy and paste your verification code or <a href="${magicLink}">click here</a>.</p>
        <code>${verificationCode.code}</code>
      `,
  });
};

export const sendEmailVerificationCodeToEmailAddress = async (
  verificationCode: VerificationCode,
  email: string
): Promise<void> => {
  const magicLink = `http://${FRONTEND_DOMAIN}/signup?verificationId=${encodeURIComponent(
    verificationCode.id
  )}&verificationCode=${encodeURIComponent(verificationCode.code)}`;

  await sendMail({
    to: email,
    subject: "Please verify your HASH email address",
    html: `
        <p>To verify your email address, copy and paste your verification code or <a href="${magicLink}">click here</a>.</p>
        <code>${verificationCode.code}</code>
      `,
  });
};
