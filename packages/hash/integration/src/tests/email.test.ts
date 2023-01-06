import "./load-test-env";

import { AwsSesEmailTransporter } from "@hashintel/hash-api/src/email/transporters";
import { getAwsRegion } from "@hashintel/hash-api/src/lib/aws-config";
import { getRequiredEnv } from "@hashintel/hash-backend-utils/environment";

if (process.env.HASH_DEV_INTEGRATION_EMAIL) {
  const to = process.env.HASH_DEV_INTEGRATION_EMAIL;
  it("can send an email", async () => {
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
} else {
  // Need at least one test otherwise jest will complain
  it("always passes", () => undefined);
}
