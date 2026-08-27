/**
 * A best-effort cache of built base sides, so repeated diff builds against an
 * unmoved base (every push while iterating on a PR) skip extracting and
 * building the base tree entirely.
 *
 * Entries are keyed — in the file name — by a hash of everything that shapes
 * the generator's output (its sources, config, cruiser tsconfig, and pinned
 * dependencies) followed by the base commit. The generator hash leads so a
 * generator change misses cleanly, and so builds running different generator
 * versions against one base coexist instead of overwriting a shared slot.
 * Nothing in the key names the commit being built: any later commit reuses
 * the entry while its base and the generator stand still.
 *
 * The cache lives under `node_modules/.cache`, which CI providers persist
 * between builds of the same project; when it is absent or unreadable the
 * build proceeds as if it did not exist. Cached pages are compiled as MDX by
 * the consuming site, so an entry is trusted exactly as far as the build
 * that wrote it — acceptable because only this project's own builds write
 * here, and they can already run arbitrary code. Widening the cache's scope
 * (say, to a shared remote cache) would change that analysis; do not.
 */

import { createHash } from "node:crypto";
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { join, relative } from "node:path";

import type { DiffSide } from "./bundle-diff";

const CACHE_VERSION = 1;

/**
 * Entries beyond this many are pruned, least recently used first — a hit
 * refreshes an entry's timestamp, so the shared base entry every push reuses
 * outlives the one-shot seeds written beside it. Entries run ~300 KB, so the
 * cap is about legibility of the directory, not size.
 */
const MAX_ENTRIES = 16;

interface CachedBaseSide extends DiffSide {
  version: number;
  sha: string;
  inputsHash: string;
}

/** Files under the generator package whose content shapes its output. */
const inputFiles = (packageRoot: string): string[] => {
  const files = [
    "architecture.config.ts",
    "dependency-cruiser.tsconfig.json",
    // Dependency versions are exact pins, so this captures them too.
    "package.json",
  ].map((file) => join(packageRoot, file));

  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(path);
      } else if (entry.isFile() && !/\.test\.[cm]?tsx?$/u.test(entry.name)) {
        files.push(path);
      }
    }
  };
  walk(join(packageRoot, "src"));

  return files.sort();
};

/**
 * One hash over the generator's own inputs plus the build flags that change
 * what pages contain. Two builds with equal hashes produce byte-identical
 * base sides for the same base commit.
 */
export const generatorInputsHash = (options: {
  /** Absolute root of the generator package. */
  packageRoot: string;
  includeDiagrams: boolean;
}): string => {
  const hash = createHash("sha256");
  hash.update(`v${CACHE_VERSION};diagrams:${options.includeDiagrams};`);
  for (const file of inputFiles(options.packageRoot)) {
    // Package-relative, so two checkouts of the same content share a key —
    // hashing the absolute path would quietly defeat a relocated cache.
    hash.update(relative(options.packageRoot, file));
    hash.update("\0");
    hash.update(readFileSync(file));
    hash.update("\0");
  }
  return hash.digest("hex");
};

const entryPath = (options: {
  cacheDir: string;
  sha: string;
  inputsHash: string;
}): string =>
  join(
    options.cacheDir,
    `base-${options.inputsHash.slice(0, 16)}-${options.sha}.json`,
  );

/** The cached base side for a commit, or null on any kind of miss. */
export const readCachedBaseSide = (options: {
  cacheDir: string;
  sha: string;
  inputsHash: string;
}): DiffSide | null => {
  try {
    const entry = JSON.parse(
      readFileSync(entryPath(options), "utf8"),
    ) as CachedBaseSide;

    if (
      entry.version !== CACHE_VERSION ||
      entry.sha !== options.sha ||
      entry.inputsHash !== options.inputsHash
    ) {
      return null;
    }

    try {
      // A hit refreshes the timestamp the prune orders by, so the entry every
      // push reuses is the last to go rather than — being the oldest write —
      // the first.
      const now = new Date();
      utimesSync(entryPath(options), now, now);
    } catch {
      // A hit that cannot be touched is still a hit.
    }

    return {
      layers: entry.layers,
      pages: entry.pages,
      sourceUrlPrefix: entry.sourceUrlPrefix,
    };
  } catch {
    return null;
  }
};

/** Stores a built base side; failures are swallowed — the cache is a bonus. */
export const writeCachedBaseSide = (options: {
  cacheDir: string;
  sha: string;
  inputsHash: string;
  side: DiffSide;
}): void => {
  try {
    mkdirSync(options.cacheDir, { recursive: true });

    const entry: CachedBaseSide = {
      version: CACHE_VERSION,
      sha: options.sha,
      inputsHash: options.inputsHash,
      ...options.side,
    };
    writeFileSync(entryPath(options), JSON.stringify(entry), "utf8");

    const entries = readdirSync(options.cacheDir)
      .filter((name) => /^base-[0-9a-f]{16}-[0-9a-f]{40}\.json$/u.test(name))
      .map((name) => ({
        name,
        mtime: statSync(join(options.cacheDir, name)).mtimeMs,
      }))
      .sort((left, right) => right.mtime - left.mtime);

    for (const stale of entries.slice(MAX_ENTRIES)) {
      rmSync(join(options.cacheDir, stale.name), { force: true });
    }
  } catch {
    // Nothing depends on the cache being writable.
  }
};
