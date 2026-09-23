import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

import { expect, test } from "vitest";

import { runNodeScript } from "./run-node-script";

const packageRoot = join(import.meta.dirname, "../..");
const websiteDist = resolve(
  packageRoot,
  process.env.M7_WEBSITE_DIST ?? "../petrinaut-website/dist",
);

test.skipIf(!existsSync(join(websiteDist, "index.html")))(
  "built integrated ChatAgent executes and verifies a direct canonical experiment in the real browser",
  async () => {
    const result = await runNodeScript(
      join(
        import.meta.dirname,
        "../direct-experiment-browser-boundary.integration.ts",
      ),
      packageRoot,
    );
    expect(result.exitCode, result.stderr + result.stdout).toBe(0);
    expect(result.stdout).toContain("DIRECT_EXPERIMENT_BROWSER_BOUNDARY_PASS");
  },
  180_000,
);
