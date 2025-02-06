import execa from "execa";
import { describe, expect, it } from "vitest";

describe("yarn start", () => {
  it("should start without errors", async () => {
    const subprocess = execa("yarn", ["start"], { all: true });

    let logs = "";

    subprocess.all?.on("data", (chunk) => {
      logs += chunk;

      if (
        logs.includes(
          "Worker state changed { sdkComponent: 'worker', taskQueue: 'ai', state: 'RUNNING' }",
        )
      ) {
        subprocess.kill();
      }
    });

    await subprocess.catch((err) => err);

    expect(logs).toContain(
      "Worker state changed { sdkComponent: 'worker', taskQueue: 'ai', state: 'RUNNING' }",
    );
  }, 20_000);
});
