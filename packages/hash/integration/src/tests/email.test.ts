import AwsSesEmailTransporter from "@hashintel/hash-backend/src/email/transporter/awsSes";

if (process.env.HASH_DEV_INTEGRATION_EMAIL) {
  it("can send an email", async () => {
    const tp = new AwsSesEmailTransporter();
    await tp.sendMail({
      to: process.env.HASH_DEV_INTEGRATION_EMAIL,
      subject: "HASH.dev 'can send email' integration test",
      text: `time: ${new Date().toISOString()}`,
    });
  });
} else {
  // Need at least one test otherwise jest will complain
  it("always passes", () => undefined);
}
