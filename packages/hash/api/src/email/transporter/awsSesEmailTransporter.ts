import nodemailer, { SendMailOptions } from "nodemailer";
import SESTransport from "nodemailer/lib/ses-transport";
import * as aws from "@aws-sdk/client-ses";
import { convert } from "html-to-text";
import { defaultProvider } from "@aws-sdk/credential-provider-node";

import { isProdEnv } from "../../lib/env-config";
import EmailTransporter from ".";
import { logger } from "../../logger";

class AwsSesEmailTransporter implements EmailTransporter {
  private transporter: nodemailer.Transporter<SESTransport.SentMessageInfo>;
  private ses: aws.SES;

  constructor(region: string) {
    this.ses = new aws.SES({
      apiVersion: "2010-12-01",
      region,
      credentialDefaultProvider: defaultProvider,
    });
    this.transporter = nodemailer.createTransport({
      SES: { ses: this.ses, aws },
      sendingRate: 10,
    });
  }

  sendMail({
    from = "HASH <support@hash.ai>",
    to,
    subject,
    text,
    html,
  }: SendMailOptions) {
    return this.transporter
      .sendMail({
        from,
        to,
        subject: isProdEnv ? subject : `[DEV SITE] ${subject}`,
        text: !text && typeof html === "string" ? convert(html) : text,
        html,
      })
      .then(() => undefined)
      .catch((err) => {
        logger.error("Error sending email: ", err);
      });
  }
}

export default AwsSesEmailTransporter;
