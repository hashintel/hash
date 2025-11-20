import { SendEmailCommand, SESv2Client } from "@aws-sdk/client-sesv2";
import { defaultProvider } from "@aws-sdk/credential-provider-node";
import { convert } from "html-to-text";
import nodemailer from "nodemailer";
import type SESTransport from "nodemailer/lib/ses-transport";

import { logger } from "../../logger";
import type {
  EmailTransporter,
  EmailTransporterSendMailOptions,
} from "./types";

export interface AwsSesEmailTransporterConfig {
  from: string;
  region: string;
  subjectPrefix?: string;
}

export class AwsSesEmailTransporter implements EmailTransporter {
  private nodemailerTransporter: nodemailer.Transporter<SESTransport.SentMessageInfo>;
  private ses: SESv2Client;

  constructor(private config: AwsSesEmailTransporterConfig) {
    this.ses = new SESv2Client({
      apiVersion: "2010-12-01",
      region: config.region,
      credentialDefaultProvider: defaultProvider,
    });
    this.nodemailerTransporter = nodemailer.createTransport({
      SES: { sesClient: this.ses, SendEmailCommand },
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
        logger.error(`Error sending email: ${err as string}`);
      });
  }
}
