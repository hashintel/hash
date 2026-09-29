import { join } from "node:path";

import { expect, test } from "vitest";

import { runNodeScript } from "./run-node-script";

test("Ledger evidence cites the ids the model is shown and survives a restart", async () => {
  const { exitCode, stdout, stderr } = await runNodeScript(
    join(import.meta.dirname, "workpiece-evidence.integration.ts"),
    join(import.meta.dirname, "../../../.."),
  );
  expect(exitCode, stderr || stdout).toBe(0);
  expect(stdout).toContain("WORKPIECE_EVIDENCE_PASS");
});
