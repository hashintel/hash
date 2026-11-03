/**
 * `paths` for the program: every covered TypeScript package's `exports`
 * mapped back to its source entries, so a reference from one package to
 * another resolves to the defining source file rather than to a built
 * declaration file.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { ArchitecturePackage } from "../../../model";

/** `./dist/hir.js` is `src/hir.ts`, or `src/hir/index.ts` when the flat file does not exist. */
const sourceEntries = (
  repoRoot: string,
  pkg: ArchitecturePackage,
): Record<string, string[]> => {
  const manifest = JSON.parse(
    readFileSync(join(repoRoot, pkg.path, "package.json"), "utf8"),
  ) as { name: string; exports?: Record<string, unknown> };
  const paths: Record<string, string[]> = {};
  for (const [subpath, target] of Object.entries(manifest.exports ?? {})) {
    const conditions = target as Record<string, string> | null;
    const distPath =
      typeof target === "string"
        ? target
        : (conditions?.import ?? conditions?.default ?? null);
    if (distPath === null || !distPath.endsWith(".js")) {
      continue;
    }
    const stem = distPath.replace(/^\.\/dist\//u, "").replace(/\.js$/u, "");
    const resolved = [
      `${stem}.ts`,
      `${stem}.tsx`,
      `${stem}/index.ts`,
      `${stem}/index.tsx`,
    ]
      .map((candidate) =>
        join(repoRoot, pkg.path, pkg.sourceDirectory, candidate),
      )
      .find((candidate) => existsSync(candidate));
    if (resolved !== undefined) {
      const specifier =
        subpath === "." ? manifest.name : `${manifest.name}${subpath.slice(1)}`;
      paths[specifier] = [resolved];
    }
  }
  return paths;
};

export const workspacePaths = (
  repoRoot: string,
  packages: ArchitecturePackage[],
): Record<string, string[]> =>
  Object.assign(
    {},
    ...packages
      .filter((pkg) => pkg.language === "typescript")
      .map((pkg) => sourceEntries(repoRoot, pkg)),
  ) as Record<string, string[]>;
