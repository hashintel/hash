/**
 * scip-python over one package, on the package's own virtual environment
 * when it has one, decoded into documents. A symbol is canonicalised to the
 * module path alone: scip-python names a module by the project that indexed
 * it and by its path from the package root, so the same module has two names
 * when a consumer resolves it through its environment.
 */

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, posix } from "node:path";
import { promisify } from "node:util";

import { sourceRootOf } from "../../shared/scope";
import { decodeScipIndex, scipDefinitionRole } from "./scip-decode";

import type { ArchitecturePackage } from "../../../model";
import type { IndexedDocument } from "../../facts";

const require = createRequire(import.meta.url);
const run = promisify(execFile);

export const scipPythonVersion = (
  require("@sourcegraph/scip-python/package.json") as { version: string }
).version;

const scipPythonEntry = require.resolve("@sourcegraph/scip-python/index.js");

const canonicalSymbol = (symbol: string): string =>
  `py ${symbol
    .replace(/^scip-python python \S+ \S+ /u, "")
    .replace(/^`src\.([^`]+)`/u, "$1")}`;

/** Indexes `pkg` into `outputDirectory` and returns its documents. */
export const indexPythonPackage = async (options: {
  repoRoot: string;
  pkg: ArchitecturePackage;
  outputDirectory: string;
}): Promise<IndexedDocument[]> => {
  const { repoRoot, pkg } = options;
  const packageRoot = join(repoRoot, pkg.path);
  const venvBin = join(packageRoot, ".venv", "bin");
  await mkdir(options.outputDirectory, { recursive: true });
  const output = join(
    options.outputDirectory,
    `${pkg.name.replace(/[^a-z0-9]+/giu, "-")}.scip`,
  );
  await run(
    process.execPath,
    [
      scipPythonEntry,
      "index",
      "--cwd",
      packageRoot,
      "--target-only",
      pkg.sourceDirectory,
      "--project-name",
      pkg.name,
      "--output",
      output,
      "--quiet",
    ],
    {
      maxBuffer: 64 * 1024 * 1024,
      env: existsSync(venvBin)
        ? { ...process.env, PATH: `${venvBin}:${process.env.PATH ?? ""}` }
        : process.env,
    },
  );
  const sourceRoot = sourceRootOf(pkg);
  return decodeScipIndex(await readFile(output)).map((document) => ({
    // Paths come relative to `--target-only`, or to `--cwd` when the
    // package has a single root; both become repo-relative here.
    file: document.relativePath.startsWith(`${pkg.sourceDirectory}/`)
      ? posix.join(pkg.path, document.relativePath)
      : posix.join(sourceRoot, document.relativePath),
    occurrences: document.occurrences
      .filter((occurrence) => !occurrence.symbol.startsWith("local "))
      .map((occurrence) => ({
        symbol: canonicalSymbol(occurrence.symbol),
        definition: (occurrence.symbolRoles & scipDefinitionRole) !== 0,
      })),
  }));
};
