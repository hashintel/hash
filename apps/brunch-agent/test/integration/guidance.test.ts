import { join } from "node:path";

import { expect, test } from "vitest";

import { runNodeScript } from "./run-node-script.ts";

test("the built app activates native skills, reads packaged resources and keeps the Ledger", async () => {
  const { exitCode, stdout, stderr } = await runNodeScript(
    join(import.meta.dirname, "guidance.integration.ts"),
    join(import.meta.dirname, "../../../.."),
  );
  expect(exitCode, stderr || stdout).toBe(0);
  expect(stdout).toContain("GUIDANCE_PASS");
});
