import "./load-test-env";

import { AwsSesEmailTransporter } from "@apps/hash-api/src/email/transporters";
import { getAwsRegion } from "@local/hash-backend-utils/aws-config";
import { getRequiredEnv } from "@local/hash-backend-utils/environment";
import { it } from "vitest";

it("can send an email", async ({ skip }) => {
  if (process.env.HASH_DEV_INTEGRATION_EMAIL === undefined) {
    skip();
    return;
  }

  const to = process.env.HASH_DEV_INTEGRATION_EMAIL;

  const emailTransporter = new AwsSesEmailTransporter({
    from: `${getRequiredEnv("SYSTEM_EMAIL_SENDER_NAME")} <${getRequiredEnv(
      "SYSTEM_EMAIL_ADDRESS",
    )}>`,
    region: getAwsRegion(),
    subjectPrefix: "[INTEGRATION TESTS] ",
  });
  await emailTransporter.sendMail({
    to,
    subject: "HASH 'can send email' integration test",
    html: `time: ${new Date().toISOString()}`,
  });
});
