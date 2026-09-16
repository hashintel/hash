import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, test } from "vitest";

import {
  auditReopenedWhyRetention,
  falsifyReopenedWhyRetention,
  loadReopenedWhyRetention,
} from "./reopened-why-retention-audit";
import { runNodeScript } from "./run-node-script";

const packageRoot = join(import.meta.dirname, "../..");
const retentionScript = join(
  import.meta.dirname,
  "../reopened-why-retention.integration.ts",
);
const enabled = process.env.A5_RETENTION === "1";

test.skipIf(!enabled)(
  "three processes retain why and source records through fold and reopen",
  async () => {
    const output = await mkdtemp(join(tmpdir(), "brunch-a5-retention-"));
    const original = join(output, "original");
    try {
      for (const phase of ["create", "fold", "reopen"] as const) {
        // oxlint-disable-next-line no-await-in-loop -- Each phase must own the same store in a new process.
        const result = await runNodeScript(retentionScript, packageRoot, {
          A5_RETENTION_OUTPUT: original,
          A5_RETENTION_PHASE: phase,
        });
        expect(result.exitCode, result.stderr + result.stdout).toBe(0);
        expect(result.stdout).toContain(
          `A5_RETENTION_${phase.toUpperCase()}_PASS`,
        );
      }
      const bundle = loadReopenedWhyRetention(original);
      const observation = auditReopenedWhyRetention(bundle);
      expect(observation.completionPins).toBeGreaterThanOrEqual(22);
      expect(falsifyReopenedWhyRetention(bundle)).toHaveLength(10);
    } catch (error) {
      process.stderr.write(`Preserved diagnostic directory ${output}\n`);
      throw error;
    }
    await rm(output, { recursive: true, force: true });
  },
  300000,
);
