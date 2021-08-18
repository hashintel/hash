import { sendMail } from "@hashintel/hash-backend/src/email";

if (process.env.HASH_DEV_INTEGRATION_EMAIL) {
  it("can send an email", async () => {
    await sendMail({
      to: process.env.HASH_DEV_INTEGRATION_EMAIL,
      subject: "HASH.dev 'can send email' integration test",
      text: `time: ${(new Date()).toISOString()}`,
    });
  });
}
