import path from "node:path";

import { getAwsRegion } from "@local/hash-backend-utils/aws-config";
import {
  getRequiredEnv,
  monorepoRootDir,
} from "@local/hash-backend-utils/environment";

import { isDevEnv, isProdEnv, isTestEnv } from "../lib/env-config";
import { logger } from "../logger";
import { AwsSesEmailTransporter, DummyEmailTransporter } from "./transporters";
import { SmtpEmailTransporter } from "./transporters/smtp-email-transporter";
import type { EmailTransporter } from "./transporters/types";

const transporterType = process.env.HASH_EMAIL_TRANSPORTER;

export const createEmailTransporter = (): EmailTransporter => {
  if (transporterType === "dummy") {
    if (!(isDevEnv || isTestEnv)) {
      logger.error(
        "HASH_EMAIL_TRANSPORTER is set to dummy, but application is running in production mode.",
      );
    }

    return new DummyEmailTransporter({
      filePath: process.env.DUMMY_EMAIL_TRANSPORTER_FILE_PATH
        ? path.resolve(
            monorepoRootDir,
            process.env.DUMMY_EMAIL_TRANSPORTER_FILE_PATH,
          )
        : undefined,
    });
  }

  const subjectPrefix = isProdEnv ? undefined : "[DEV SITE] ";

  if (transporterType === "aws") {
    return new AwsSesEmailTransporter({
      from: `${getRequiredEnv(
        "SYSTEM_EMAIL_SENDER_NAME",
      )} <${getRequiredEnv("SYSTEM_EMAIL_ADDRESS")}>`,
      region: getAwsRegion(),
      subjectPrefix,
    });
  }

  if (transporterType === "smtp") {
    return new SmtpEmailTransporter({
      from: `${getRequiredEnv(
        "SYSTEM_EMAIL_SENDER_NAME",
      )} <${getRequiredEnv("SYSTEM_EMAIL_ADDRESS")}>`,
      subjectPrefix,
    });
  }

  return {
    sendMail: (mail) => {
      logger.info(`Tried to send mail to ${mail.to}:\n${mail.html}`);
    },
  } as EmailTransporter;
};
