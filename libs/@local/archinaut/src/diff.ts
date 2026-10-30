/**
 * Highlighting what a build changes against a base ref: the base side is the
 * same generator run over the base tree, cached by (generator inputs, base
 * commit) so a push while iterating on a branch reuses it.
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { symlink } from "node:fs/promises";
import { dirname, isAbsolute, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { emitBundle, type Bundle } from "./bundle";
import {
  generatorInputsHash,
  readCachedBaseSide,
  writeCachedBaseSide,
} from "./diff/base-cache";
import {
  materializeBaseTree,
  remoteRepoUrl,
  resolveBaseSha,
} from "./diff/base-tree";
import { applyBundleDiff, diffSideOfBundle } from "./diff/bundle-diff";
import { runPipeline } from "./pipeline";
import { countErrors } from "./shared/diagnostics";

import type { ArchinautConfig } from "./config";
import type { ArchitectureModel } from "./model";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));

const baseCacheDir = (config: ArchinautConfig): string =>
  join(
    isAbsolute(config.cacheDirectory)
      ? config.cacheDirectory
      : join(config.root, config.cacheDirectory),
    "base",
  );

/** Repo-relative directories whose content the generator reads. */
const coveredPaths = (config: ArchinautConfig): string[] => [
  ...new Set([
    ...config.packages.map((pkg) => pkg.path),
    config.contentDirectory,
    relative(config.root, dirname(config.configFile)),
  ]),
];

const inputsHash = (
  config: ArchinautConfig,
  includeDiagrams: boolean,
): string =>
  generatorInputsHash({
    packageRoot,
    configFile: config.configFile,
    includeDiagrams,
  });

/**
 * Points the base tree at the head's installed dependencies. The providers
 * resolve types through `node_modules`, and a base indexed without them sees
 * fewer symbols than the head, which would read as changes nobody made.
 */
const linkDependencies = async (
  config: ArchinautConfig,
  treeRoot: string,
): Promise<void> => {
  for (const directory of ["", ...config.packages.map((pkg) => pkg.path)]) {
    const source = join(config.root, directory, "node_modules");
    const target = join(treeRoot, directory, "node_modules");
    if (
      existsSync(source) &&
      !existsSync(target) &&
      existsSync(dirname(target))
    ) {
      await symlink(source, target, "dir");
    }
  }
};

export interface DiffResult {
  bundle: Bundle;
  baseSha: string;
  fromCache: boolean;
  /** The remote URL the base tree came from, when the local clone could not supply it. */
  fetchedFrom: string | null;
}

/**
 * The head bundle with changes against `ref` marked. Throws when the ref
 * cannot be resolved or its tree cannot be built; the caller then keeps the
 * plain bundle, since the diff decorates a build and never gates it.
 */
export const diffAgainstBase = async (options: {
  config: ArchinautConfig;
  model: ArchitectureModel;
  bundle: Bundle;
  ref: string;
  includeDiagrams: boolean;
}): Promise<DiffResult> => {
  const { config, ref, includeDiagrams } = options;
  const cacheDir = baseCacheDir(config);
  const hash = inputsHash(config, includeDiagrams);
  const apply = (
    side: Parameters<typeof applyBundleDiff>[1],
    baseSha: string,
  ): Bundle =>
    applyBundleDiff({ model: options.model, bundle: options.bundle }, side, {
      baseRef: ref,
      baseSha,
      sourceUrlPrefix: config.sourceUrlPrefix,
    });

  const knownSha = resolveBaseSha(config.root, ref, remoteRepoUrl(process.env));
  if (knownSha !== null) {
    const cached = readCachedBaseSide({
      cacheDir,
      sha: knownSha,
      inputsHash: hash,
    });
    if (cached !== null) {
      return {
        bundle: apply(cached, knownSha),
        baseSha: knownSha,
        fromCache: true,
        fetchedFrom: null,
      };
    }
  }

  const tree = await materializeBaseTree({
    repoRoot: config.root,
    ref,
    paths: coveredPaths(config),
  });
  try {
    await linkDependencies(config, tree.root);
    const baseConfig: ArchinautConfig = {
      ...config,
      root: tree.root,
      // A package added since the base ref has no directory to scan there.
      packages: config.packages.filter((pkg) =>
        existsSync(join(tree.root, pkg.path)),
      ),
    };
    const pipeline = await runPipeline(baseConfig);
    if (countErrors(pipeline.diagnostics) > 0) {
      throw new Error(
        `the base tree at ${ref} does not build: ${pipeline.diagnostics[0]?.message ?? "unknown error"}`,
      );
    }
    const bundle = await emitBundle({
      model: pipeline.model,
      repoRoot: tree.root,
      contentDirectory: config.contentDirectory,
      sourceUrlPrefix: config.sourceUrlPrefix,
      includeDiagrams,
    });
    const side = diffSideOfBundle(
      pipeline.model,
      bundle,
      config.sourceUrlPrefix,
    );
    writeCachedBaseSide({ cacheDir, sha: tree.sha, inputsHash: hash, side });
    return {
      bundle: apply(side, tree.sha),
      baseSha: tree.sha,
      fromCache: false,
      fetchedFrom: tree.fetchedFrom ?? null,
    };
  } finally {
    await tree.dispose().catch(() => {
      // A failed cleanup must not reject out of the build the diff decorates.
    });
  }
};

/**
 * Stores a clean build's own side as a future base, so a branch whose base
 * is this commit never rebuilds it. Skipped when the commit is unknown or
 * the covered sources are dirty: an entry must describe its commit.
 */
export const seedBaseCache = (options: {
  config: ArchinautConfig;
  model: ArchitectureModel;
  bundle: Bundle;
  includeDiagrams: boolean;
}): void => {
  const { config } = options;
  try {
    let sha = process.env.VERCEL_GIT_COMMIT_SHA ?? "";
    if (!/^[0-9a-f]{40}$/u.test(sha)) {
      sha = execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: config.root,
        encoding: "utf8",
      }).trim();
      const dirty = execFileSync(
        "git",
        ["status", "--porcelain", "--", ...coveredPaths(config)],
        {
          cwd: config.root,
          encoding: "utf8",
        },
      ).trim();
      if (!/^[0-9a-f]{40}$/u.test(sha) || dirty !== "") {
        return;
      }
    }
    writeCachedBaseSide({
      cacheDir: baseCacheDir(config),
      sha,
      inputsHash: inputsHash(config, options.includeDiagrams),
      side: diffSideOfBundle(
        options.model,
        options.bundle,
        config.sourceUrlPrefix,
      ),
    });
  } catch {
    // Seeding is a bonus; no failure in it may fail a build that passed.
  }
};
