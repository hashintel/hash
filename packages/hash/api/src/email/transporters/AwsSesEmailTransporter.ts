import nodemailer from "nodemailer";
import SESTransport from "nodemailer/lib/ses-transport";
import * as aws from "@aws-sdk/client-ses";
import { convert } from "html-to-text";
import { defaultProvider } from "@aws-sdk/credential-provider-node";

import { EmailTransporter, EmailTransporterSendMailOptions } from "./types";
import { logger } from "../../logger";

export interface AwsSesEmailTransporterConfig {
  from: string;
  region: string;
  subjectPrefix?: string;
}

export class AwsSesEmailTransporter implements EmailTransporter {
  private nodemailerTransporter: nodemailer.Transporter<SESTransport.SentMessageInfo>;
  private ses: aws.SES;

  constructor(private config: AwsSesEmailTransporterConfig) {
    this.ses = new aws.SES({
      apiVersion: "2010-12-01",
      region: config.region,
      credentialDefaultProvider: defaultProvider,
    });
    this.nodemailerTransporter = nodemailer.createTransport({
      SES: { ses: this.ses, aws },
      sendingRate: 10,
    });
  }

  async sendMail({ to, subject, html }: EmailTransporterSendMailOptions) {
    return this.nodemailerTransporter
      .sendMail({
        from: this.config.from,
        to,
        subject: `${this.config.subjectPrefix ?? ""}${subject}`,
        text: convert(html),
        html,
      })
      .then(() => undefined)
      .catch((err) => {
        logger.error("Error sending email: ", err);
      });
  }
}
