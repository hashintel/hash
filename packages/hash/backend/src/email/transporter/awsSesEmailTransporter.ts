import nodemailer, { SendMailOptions } from "nodemailer";
import SESTransport from "nodemailer/lib/ses-transport";
import * as aws from "@aws-sdk/client-ses";
import { convert } from "html-to-text";
import { isProdEnv } from "../../lib/env-config";
import EmailTransporter from ".";
import { logger } from "../../logger";

const ses = new aws.SES({
  apiVersion: "2010-12-01",
  region: "us-east-1",
});

class AwsSesEmailTransporter implements EmailTransporter {
  private transporter: nodemailer.Transporter<SESTransport.SentMessageInfo>;

  constructor() {
    this.transporter = nodemailer.createTransport({
      SES: { ses, aws },
      sendingRate: 10,
    });
  }

  sendMail = ({
    from = "HASH <support@hash.ai>",
    to,
    subject,
    text,
    html,
  }: SendMailOptions) =>
    this.transporter
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

export default AwsSesEmailTransporter;
