import { describe, expect, it } from "vitest";

import {
  exclusionPattern,
  sourceExtensions,
  sourceRootOf,
  sourceRootPattern,
} from "./scope";

import type { ArchitecturePackage } from "./model";

/**
 * These four functions exist because the extractor and the graph builder used to
 * answer the same questions separately and drift apart. The tests pin the answers
 * rather than the callers, so a future divergence shows up here first.
 */

const pkg = (
  overrides: Partial<ArchitecturePackage> & Pick<ArchitecturePackage, "path">,
): ArchitecturePackage => ({
  name: "@test/pkg",
  description: "",
  language: "typescript",
  sourceDirectory: "src",
  ...overrides,
});

describe("sourceRootOf", () => {
  it("honours a non-default sourceDirectory", () => {
    expect(sourceRootOf(pkg({ path: "libs/a", sourceDirectory: "lib" }))).toBe(
      "libs/a/lib",
    );
  });

  it("defaults to src", () => {
    expect(sourceRootOf(pkg({ path: "libs/a" }))).toBe("libs/a/src");
  });
});

describe("sourceRootPattern", () => {
  it("anchors at the start and requires a path separator", () => {
    const pattern = new RegExp(
      sourceRootPattern([pkg({ path: "libs/a" }), pkg({ path: "libs/b" })]),
      "u",
    );

    expect(pattern.test("libs/a/src/index.ts")).toBe(true);
    expect(pattern.test("libs/b/src/index.ts")).toBe(true);
    // A sibling whose name merely starts the same must not match.
    expect(pattern.test("libs/a/srcs/index.ts")).toBe(false);
    expect(pattern.test("other/libs/a/src/index.ts")).toBe(false);
  });

  it("escapes regular-expression characters in a package path", () => {
    const pattern = new RegExp(
      sourceRootPattern([pkg({ path: "libs/@scope/a.b" })]),
      "u",
    );

    expect(pattern.test("libs/@scope/a.b/src/index.ts")).toBe(true);
    expect(pattern.test("libs/@scope/aXb/src/index.ts")).toBe(false);
  });
});

describe("exclusionPattern", () => {
  const pattern = new RegExp(
    exclusionPattern({
      ignoredDirectories: ["node_modules", "__fixtures__"],
      ignoredFilePattern: /(?:\.test\.ts$|\.d\.ts$)/u,
    }),
    "u",
  );

  it("excludes an ignored directory at any depth", () => {
    expect(pattern.test("libs/a/src/__fixtures__/net.ts")).toBe(true);
    expect(pattern.test("libs/a/src/deep/node_modules/x.ts")).toBe(true);
  });

  it("excludes ignored files", () => {
    expect(pattern.test("libs/a/src/thing.test.ts")).toBe(true);
    expect(pattern.test("libs/a/src/thing.d.ts")).toBe(true);
  });

  it("keeps ordinary source", () => {
    expect(pattern.test("libs/a/src/thing.ts")).toBe(false);
    // A directory name appearing as a file stem is not an exclusion.
    expect(pattern.test("libs/a/src/node_modules.ts")).toBe(false);
  });
});

describe("sourceExtensions", () => {
  it("covers the module extensions TypeScript emits from", () => {
    expect([...sourceExtensions]).toEqual([".ts", ".tsx", ".mts", ".cts"]);
  });
});
