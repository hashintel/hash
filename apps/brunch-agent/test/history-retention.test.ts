import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, test } from "vitest";

import { runNodeScript } from "./run-node-script";

test.each([false, true])(
  "existing-tool history survives compaction and authorized reopen (silent overflow: %s)",
  async (overflow) => {
    const directory = await mkdtemp(join(tmpdir(), "brunch-a4-retention-"));
    try {
      for (const phase of ["create", "reopen"]) {
        // oxlint-disable-next-line no-await-in-loop -- The previous runtime must stop before the same store is reopened.
        const result = await runNodeScript(
          join(import.meta.dirname, "history-retention.integration.ts"),
          join(import.meta.dirname, "../../.."),
          {
            A4_OUTPUT_DIRECTORY: directory,
            A4_PHASE: phase,
            A4_OVERFLOW_PROBE: overflow ? "1" : "0",
          },
        );
        expect(result.exitCode, result.stderr + result.stdout).toBe(0);
        expect(result.stdout).toContain(`A4_${phase.toUpperCase()}_PASS`);
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
  60000,
);
