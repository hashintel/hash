/**
 * The introspection helpers themselves, at the seams where a wrong answer
 * makes some other invariant pass vacuously or fail spuriously.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, relative } from "node:path";

import { afterAll, describe, expect, test } from "vitest";

import {
  sourceFiles,
  testFiles,
  type WorkspacePackage,
} from "./architecture-workspace";

describe("the source/test partition is total", () => {
  // A real directory rather than fakes, because the property under test is the
  // walk itself: the FE-1400 review's verified escape was a file in a *nested*
  // test directory (`src/test/`), pruned by the source walk but never collected
  // by the old top-level-only test walk — governed by nothing.
  const dir = mkdtempSync(join(tmpdir(), "brunch-partition-"));
  mkdirSync(join(dir, "src/test"), { recursive: true });
  mkdirSync(join(dir, "__tests__"));
  writeFileSync(join(dir, "src/index.ts"), "export {};\n");
  writeFileSync(join(dir, "src/test/nested.ts"), "export {};\n");
  writeFileSync(join(dir, "__tests__/top.test.ts"), "export {};\n");
  const pkg: WorkspacePackage = {
    name: "@hashintel/brunch-agent-fixture",
    dir: basename(dir),
    path: dir,
    relPath: `packages/${basename(dir)}`,
    kind: "package",
    manifest: { name: "@hashintel/brunch-agent-fixture" },
  };

  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  test("every file is exactly one of source or test — nested test dirs included", () => {
    const source = sourceFiles(pkg)
      .map((f) => relative(dir, f.path))
      .sort();
    const test = testFiles(pkg)
      .map((f) => relative(dir, f.path))
      .sort();
    expect(source).toEqual(["src/index.ts"]);
    expect(test).toEqual(["__tests__/top.test.ts", "src/test/nested.ts"]);
  });
});
