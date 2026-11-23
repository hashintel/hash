import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { generate } from "orval";
import { expect, test } from "vitest";

import { options } from "../orval.config.js";

const packageRoot = join(import.meta.dirname, "..");

test("src/api.gen.ts is what orval generates from openapi.json", async () => {
  const outputDirectory = await mkdtemp(join(tmpdir(), "internal-api-client-"));
  const target = join(outputDirectory, "api.gen.ts");

  try {
    await generate(
      { ...options, output: { ...options.output, target } },
      packageRoot,
    );

    // Fails on a mismatch. `yarn codegen` (or `vitest run -u`) rewrites the
    // committed file.
    await expect(await readFile(target, "utf8")).toMatchFileSnapshot(
      "../src/api.gen.ts",
    );
  } finally {
    await rm(outputDirectory, { recursive: true, force: true });
  }
});
