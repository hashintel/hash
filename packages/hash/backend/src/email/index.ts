import { SendMailOptions } from "nodemailer";
import { convert } from "html-to-text";
import { VerificationCode } from "src/db/adapter";
import { DbUser } from "src/types/dbTypes";
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

export const sendLoginCodeToUser = async (
  verificationCode: VerificationCode,
  user: DbUser
): Promise<void> => {
  const magicLink = `http://${FRONTEND_DOMAIN}/login?verificationId=${encodeURIComponent(
    verificationCode.id
  )}&verificationCode=${encodeURIComponent(verificationCode.code)}`;

  await sendMail({
    to: user.properties.email,
    subject: "Your Temporary HASH.dev Login Code",
    html: `
        <p>To log in, copy and paste your login code or <a href=${magicLink}>click here</a>.</p>
        <code>${verificationCode.code}</code>
      `,
  });
};
