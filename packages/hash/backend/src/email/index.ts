import { SendMailOptions } from "nodemailer";
import { convert } from "html-to-text";

import { LoginCode } from "../db/adapter";
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
  loginCode: LoginCode,
  user: { properties: { email: string } }
): Promise<void> => {
  const loginLink = `http://${FRONTEND_DOMAIN}/login?loginId=${encodeURIComponent(
    loginCode.id
  )}&loginCode=${encodeURIComponent(loginCode.code)}`;

  await sendMail({
    to: user.properties.email,
    subject: "Your Temporary HASH.dev Login Code",
    html: `
        <p>To log in, copy and paste your login code or <a href=${loginLink}>click here</a>.</p>
        <code>${loginCode.code}</code>
      `,
  });
};
