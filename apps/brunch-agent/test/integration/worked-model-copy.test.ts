import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

import { expect, test } from "vitest";

import { runNodeScript } from "./run-node-script";

const packageRoot = join(import.meta.dirname, "../..");
const websiteDist = resolve(
  packageRoot,
  process.env.M7_WEBSITE_DIST ?? "../petrinaut-website/dist",
);
const enabled = existsSync(join(websiteDist, "index.html"));

test.skipIf(!enabled)(
  "a build-seeded bundle mutates, reopens and creates isolated clean copies through the product route",
  async () => {
    const result = await runNodeScript(
      join(import.meta.dirname, "../worked-model-copy.integration.ts"),
      packageRoot,
    );
    expect(result.exitCode, result.stderr + result.stdout).toBe(0);
    const line = result.stdout
      .split("\n")
      .find((entry) => entry.startsWith("WORKED_MODEL_COPY "));
    expect(line, result.stdout).toBeDefined();
    const summary = JSON.parse(line!.slice("WORKED_MODEL_COPY ".length)) as {
      changedCopyId: string;
      cleanCopyId: string;
      reopened: boolean;
    };
    expect(summary.changedCopyId).not.toBe(summary.cleanCopyId);
    expect(summary.reopened).toBe(true);
  },
  120_000,
);
