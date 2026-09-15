import { join } from "node:path";

import { expect, test } from "vitest";

import { runNodeScript } from "./run-node-script";

test("a user turn without a verified current-net read is marked stale ahead of the model's first turn, and a verified read clears it", async () => {
  const result = await runNodeScript(
    join(import.meta.dirname, "net-freshness.integration.ts"),
    join(import.meta.dirname, "../../../.."),
  );
  expect(result.exitCode, result.stderr + result.stdout).toBe(0);
  expect(result.stdout).toContain("NET_FRESHNESS_PASS");
}, 30000);
