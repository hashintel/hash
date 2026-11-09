import { join } from "node:path";

import { expect, test } from "vitest";

import { runNodeScript } from "./run-node-script.ts";

test("offer_answers beside the closing commit ends the turn in one model step, and never ends it alone", async () => {
  const { exitCode, stdout, stderr } = await runNodeScript(
    join(import.meta.dirname, "offer-answers.integration.ts"),
    join(import.meta.dirname, "../../../.."),
  );
  expect(exitCode, stderr || stdout).toBe(0);
  expect(stdout).toContain("OFFER_ANSWERS_PASS");
});
