import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

import { expect, test } from "vitest";

import { runNodeScript } from "./run-node-script";

const packageRoot = join(import.meta.dirname, "../..");
const websiteDist = resolve(
  packageRoot,
  process.env.M7_WEBSITE_DIST ?? "../petrinaut-website/dist",
);
// The browser proof needs the built Petrinaut website; `yarn test:compiler-feedback`
// builds it first, and the vitest wrapper skips rather than fails without it.
const enabled = existsSync(join(websiteDist, "index.html"));

test.skipIf(!enabled)(
  "invalid dynamics reach Flue as a correlated compiler error, repair to clean, and stay hash-coherent through ELK layout",
  async () => {
    const result = await runNodeScript(
      join(import.meta.dirname, "../compiler-feedback.integration.ts"),
      packageRoot,
    );
    expect(result.exitCode, result.stderr + result.stdout).toBe(0);
    const line = result.stdout
      .split("\n")
      .find((entry) => entry.startsWith('{"output":'));
    expect(line, result.stdout).toBeDefined();
    const summary = JSON.parse(line!) as {
      mode: string;
      dirtyCompilation: string;
      cleanCompilation: string;
      repairHash: string;
      layoutHash: string;
      positionEffects: number;
    };
    expect(summary.mode).toBe("batched-construction");
    expect(summary.dirtyCompilation).toContain("definitelyNotDefined");
    expect(summary.cleanCompilation).toBe(
      "No errors detected in your model – everything compiles!",
    );
    expect(summary.repairHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(summary.layoutHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(summary.layoutHash).not.toBe(summary.repairHash);
    expect(summary.positionEffects).toBeGreaterThan(0);
  },
  180_000,
);
