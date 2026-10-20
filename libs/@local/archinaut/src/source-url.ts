/**
 * Which git ref the generated source links point at.
 *
 * `main` 404s for a file the branch adds and shows the pre-change version of
 * one it edits, so the ref comes from the build environment instead.
 */

/** Repository the source links resolve against. */
const REPO_URL = "https://github.com/hashintel/hash";

/** Ref used when the environment names none, such as a local build. */
const DEFAULT_SOURCE_REF = "main";

/**
 * Environment variables carrying a ref, highest precedence first. A commit SHA
 * beats a branch name because the link still resolves once the branch has moved
 * on or been deleted.
 *
 * Mirrored by the `env` list in this package's `turbo.json`: a variable added
 * here and not there is hidden by strict env mode and silently ignored.
 */
const REF_VARIABLES = [
  "PETRINAUT_ARCH_DOCS_SOURCE_REF",
  "VERCEL_GIT_COMMIT_SHA",
  "GITHUB_SHA",
  "VERCEL_GIT_COMMIT_REF",
  "GITHUB_HEAD_REF",
  "GITHUB_REF_NAME",
] as const;

export const resolveSourceRef = (
  env: Record<string, string | undefined>,
): string => {
  for (const variable of REF_VARIABLES) {
    const value = env[variable]?.trim();

    if (value !== undefined && value !== "") {
      return value;
    }
  }

  return DEFAULT_SOURCE_REF;
};

/**
 * Slashes are left literal: they separate path segments in a blob URL, so a
 * `cf/fe-1457-x` branch only resolves with them intact. Everything else is
 * encoded, since `#` or `%` in a ref would otherwise break the URL. Empty and
 * dot-only segments are dropped: git refnames forbid them, so they can only
 * arrive through a mistyped override, where `blob//main/` or a traversing URL
 * would be worse than a merely wrong ref.
 */
const encodeRef = (ref: string): string =>
  ref
    .split("/")
    .filter((segment) => segment !== "" && segment !== "." && segment !== "..")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

/** Base URL for source links, ending in the slash paths are appended to. */
export const resolveSourceUrlPrefix = (
  env: Record<string, string | undefined>,
): string => `${REPO_URL}/blob/${encodeRef(resolveSourceRef(env))}/`;
