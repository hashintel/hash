import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  generatorInputsHash,
  readCachedBaseSide,
  writeCachedBaseSide,
} from "./base-cache";

import type { DiffSide } from "./bundle-diff";

/**
 * The cache's one hazard is serving a stale base: a side built by older
 * generator code, or for another commit. Both key components are pinned here
 * — a round trip only succeeds on an exact (sha, inputs) match, and the
 * inputs hash moves when any generator source moves.
 */

const sha = "a".repeat(40);

const sideFixture: DiffSide = {
  layers: [],
  sourceUrlPrefix: "https://github.com/x/y/blob/aaaa/",
  pages: [
    {
      slug: "architecture",
      title: "Architecture",
      description: "",
      order: 1000,
      kind: "generated",
      contents: '---\ntitle: "Architecture"\n---\n\nBody.\n',
    },
  ],
};

let scratch: string;

beforeEach(async () => {
  scratch = await mkdtemp(join(tmpdir(), "base-cache-test-"));
});

afterEach(async () => {
  await rm(scratch, { recursive: true, force: true });
});

describe("base cache", () => {
  it("round-trips a base side on an exact key match", () => {
    writeCachedBaseSide({
      cacheDir: scratch,
      sha,
      inputsHash: "hash-1",
      side: sideFixture,
    });

    expect(
      readCachedBaseSide({ cacheDir: scratch, sha, inputsHash: "hash-1" }),
    ).toEqual(sideFixture);
  });

  it("misses when the generator inputs moved", () => {
    writeCachedBaseSide({
      cacheDir: scratch,
      sha,
      inputsHash: "hash-1",
      side: sideFixture,
    });

    expect(
      readCachedBaseSide({ cacheDir: scratch, sha, inputsHash: "hash-2" }),
    ).toBeNull();
  });

  it("keeps entries for different generator versions side by side", () => {
    const otherSide = { ...sideFixture, sourceUrlPrefix: "other/" };
    writeCachedBaseSide({
      cacheDir: scratch,
      sha,
      inputsHash: "hash-1",
      side: sideFixture,
    });
    writeCachedBaseSide({
      cacheDir: scratch,
      sha,
      inputsHash: "hash-2",
      side: otherSide,
    });

    expect(
      readCachedBaseSide({ cacheDir: scratch, sha, inputsHash: "hash-1" }),
    ).toEqual(sideFixture);
    expect(
      readCachedBaseSide({ cacheDir: scratch, sha, inputsHash: "hash-2" }),
    ).toEqual(otherSide);
  });

  it("misses on an absent or unreadable entry", async () => {
    expect(
      readCachedBaseSide({ cacheDir: scratch, sha, inputsHash: "hash-1" }),
    ).toBeNull();

    await writeFile(
      join(scratch, `base-hash-1-${sha}.json`),
      "not json",
      "utf8",
    );
    expect(
      readCachedBaseSide({ cacheDir: scratch, sha, inputsHash: "hash-1" }),
    ).toBeNull();
  });
});

describe("generatorInputsHash", () => {
  const packageFixture = async (): Promise<string> => {
    const root = join(scratch, "pkg");
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(join(root, "architecture.config.ts"), "export {};");
    await writeFile(join(root, "dependency-cruiser.tsconfig.json"), "{}");
    await writeFile(join(root, "package.json"), "{}");
    await writeFile(join(root, "src/build.ts"), "export const a = 1;");
    await writeFile(join(root, "src/build.test.ts"), "test file");
    return root;
  };

  it("moves when a source file or a flag moves, and only then", async () => {
    const root = await packageFixture();
    const before = generatorInputsHash({
      packageRoot: root,
      includeDiagrams: true,
    });

    expect(
      generatorInputsHash({ packageRoot: root, includeDiagrams: true }),
    ).toBe(before);
    expect(
      generatorInputsHash({ packageRoot: root, includeDiagrams: false }),
    ).not.toBe(before);

    await writeFile(join(root, "src/build.ts"), "export const a = 2;");
    expect(
      generatorInputsHash({ packageRoot: root, includeDiagrams: true }),
    ).not.toBe(before);
  });

  it("ignores test files", async () => {
    const root = await packageFixture();
    const before = generatorInputsHash({
      packageRoot: root,
      includeDiagrams: true,
    });

    await writeFile(join(root, "src/build.test.ts"), "changed test file");
    expect(
      generatorInputsHash({ packageRoot: root, includeDiagrams: true }),
    ).toBe(before);
  });
});
