import { expect, test } from "vitest";

import { runNodeScript } from "./run-node-script";

test("the built agent carries nested canonical input and correlates headless continuation over the mounted route", async () => {
  const { exitCode, stdout, stderr } = await runNodeScript(
    new URL(
      "../../src/evaluations/runbook/schema-carrier-probe.ts",
      import.meta.url,
    ).pathname,
    new URL("../../../..", import.meta.url).pathname,
    {},
  );
  expect(exitCode, `${stderr}\n${stdout}`).toBe(0);
  expect(stdout).toContain('SCHEMA_CARRIER_PROBE {"passed":true,"paid":false');
});
