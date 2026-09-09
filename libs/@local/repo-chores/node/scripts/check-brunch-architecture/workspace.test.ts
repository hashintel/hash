/**
 * The introspection helpers themselves, at the seams where a wrong answer
 * makes some other invariant pass vacuously or fail spuriously.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, describe, expect, test } from "vitest";

import { sourceFiles, testFiles, type WorkspacePackage } from "./workspace";

describe("the source/test partition is total", () => {
  // A real directory rather than fakes, because the property under test is the
  // walk itself: the FE-1400 review's verified escape was a file in a *nested*
  // test directory (`src/test/`), pruned by the source walk but never collected
  // by the old top-level-only test walk — governed by nothing.
  const dir = mkdtempSync(path.join(tmpdir(), "brunch-partition-"));
  mkdirSync(path.join(dir, "src/test"), { recursive: true });
  mkdirSync(path.join(dir, "__tests__"));
  writeFileSync(path.join(dir, "src/index.ts"), "export {};\n");
  writeFileSync(path.join(dir, "src/test/nested.ts"), "export {};\n");
  writeFileSync(path.join(dir, "__tests__/top.test.ts"), "export {};\n");
  const pkg: WorkspacePackage = {
    name: "@hashintel/brunch-agent-fixture",
    dir: path.basename(dir),
    path: dir,
    relPath: `packages/${path.basename(dir)}`,
    kind: "package",
    manifest: { name: "@hashintel/brunch-agent-fixture" },
  };

  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  test("every file is exactly one of source or test — nested test dirs included", () => {
    const source = sourceFiles(pkg)
      .map((file) => path.relative(dir, file.path))
      .sort();
    const tests = testFiles(pkg)
      .map((file) => path.relative(dir, file.path))
      .sort();
    expect(source).toEqual(["src/index.ts"]);
    expect(tests).toEqual(["__tests__/top.test.ts", "src/test/nested.ts"]);
  });
});
