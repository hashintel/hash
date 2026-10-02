import { join } from "node:path";

import { expect, test } from "vitest";

import { runNodeScript } from "./run-node-script";

test("Words reach the real system prompt on first delivery, tool continuation, replacement and restart", async () => {
  const { exitCode, stdout, stderr } = await runNodeScript(
    join(import.meta.dirname, "words.integration.ts"),
    join(import.meta.dirname, "../../../.."),
  );
  expect(exitCode, stderr || stdout).toBe(0);
  expect(stdout).toContain("WORDS_RUNTIME_PASS");
});
