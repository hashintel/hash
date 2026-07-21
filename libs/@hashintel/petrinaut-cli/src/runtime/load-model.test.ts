import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { loadSdcpnModel } from "./load-model";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("loadSdcpnModel", () => {
  it("rejects unsupported versioned files instead of loading them as raw snapshots", async () => {
    const directory = await mkdtemp(join(tmpdir(), "petrinaut-cli-"));
    temporaryDirectories.push(directory);
    const path = join(directory, "future.json");
    await writeFile(
      path,
      JSON.stringify({ version: 999, places: [], transitions: [] }),
    );

    await expect(loadSdcpnModel(path)).rejects.toThrow(
      "Unsupported SDCPN file format version",
    );
  });
});
