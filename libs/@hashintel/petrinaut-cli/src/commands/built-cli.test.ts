import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { text } from "node:stream/consumers";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { deriveTrialSeeds } from "../runtime/optimization";
import { createOptimizationManifest } from "./optimization-manifest.fixtures";

const distCliPath = fileURLToPath(
  new URL("../../dist/cli.js", import.meta.url),
);

/**
 * Exercises the shipped bundle end to end. `turbo run test:unit` builds the
 * bundle first; the suite only skips when vitest runs without it.
 */
describe.skipIf(!existsSync(distCliPath))("built CLI", () => {
  it(
    "evaluates a trial as sequential seeded runs",
    { timeout: 120_000 },
    async () => {
      const manifest = await createOptimizationManifest({ seedsPerTrial: 2 });
      const child = spawn(
        process.execPath,
        [distCliPath, "serve", "--optimization-stdin", "--stdio"],
        { stdio: ["pipe", "pipe", "pipe"] },
      );
      child.stdin.end(
        [
          JSON.stringify(manifest),
          JSON.stringify({ id: 1, method: "optimization.describe" }),
          JSON.stringify({
            id: 2,
            method: "optimization.evaluate",
            params: { parameterValues: { infected_ratio: 0.1 } },
          }),
          "",
        ].join("\n"),
      );
      const [stdout, stderr, exitCode] = await Promise.all([
        text(child.stdout),
        text(child.stderr),
        new Promise<number | null>((resolve) => {
          child.on("close", resolve);
        }),
      ]);

      expect(stderr).toContain(
        "Petrinaut stdio ready for optimization manifest <stdin>",
      );
      expect(exitCode).toBe(0);

      const responses = stdout
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as unknown);
      const seeds = deriveTrialSeeds(42, 2);
      expect(responses).toEqual([
        {
          id: 1,
          result: expect.objectContaining({
            study: { trials: 20, sampler: "tpe", seed: 42, seedsPerTrial: 2 },
          }),
        },
        {
          id: 2,
          result: {
            objective: 0.1,
            replicates: seeds.map((seed) => ({ seed, objective: 0.1 })),
          },
        },
      ]);
    },
  );
});
