import { join } from "node:path";

import { expect, test } from "vitest";

import { runNodeScript } from "./run-node-script";

test("the Ledger is reconstructed from canonical history within a turn and after a restart", async () => {
  const { exitCode, stdout, stderr } = await runNodeScript(
    join(import.meta.dirname, "ledger-history.integration.ts"),
    join(import.meta.dirname, "../../../.."),
  );
  expect(exitCode, stderr || stdout).toBe(0);
  expect(stdout).toContain("LEDGER_HISTORY_PASS");
});
