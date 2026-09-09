import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { expect, test } from "vitest";

import { CONTEXT_ROOT, HASH_ROOT } from "./workspace";

const evidenceRoot = join(CONTEXT_ROOT, "docs/evidence");
const allowlistedMachineFiles = new Set(["accounting/usage-ledger.json"]);
const allowedExtensions = new Set([".md", ".txt"]);

const walkFiles = (directory: string): string[] =>
  readdirSync(directory).flatMap((entry) => {
    if (entry === ".gitignore") return [];
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? walkFiles(path) : [path];
  });

test("supported runners do not default output under docs/evidence", () => {
  const construction = readFileSync(
    join(
      HASH_ROOT,
      "apps/brunch-agent/src/evaluations/runbook/construction-run.ts",
    ),
    "utf8",
  );
  const persona = readFileSync(
    join(HASH_ROOT, "apps/brunch-agent/src/evaluations/persona/launch.ts"),
    "utf8",
  );
  expect(construction).toContain(".data-wipe-me/evaluations/");
  expect(construction).not.toMatch(
    /defaultOutputDirectory[\s\S]{0,200}docs\/evidence/,
  );
  expect(persona).toContain(".data-wipe-me/persona-runs");
  expect(persona).not.toContain("docs/evidence");
});

test("implementation-evidence packets are not a repository category", () => {
  expect(existsSync(join(evidenceRoot, "implementations"))).toBe(false);
});

test("tracked evidence is markdown except the allowlisted ledger", () => {
  const files = walkFiles(evidenceRoot);
  const unexpected = files.filter((path) => {
    const relativePath = relative(evidenceRoot, path);
    if (allowlistedMachineFiles.has(relativePath)) return false;
    const extension = path.slice(path.lastIndexOf("."));
    return !allowedExtensions.has(extension);
  });
  expect(unexpected).toEqual([]);
});
