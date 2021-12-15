import "./loadTestEnv";
import { AwsSesEmailTransporter } from "@hashintel/hash-api/src/email/transporters";
import { AWS_REGION } from "@hashintel/hash-api/src/lib/aws-config";

if (process.env.HASH_DEV_INTEGRATION_EMAIL) {
  const to = process.env.HASH_DEV_INTEGRATION_EMAIL;
  it("can send an email", async () => {
    const emailTransporter = new AwsSesEmailTransporter({
      from: "HASH <support@hash.ai>",
      region: AWS_REGION,
      subjectPrefix: "[INTEGRATION TESTS] ",
    });
    await emailTransporter.sendMail({
      to,
      subject: "HASH.dev 'can send email' integration test",
      html: `time: ${new Date().toISOString()}`,
    });
  });
} else {
  // Need at least one test otherwise jest will complain
  it("always passes", () => undefined);
}
