/**
 * Materializes the covered source trees at a base ref, for a diff build.
 *
 * Two strategies, tried in order:
 *
 * 1. The local clone: resolve the ref and `git archive` the covered
 *    directories out of it. This is what a developer machine takes.
 * 2. An anonymous fetch from the public repository: a CI build often cannot
 *    resolve the ref locally — Vercel provides a snapshot of the sources with
 *    no usable clone at all — so the ref is fetched into a scratch repository
 *    instead: blobless (`--filter=blob:none`) with a sparse checkout of only
 *    the covered directories, which keeps the transfer to the trees plus the
 *    blobs the generator actually scans.
 *
 * Either way the extracted tree needs no `node_modules` and no install step:
 * dependency-cruiser resolves workspace imports through aliases derived from
 * each package's `exports` map.
 *
 * Everything here can fail in a legitimate environment — no network, a
 * repository that is not public — so callers treat a throw as "build without
 * the diff", never as a build failure. A throw always cleans the scratch
 * directory up behind itself.
 */

import { execFileSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface BaseTree {
  /** Absolute root of the extracted tree, laid out repo-relative. */
  root: string;
  ref: string;
  /** The commit the ref resolved to. */
  sha: string;
  /** The remote URL the ref was fetched from, when the local clone could not supply it. */
  fetchedFrom?: string;
  dispose: () => Promise<void>;
}

const git = (cwd: string, args: string[]): string =>
  execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();

/**
 * Whether a ref can safely appear on a git command line: a leading dash
 * parses as an option, and whitespace or control characters split arguments.
 * Checked at every entry point that takes a ref, so no call order lets an
 * unvalidated ref reach a subprocess.
 */
const isUsableRef = (ref: string): boolean =>
  ref !== "" && !ref.startsWith("-") && !/[\s\u0000-\u001f]/u.test(ref);

const isCommitSha = (text: string): boolean => /^[0-9a-f]{40}$/u.test(text);

/** The ref's commit per the local clone alone — no fetch, no side effects. */
const localShaOf = (repoRoot: string, ref: string): string | null => {
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
  return null;
};

/**
 * Resolves a ref to its commit without materializing anything, so a cache can
 * be consulted before any tree is fetched or extracted. Null when only a full
 * materialization could resolve it (say, `main~3` on a clone-less build).
 *
 * Tags are peeled: the `^{}` line names the commit an annotated tag points
 * at, which is also what a later materialization resolves — reporting the tag
 * object instead would key the cache under a sha no other step produces.
 */
export const resolveBaseSha = (
  repoRoot: string,
  ref: string,
  url: string,
): string | null => {
  if (!isUsableRef(ref)) {
    return null;
  }
  if (isCommitSha(ref)) {
    return ref;
  }

  const local = localShaOf(repoRoot, ref);
  if (local !== null) {
    return local;
  }

  try {
    const lines = git(repoRoot, [
      "ls-remote",
      url,
      `refs/heads/${ref}`,
      `refs/tags/${ref}`,
      `refs/tags/${ref}^{}`,
    ])
      .split("\n")
      .filter((line) => line !== "")
      .map((line) => line.split(/\s+/u));

    const shaOf = (name: string): string | undefined =>
      lines.find(([, refName]) => refName === name)?.[0];

    const sha =
      shaOf(`refs/heads/${ref}`) ??
      shaOf(`refs/tags/${ref}^{}`) ??
      shaOf(`refs/tags/${ref}`) ??
      "";
    return isCommitSha(sha) ? sha : null;
  } catch {
    return null;
  }
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

/** Extracts the covered directories from the local clone into `root`. */
const extractFromLocalClone = (options: {
  repoRoot: string;
  sha: string;
  paths: string[];
  root: string;
}): void => {
  const archive = join(options.root, ".base.tar");
  let extracted = 0;

  for (const path of options.paths) {
    try {
      // Written to a file and extracted in a second step: a pipe would need
      // a shell with `pipefail` for `git archive`'s failure to be visible.
      execFileSync(
        "git",
        ["archive", "--format=tar", "-o", archive, options.sha, "--", path],
        { cwd: options.repoRoot, stdio: ["ignore", "ignore", "pipe"] },
      );
    } catch (cause) {
      if (isPathspecMismatch(cause)) {
        continue;
      }
      throw cause;
    }
    execFileSync("tar", ["-xf", archive, "-C", options.root], {
      stdio: ["ignore", "ignore", "pipe"],
    });
    extracted += 1;
  }
  rmSync(archive, { force: true });

  if (extracted === 0) {
    throw new Error("none of the covered directories exist at the base ref");
  }
};

/**
 * The repository to fetch the base ref from when the local clone cannot
 * supply it. Vercel names the repository being built; outside Vercel the
 * fallback is the same repository `source-url.ts` already assumes for source
 * links. The values are validated because they end up on a git command line.
 */
export const remoteRepoUrl = (env: NodeJS.ProcessEnv): string => {
  const owner = env.VERCEL_GIT_REPO_OWNER;
  const slug = env.VERCEL_GIT_REPO_SLUG;
  const wellFormed = /^[\w.-]+$/u;

  return owner !== undefined &&
    slug !== undefined &&
    wellFormed.test(owner) &&
    wellFormed.test(slug)
    ? `https://github.com/${owner}/${slug}`
    : "https://github.com/hashintel/hash";
};

/**
 * Fetches the ref anonymously into a scratch repository at `root` and
 * materializes the covered directories with a sparse checkout. Returns the
 * commit it resolved to. Anonymous access works because the repository is
 * public; on a private one the fetch fails and the caller degrades.
 */
const fetchSparseTree = (options: {
  url: string;
  ref: string;
  paths: string[];
  root: string;
}): string => {
  const { root } = options;

  git(root, ["init", "--quiet"]);
  git(root, ["remote", "add", "origin", options.url]);
  git(root, [
    "fetch",
    "--quiet",
    "--depth=1",
    "--no-tags",
    "--filter=blob:none",
    "origin",
    options.ref,
  ]);
  const sha = git(root, [
    "rev-parse",
    "--verify",
    "--quiet",
    "FETCH_HEAD^{commit}",
  ]);

  // Sparse patterns are set before the checkout so only the covered
  // directories materialize — the checkout is also what batch-fetches their
  // blobs from the promisor remote.
  git(root, ["sparse-checkout", "set", ...options.paths]);
  git(root, ["-c", "advice.detachedHead=false", "checkout", "--quiet", sha]);

  if (!options.paths.some((path) => existsSync(join(root, path)))) {
    throw new Error("none of the covered directories exist at the base ref");
  }

  return sha;
};

export const materializeBaseTree = async (options: {
  repoRoot: string;
  ref: string;
  /** Repo-relative directories to extract; ones absent at the ref are skipped. */
  paths: string[];
}): Promise<BaseTree> => {
  if (!isUsableRef(options.ref)) {
    throw new Error(`\`${options.ref}\` is not a usable ref`);
  }

  // Canonicalised because macOS puts the temp directory behind a symlink
  // (`/var` → `/private/var`): dependency-cruiser realpaths what it resolves,
  // and against a symlinked root every resolved file appears to escape the
  // tree, which silently drops every TypeScript edge from the base model.
  const root = await realpath(await mkdtemp(join(tmpdir(), "arch-docs-base-")));

  try {
    const localSha = localShaOf(options.repoRoot, options.ref);

    if (localSha !== null) {
      extractFromLocalClone({
        repoRoot: options.repoRoot,
        sha: localSha,
        paths: options.paths,
        root,
      });
      return {
        root,
        ref: options.ref,
        sha: localSha,
        dispose: () => rm(root, { recursive: true, force: true }),
      };
    }

    const url = remoteRepoUrl(process.env);
    const sha = fetchSparseTree({
      url,
      ref: options.ref,
      paths: options.paths,
      root,
    });
    return {
      root,
      ref: options.ref,
      sha,
      fetchedFrom: url,
      dispose: () => rm(root, { recursive: true, force: true }),
    };
  } catch (cause) {
    await rm(root, { recursive: true, force: true });
    throw cause;
  }
};
