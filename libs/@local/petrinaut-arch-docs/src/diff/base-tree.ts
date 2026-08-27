/**
 * Materializes the covered source trees at a base ref, for a diff build.
 *
 * `git archive` extracts only the directories the generator scans rather than
 * checking out the whole monorepo, and the *current* generator then runs over
 * the extracted tree — dependency-cruiser resolves workspace imports through
 * aliases derived from each package's `exports` map, so the tree needs no
 * `node_modules` and no install step.
 *
 * Everything here can fail in a legitimate environment — a shallow CI clone
 * without the base ref, no network to fetch it — so callers treat a throw as
 * "build without the diff", never as a build failure. A throw always cleans
 * the scratch directory up behind itself.
 */

import { execFileSync } from "node:child_process";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface BaseTree {
  /** Absolute root of the extracted tree, laid out repo-relative. */
  root: string;
  ref: string;
  /** The commit the ref resolved to. */
  sha: string;
  dispose: () => Promise<void>;
}

const git = (repoRoot: string, args: string[]): string =>
  execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();

/**
 * Resolves a ref to a commit, fetching it when the local clone lacks it.
 *
 * A CI clone is typically shallow and checked out at the head commit only, so
 * the base branch resolves neither bare nor as `origin/<ref>` — the fetch is
 * the path most CI builds actually take.
 */
const resolveCommit = (repoRoot: string, ref: string): string => {
  for (const candidate of [ref, `origin/${ref}`]) {
    try {
      return git(repoRoot, [
        "rev-parse",
        "--verify",
        "--quiet",
        `${candidate}^{commit}`,
      ]);
    } catch {
      // Try the next form.
    }
  }

  git(repoRoot, ["fetch", "--depth=1", "origin", ref]);
  return git(repoRoot, [
    "rev-parse",
    "--verify",
    "--quiet",
    "FETCH_HEAD^{commit}",
  ]);
};

/**
 * Whether a `git archive` failure means the pathspec matched nothing at the
 * ref — the one failure that is a normal state (a package added since the
 * base) rather than a defect. Anything else must propagate: swallowing it
 * would drop a whole package from the base tree and render every layer in it
 * as `added`, a confidently wrong diff instead of a degraded one.
 */
const isPathspecMismatch = (cause: unknown): boolean =>
  cause instanceof Error &&
  /did not match any files/u.test(
    String((cause as { stderr?: unknown }).stderr ?? ""),
  );

export const materializeBaseTree = async (options: {
  repoRoot: string;
  ref: string;
  /** Repo-relative directories to extract; ones absent at the ref are skipped. */
  paths: string[];
}): Promise<BaseTree> => {
  // Refused rather than escaped: git would parse a leading dash as an option,
  // in `rev-parse`, `fetch` and `archive` alike.
  if (options.ref.startsWith("-")) {
    throw new Error(`\`${options.ref}\` is not a usable ref`);
  }

  const sha = resolveCommit(options.repoRoot, options.ref);
  // Canonicalised because macOS puts the temp directory behind a symlink
  // (`/var` → `/private/var`): dependency-cruiser realpaths what it resolves,
  // and against a symlinked root every resolved file appears to escape the
  // tree, which silently drops every TypeScript edge from the base model.
  const root = await realpath(await mkdtemp(join(tmpdir(), "arch-docs-base-")));

  try {
    const archive = join(root, ".base.tar");
    let extracted = 0;

    for (const path of options.paths) {
      try {
        // Written to a file and extracted in a second step: a pipe would need
        // a shell with `pipefail` for `git archive`'s failure to be visible.
        execFileSync(
          "git",
          ["archive", "--format=tar", "-o", archive, sha, "--", path],
          { cwd: options.repoRoot, stdio: ["ignore", "ignore", "pipe"] },
        );
      } catch (cause) {
        if (isPathspecMismatch(cause)) {
          continue;
        }
        throw cause;
      }
      execFileSync("tar", ["-xf", archive, "-C", root], {
        stdio: ["ignore", "ignore", "pipe"],
      });
      extracted += 1;
    }
    await rm(archive, { force: true });

    if (extracted === 0) {
      throw new Error(
        `none of the covered directories exist at \`${options.ref}\``,
      );
    }
  } catch (cause) {
    await rm(root, { recursive: true, force: true });
    throw cause;
  }

  return {
    root,
    ref: options.ref,
    sha,
    dispose: () => rm(root, { recursive: true, force: true }),
  };
};
