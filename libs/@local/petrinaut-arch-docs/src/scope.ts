/**
 * What counts as source, and which files are in scope.
 *
 * The extractor and the graph builder each walk the packages, and they have to
 * agree on the answer. When they disagreed, the graph silently lost edges: the
 * cruise root was a hardcoded `src` while the extractor honoured
 * `sourceDirectory`, and `.mts` files were assigned to layers by one and left
 * unresolvable by the other. Both are read from here now, so a discrepancy has
 * to be introduced deliberately rather than by editing one module.
 */

import { posix } from "node:path";

import type { ArchitecturePackage } from "./model";

/**
 * Extensions treated as architecture source in TypeScript packages.
 *
 * `.js` variants are absent on purpose: these packages are TypeScript, and a
 * committed `.js` file under `src` would be build output that no layer should
 * claim. The graph builder reads this list directly — it only ever receives
 * TypeScript packages.
 */
export const sourceExtensions = [".ts", ".tsx", ".mts", ".cts"] as const;

// Keyed by language so adding a member to the config's language enum fails to
// compile here instead of silently scanning the new package as TypeScript.
const sourceExtensionsByLanguage: Record<
  ArchitecturePackage["language"],
  readonly string[]
> = {
  typescript: sourceExtensions,
  python: [".py"],
};

/** The source extensions for one package, by its declared language. */
export const sourceExtensionsFor = (
  pkg: ArchitecturePackage,
): readonly string[] => sourceExtensionsByLanguage[pkg.language];

/** Repo-relative, posix source root for a package. */
export const sourceRootOf = (pkg: ArchitecturePackage): string =>
  posix.join(pkg.path, pkg.sourceDirectory);

const escapeForRegExp = (text: string): string =>
  text.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");

/**
 * Anchored pattern matching every in-scope source root.
 *
 * Passed to dependency-cruiser as `includeOnly`, so the graph never reaches
 * outside the packages the model covers.
 */
export const sourceRootPattern = (packages: ArchitecturePackage[]): string =>
  `^(?:${packages.map((pkg) => escapeForRegExp(sourceRootOf(pkg))).join("|")})/`;

/**
 * Everything both stages skip, as one pattern.
 *
 * The extractor skips ignored directories during its walk and ignored files
 * afterwards. dependency-cruiser needs the same two facts as a single regex, or
 * it reports modules the extractor never considered and every one of them looks
 * like a coverage gap.
 */
export const exclusionPattern = (options: {
  ignoredDirectories: string[];
  ignoredFilePattern: RegExp;
}): string => {
  const directories = options.ignoredDirectories.map(escapeForRegExp).join("|");

  return `(?:/(?:${directories})/)|(?:${options.ignoredFilePattern.source})`;
};
