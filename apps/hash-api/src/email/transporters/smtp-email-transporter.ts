import { getRequiredEnv } from "@local/hash-backend-utils/environment";
import { convert } from "html-to-text";
import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";

import { logger } from "../../logger";
import type {
  EmailTransporter,
  EmailTransporterSendMailOptions,
} from "./types";

export interface SmtpEmailTransporterConfig {
  from: string;
  subjectPrefix?: string;
}

export class SmtpEmailTransporter implements EmailTransporter {
  private nodemailerTransporter: nodemailer.Transporter<SMTPTransport.SentMessageInfo>;

  constructor(private config: SmtpEmailTransporterConfig) {
    const host = getRequiredEnv("SMTP_SERVER_HOST");
    const port = parseInt(getRequiredEnv("SMTP_SERVER_PORT"), 10);
    const username = process.env.SMTP_SERVER_USERNAME;
    const password = username
      ? getRequiredEnv("SMTP_SERVER_PASSWORD")
      : process.env.SMTP_SERVER_PASSWORD;

    this.nodemailerTransporter = nodemailer.createTransport({
      host,
      port,
      ...(username && password
        ? {
            auth: {
              type: "login",
              user: username,
              pass: password,
            },
          }
        : {}),
      secure: port === 465,
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
