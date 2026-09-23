import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

import { expect, test } from "vitest";

import { runNodeScript } from "./run-node-script";

const packageRoot = join(import.meta.dirname, "../..");
const websiteDist = resolve(
  packageRoot,
  process.env.M7_WEBSITE_DIST ?? "../petrinaut-website/dist",
);
// TRANSITIONAL: retire after the final manual tour-and-review. The canonical
// I-mode browser witness needs the built website; the named command builds it.
const enabled = existsSync(join(websiteDist, "index.html"));

test.skipIf(!enabled)(
  "canonical I-mode diagnostics report broken dynamics, then the repaired saved net compiles cleanly",
  async () => {
    const result = await runNodeScript(
      join(import.meta.dirname, "../compiler-feedback.integration.ts"),
      packageRoot,
    );
    expect(result.exitCode, result.stderr + result.stdout).toBe(0);
    const line = result.stdout
      .split("\n")
      .find((entry) => entry.startsWith("CANONICAL_COMPILER_FEEDBACK_PASS "));
    expect(line, result.stdout).toBeDefined();
    const summary = JSON.parse(
      line!.slice("CANONICAL_COMPILER_FEEDBACK_PASS ".length),
    ) as { mode: string; dirty: boolean; clean: boolean; saved: boolean };
    expect(summary).toEqual({
      mode: "integrated-brunch-canonical",
      dirty: true,
      clean: true,
      saved: true,
    });
  },
  180_000,
);
