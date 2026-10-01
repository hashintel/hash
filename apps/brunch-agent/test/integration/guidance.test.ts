import { join } from "node:path";

import { expect, test } from "vitest";

import { guidanceVariants } from "../../src/agents/chat-agent/guidance-variant.ts";
import { runNodeScript } from "./run-node-script";

test.each(guidanceVariants)(
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
