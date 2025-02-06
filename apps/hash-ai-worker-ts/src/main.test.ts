import execa from "execa";
import { describe, expect, it } from "vitest";

describe("yarn start", () => {
  it("should start without errors", async () => {
    const subprocess = execa("yarn", ["start"], {
      all: true,
      env: {
        ANTHROPIC_API_KEY: "dummy",
        HASH_TEMPORAL_WORKER_AI_AWS_ACCESS_KEY_ID: "dummy",
        HASH_TEMPORAL_WORKER_AI_AWS_SECRET_ACCESS_KEY: "dummy",
      },
    });

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
