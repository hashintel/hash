import { join } from "node:path";

import { expect, test } from "vitest";

import { runNodeScript } from "./run-node-script";

test("the mounted route records two browser calls and continues once after their correlated results", async () => {
  const result = await runNodeScript(
    join(import.meta.dirname, "browser-proposal.integration.ts"),
    join(import.meta.dirname, "../../../.."),
  );
  expect(result.exitCode, result.stderr + result.stdout).toBe(0);
  expect(result.stdout).toContain("MULTI_BROWSER_PROPOSAL_PASS");
}, 30000);
