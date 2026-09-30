import { join } from "node:path";

import { expect, test } from "vitest";

import { runNodeScript } from "./run-node-script";

test.each(["baseline", "replacement", "feedback", "identity"])(
  "%s activates native skills and reads packaged resources in the built app",
  async (variant) => {
    const { exitCode, stdout, stderr } = await runNodeScript(
      join(import.meta.dirname, "guidance.integration.ts"),
      join(import.meta.dirname, "../../../.."),
      { BRUNCH_GUIDANCE_VARIANT: variant },
    );
    expect(exitCode, stderr || stdout).toBe(0);
    expect(stdout).toContain(`GUIDANCE_PASS ${variant}`);
  },
);
