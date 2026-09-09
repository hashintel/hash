import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

import { expect, test } from "vitest";

import { CONTEXT_ROOT, HASH_ROOT } from "./workspace";

const evidenceRoot = join(CONTEXT_ROOT, "docs/evidence");
const allowlistedMachineFiles = new Set(["accounting/usage-ledger.json"]);
const allowedExtensions = new Set([".md", ".txt"]);

const evidencePath = relative(HASH_ROOT, evidenceRoot);
const trackedEvidenceFiles = (repositoryRoot: string): string[] =>
  execFileSync("git", ["ls-files", "-z", "--", evidencePath], {
    cwd: repositoryRoot,
    encoding: "utf8",
  })
    .split("\0")
    .filter(Boolean)
    .map((path) => relative(evidencePath, path));

const files = trackedEvidenceFiles(HASH_ROOT);

test("the evidence inventory ignores local files but includes force-added artifacts", () => {
  const repositoryRoot = mkdtempSync(join(tmpdir(), "brunch-evidence-index-"));
  try {
    const directory = join(repositoryRoot, evidencePath);
    mkdirSync(join(directory, "implementations"), { recursive: true });
    writeFileSync(join(directory, ".gitignore"), "*.log\n");
    writeFileSync(join(directory, "README.md"), "# Retained conclusion\n");
    writeFileSync(join(directory, "local.md"), "Untracked notes\n");
    writeFileSync(
      join(directory, "implementations/local.log"),
      "Ignored output\n",
    );
    execFileSync("git", ["init", "--quiet"], { cwd: repositoryRoot });
    execFileSync("git", ["add", "--", `${evidencePath}/README.md`], {
      cwd: repositoryRoot,
    });
    expect(trackedEvidenceFiles(repositoryRoot)).toEqual(["README.md"]);

    execFileSync(
      "git",
      ["add", "--force", "--", `${evidencePath}/implementations/local.log`],
      {
        cwd: repositoryRoot,
      },
    );
    expect(trackedEvidenceFiles(repositoryRoot)).toEqual([
      "README.md",
      "implementations/local.log",
    ]);
  } finally {
    rmSync(repositoryRoot, { recursive: true, force: true });
  }
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
  expect(files.filter((path) => path.startsWith("implementations/"))).toEqual(
    [],
  );
});

test("tracked evidence is text except the allowlisted ledger", () => {
  const unexpected = files.filter((path) => {
    if (path === ".gitignore" || path.endsWith("/.gitignore")) return false;
    if (allowlistedMachineFiles.has(path)) return false;
    const extension = path.slice(path.lastIndexOf("."));
    return !allowedExtensions.has(extension);
  });
  expect(unexpected).toEqual([]);
});
