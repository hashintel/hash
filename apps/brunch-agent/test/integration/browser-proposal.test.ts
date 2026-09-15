import { join } from "node:path";

import { expect, test } from "vitest";

import { runNodeScript } from "./run-node-script";

test("the mounted route rejects a mixed-validity browser batch before publication and preserves single-call continuation", async () => {
  const result = await runNodeScript(
    join(import.meta.dirname, "browser-proposal.integration.ts"),
    join(import.meta.dirname, "../../../.."),
  );
  expect(result.exitCode, result.stderr + result.stdout).toBe(0);
  expect(result.stdout).toContain("SINGLE_BROWSER_PROPOSAL_PASS");
}, 30000);
