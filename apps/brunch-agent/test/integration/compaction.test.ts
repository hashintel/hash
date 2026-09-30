import { join } from "node:path";

import { expect, test } from "vitest";

import { runNodeScript } from "./run-node-script";

test("compaction removes earlier results from the model's context while the Ledger still compiles", async () => {
  const { exitCode, stdout, stderr } = await runNodeScript(
    join(import.meta.dirname, "compaction.integration.ts"),
    join(import.meta.dirname, "../../../.."),
  );
  expect(exitCode, stderr || stdout).toBe(0);
  expect(stdout).toContain("COMPACTION_PASS");
});
