/**
 * Prints the ref a preview build should highlight changes against.
 *
 * This is the policy half of the diff feature: *which* ref to compare with is
 * a deployment question, so it lives here in the CI wrapper, while turning a
 * ref into a comparable tree is the generator's job (`--diff-base`).
 *
 * For a pull-request deployment the base is the PR's target branch, so a
 * stacked PR shows only its own delta rather than the whole stack's diff
 * against `main`. Vercel does not expose the target branch, so it is read
 * from the GitHub API — anonymously, which works because the repository is
 * public. Anything short of a definite answer falls back to `main`, and a
 * non-preview build prints nothing at all.
 */

/** @param {string} ref */
const out = (ref) => process.stdout.write(`${ref}\n`);

const preset = process.env.PETRINAUT_ARCH_DOCS_DIFF_BASE?.trim();
if (preset) {
  out(preset);
  process.exit(0);
}

if (process.env.VERCEL_ENV !== "preview") {
  process.exit(0);
}

const {
  VERCEL_GIT_REPO_OWNER,
  VERCEL_GIT_REPO_SLUG,
  VERCEL_GIT_PULL_REQUEST_ID,
} = process.env;

const wellFormed = /^[\w.-]+$/u;
const prNumber = /^\d+$/u.test(VERCEL_GIT_PULL_REQUEST_ID ?? "")
  ? VERCEL_GIT_PULL_REQUEST_ID
  : null;

if (
  prNumber === null ||
  !wellFormed.test(VERCEL_GIT_REPO_OWNER ?? "") ||
  !wellFormed.test(VERCEL_GIT_REPO_SLUG ?? "")
) {
  // A preview without a PR (e.g. a branch deployment) has no target branch.
  out("main");
  process.exit(0);
}

try {
  const response = await fetch(
    `https://api.github.com/repos/${VERCEL_GIT_REPO_OWNER}/${VERCEL_GIT_REPO_SLUG}/pulls/${prNumber}`,
    {
      headers: { accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(10_000),
    },
  );
  const baseRef = response.ok ? (await response.json()).base?.ref : undefined;
  // Branch-name shaped only: the value becomes an environment variable that
  // ends up on a git command line, so anything surprising falls back.
  out(
    typeof baseRef === "string" && /^[\w][\w.@+/-]*$/u.test(baseRef)
      ? baseRef
      : "main",
  );
} catch {
  // Rate limiting or a network failure: `main` still gives a useful diff.
  out("main");
}
