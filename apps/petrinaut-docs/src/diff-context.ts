/**
 * What a diff build is comparing, for the header badges: the deployed side
 * and the base side, each as a PR number when one exists (the branch name
 * otherwise) plus the commit built. Null on a plain build, which is what
 * hides the badges.
 *
 * Resolved once, from `astro.config.mjs`, and injected into the pages as a
 * compile-time constant — a component resolving it itself would run after
 * bundling, where file-relative paths to the bundle no longer hold.
 *
 * This is deployment chrome, so it lives in the site rather than the bundle:
 * the bundle records refs and commits (`manifest.diff`), and mapping those to
 * pull requests is GitHub knowledge the generator deliberately does not have.
 */

import { execSync } from "node:child_process";

import type { BundleManifest } from "@local/petrinaut-arch-docs";

export interface DiffChip {
  /** `#1234` when a PR exists, the branch name otherwise. */
  label: string;
  /** Short commit id, when known. */
  sha: string | null;
  href: string;
  title: string;
}

export interface DiffCompareContext {
  head: DiffChip;
  base: DiffChip;
}

const wellFormed = /^[\w.-]+$/u;

const gitFallback = (args: string): string | null => {
  try {
    return execSync(`git ${args}`, { encoding: "utf8" }).trim() || null;
  } catch {
    return null;
  }
};

/** The one open PR whose head is `branch`, or null (anonymous API, best effort). */
const openPrNumberFor = async (
  owner: string,
  slug: string,
  branch: string,
): Promise<string | null> => {
  try {
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${slug}/pulls?head=${owner}:${encodeURIComponent(branch)}&state=open`,
      {
        headers: { accept: "application/vnd.github+json" },
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!response.ok) {
      return null;
    }
    const pulls = (await response.json()) as { number?: number }[];
    const number = Array.isArray(pulls) ? pulls[0]?.number : undefined;
    return typeof number === "number" ? String(number) : null;
  } catch {
    return null;
  }
};

const chip = (options: {
  repoUrl: string;
  prNumber: string | null;
  branch: string | null;
  sha: string | null;
  role: string;
}): DiffChip => {
  const where =
    options.prNumber !== null
      ? `PR #${options.prNumber}`
      : (options.branch ?? "an unknown ref");
  const at = options.sha === null ? "" : ` at ${options.sha.slice(0, 7)}`;

  return {
    label:
      options.prNumber !== null
        ? `#${options.prNumber}`
        : (options.branch ?? "?"),
    sha: options.sha?.slice(0, 7) ?? null,
    href:
      options.prNumber !== null
        ? `${options.repoUrl}/pull/${options.prNumber}`
        : `${options.repoUrl}/tree/${options.branch ?? ""}`,
    title: `${options.role}: ${where}${at}`,
  };
};

export const resolveDiffCompareContext = async (
  manifest: BundleManifest,
): Promise<DiffCompareContext | null> => {
  const diff = manifest.diff;
  if (diff === undefined) {
    return null;
  }

  const env = process.env;
  const owner = wellFormed.test(env.VERCEL_GIT_REPO_OWNER ?? "")
    ? env.VERCEL_GIT_REPO_OWNER!
    : "hashintel";
  const slug = wellFormed.test(env.VERCEL_GIT_REPO_SLUG ?? "")
    ? env.VERCEL_GIT_REPO_SLUG!
    : "hash";
  const repoUrl = `https://github.com/${owner}/${slug}`;

  const headBranch =
    env.VERCEL_GIT_COMMIT_REF ?? gitFallback("rev-parse --abbrev-ref HEAD");
  const headSha = env.VERCEL_GIT_COMMIT_SHA ?? gitFallback("rev-parse HEAD");
  const headPr = /^\d+$/u.test(env.VERCEL_GIT_PULL_REQUEST_ID ?? "")
    ? env.VERCEL_GIT_PULL_REQUEST_ID!
    : null;

  return {
    head: chip({
      repoUrl,
      prNumber: headPr,
      branch: headBranch,
      sha: headSha,
      role: "This preview",
    }),
    base: chip({
      repoUrl,
      prNumber: await openPrNumberFor(owner, slug, diff.baseRef),
      branch: diff.baseRef,
      sha: diff.baseSha,
      role: "Compared against",
    }),
  };
};
