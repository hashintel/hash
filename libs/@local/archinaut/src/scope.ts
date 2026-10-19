/**
 * What counts as source, and where a package's source lives. Both the scanner
 * and the indexer read these, so they cannot disagree about scope.
 */

import { posix } from "node:path";

import type { ArchitecturePackage } from "./model/types";

/** Extensions treated as architecture source in TypeScript packages. */
export const sourceExtensions = [".ts", ".tsx", ".mts", ".cts"] as const;

const sourceExtensionsByLanguage: Record<
  ArchitecturePackage["language"],
  readonly string[]
> = {
  typescript: sourceExtensions,
  python: [".py"],
};

export const sourceExtensionsFor = (
  pkg: ArchitecturePackage,
): readonly string[] => sourceExtensionsByLanguage[pkg.language];

/** Repo-relative, posix source root for a package. */
export const sourceRootOf = (pkg: ArchitecturePackage): string =>
  posix.join(pkg.path, pkg.sourceDirectory);
