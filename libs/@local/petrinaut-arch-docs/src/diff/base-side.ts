/**
 * Obtains the base side of a diff build, and seeds the cache for future ones.
 *
 * One entry point per direction: `obtainBaseSide` serves a diff build — from
 * the cache when the base commit and generator match a stored entry, else by
 * materializing the base tree and building it, writing the result back — and
 * `seedBaseCacheWithSelf` stores a finished build's own side so a later build
 * can use this commit as its base without rebuilding it.
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { config } from "../../architecture.config";
import { buildBundle, type BuiltBundle } from "../build";
import {
  generatorInputsHash,
  readCachedBaseSide,
  writeCachedBaseSide,
} from "./base-cache";
import {
  materializeBaseTree,
  remoteRepoUrl,
  resolveBaseSha,
} from "./base-tree";
import { diffSideOfBundle, type DiffSide } from "./bundle-diff";

/** Repo-relative root of this generator package. */
const GENERATOR_PACKAGE = "libs/@local/petrinaut-arch-docs";

/**
 * Repo-relative directories whose content the generator reads: the covered
 * packages, plus this package for the authored content and the
 * dependency-cruiser tsconfig.
 */
export const coveredPaths = (): string[] => [
  ...new Set([...config.packages.map((pkg) => pkg.path), GENERATOR_PACKAGE]),
];

/** Where cache entries live; `node_modules/.cache` is what CI persists. */
const baseCacheDir = (repoRoot: string): string =>
  join(repoRoot, "node_modules/.cache/petrinaut-arch-docs");

const inputsHashFor = (repoRoot: string, includeDiagrams: boolean): string =>
  generatorInputsHash({
    packageRoot: join(repoRoot, GENERATOR_PACKAGE),
    includeDiagrams,
  });

export interface ObtainedBaseSide {
  side: DiffSide;
  sha: string;
  fromCache: boolean;
  /** The remote URL the tree came from, when the local clone could not supply it. */
  fetchedFrom?: string;
}

/**
 * The base side for a ref. Throws when the ref cannot be resolved or its tree
 * cannot be built — the caller degrades to an unhighlighted bundle.
 */
export const obtainBaseSide = async (options: {
  repoRoot: string;
  ref: string;
  includeDiagrams: boolean;
}): Promise<ObtainedBaseSide> => {
  const { repoRoot, ref, includeDiagrams } = options;
  const cacheDir = baseCacheDir(repoRoot);
  const inputsHash = inputsHashFor(repoRoot, includeDiagrams);

  // The base side is deterministic in (base commit, generator inputs), so a
  // build against an unmoved base reuses the stored one instead of extracting
  // and building the base tree again.
  const knownSha = resolveBaseSha(repoRoot, ref, remoteRepoUrl(process.env));
  if (knownSha !== null) {
    const cached = readCachedBaseSide({ cacheDir, sha: knownSha, inputsHash });
    if (cached !== null) {
      return { side: cached, sha: knownSha, fromCache: true };
    }
  }

  const tree = await materializeBaseTree({
    repoRoot,
    ref,
    paths: coveredPaths(),
  });

  try {
    const bundle = await buildBundle({
      repoRoot: tree.root,
      includeDiagrams,
      overrides: {
        // A package added since the base ref has no directory to scan there.
        packages: config.packages.filter((pkg) =>
          existsSync(join(tree.root, pkg.path)),
        ),
      },
    });
    const side = diffSideOfBundle(bundle, config.sourceUrlPrefix);
    writeCachedBaseSide({ cacheDir, sha: tree.sha, inputsHash, side });

    return {
      side,
      sha: tree.sha,
      fromCache: false,
      ...(tree.fetchedFrom === undefined
        ? {}
        : { fetchedFrom: tree.fetchedFrom }),
    };
  } finally {
    await tree.dispose().catch(() => {
      // A failed cleanup must not reject out of the build the diff decorates.
    });
  }
};

/**
 * Stores a finished build's own side as a future diff base.
 *
 * This is what shares the cache across branches: the CI cache is restored per
 * branch with a fallback to the production deployment, so the entry a `main`
 * build writes here is what every PR targeting `main` finds on its first
 * build. It also means only protected-branch builds ever write the entries
 * other branches read.
 *
 * Skipped when the checkout's commit is unknown, and locally when the covered
 * sources have uncommitted changes — an entry must describe its commit, not a
 * dirty tree.
 */
export const seedBaseCacheWithSelf = (options: {
  repoRoot: string;
  bundle: BuiltBundle;
  includeDiagrams: boolean;
}): void => {
  const { repoRoot } = options;
  let sha = process.env.VERCEL_GIT_COMMIT_SHA ?? "";

  if (!/^[0-9a-f]{40}$/u.test(sha)) {
    try {
      sha = execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: repoRoot,
        encoding: "utf8",
      }).trim();
      const dirty = execFileSync(
        "git",
        ["status", "--porcelain", "--", ...coveredPaths()],
        { cwd: repoRoot, encoding: "utf8" },
      ).trim();
      if (!/^[0-9a-f]{40}$/u.test(sha) || dirty !== "") {
        return;
      }
    } catch {
      return;
    }
  }

  writeCachedBaseSide({
    cacheDir: baseCacheDir(repoRoot),
    sha,
    inputsHash: inputsHashFor(repoRoot, options.includeDiagrams),
    side: diffSideOfBundle(options.bundle, config.sourceUrlPrefix),
  });
};
