import { expect, test } from "vitest";

import { runNodeScript } from "./run-node-script";

test("the built ChatAgent carries native root-arc/addType input through both real SDK entrypoints and refuses invalid raw input", async () => {
  const { exitCode, stdout, stderr } = await runNodeScript(
    new URL("./native-schema-carriage.integration.ts", import.meta.url)
      .pathname,
    new URL("../../../..", import.meta.url).pathname,
    {},
  );
  expect(exitCode, `${stderr}\n${stdout}`).toBe(0);
  expect(stdout).toContain(
    'NATIVE_SCHEMA_CARRIAGE {"passed":true,"networkAttempts":0',
  );
});
