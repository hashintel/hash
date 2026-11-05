import { join } from "node:path";

import { expect, test } from "vitest";

import { runNodeScript } from "./run-node-script.ts";

test("a later send's binding never rebinds the conversation: X's binding issues, Y's claim gets 404 (T3)", async () => {
  const { exitCode, stdout, stderr } = await runNodeScript(
    join(import.meta.dirname, "rebinding.integration.ts"),
    join(import.meta.dirname, "../../../.."),
  );
  expect(exitCode, stderr || stdout).toBe(0);
  expect(stdout).toContain("REBINDING_PASS");
});
