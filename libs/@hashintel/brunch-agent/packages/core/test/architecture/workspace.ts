/**
 * Workspace introspection for the boundary tests.
 *
 * The point of reading the tree rather than listing packages by hand is that a
 * package added later is governed by the same invariants without anyone
 * remembering to opt it in. Two rules keep that promise honest:
 *
 * - the scan covers a package's whole directory, not a `src/` convention, so a
 *   package laid out differently cannot fall through every file-level check;
 * - a workspace directory that cannot be read is reported, never silently
 *   skipped into a vacuous pass.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

/** Resolved through `fileURLToPath` — a raw `URL.pathname` is percent-encoded. */
export const HASH_ROOT = fileURLToPath(
  new URL("../../../../../../..", import.meta.url),
).replace(/[/\\]$/, "");
export const CONTEXT_ROOT = join(HASH_ROOT, "libs/@hashintel/brunch-agent");
export const REPO_ROOT = CONTEXT_ROOT;

/**
 * The context root's `docs/` and `scripts/` belong to no workspace, so
 * `turbo prune` never copies them; CI's prune-repository action copies them
 * into its pruned checkout via a requested-scope extra-path rule. This guard is the
 * fallback for a pruned tree where that rule is absent or has drifted: the
 * context-root tests skip there instead of failing on missing files, and run
 * in every full checkout, where this is always true.
 */
export const contextRootPresent =
  existsSync(join(CONTEXT_ROOT, "docs")) &&
  existsSync(join(CONTEXT_ROOT, "scripts"));
const PACKAGES_ROOT = join(CONTEXT_ROOT, "packages");
const APP_ROOT = join(HASH_ROOT, "apps/brunch-agent");

export interface WorkspacePackage {
  /** Package name from its manifest, e.g. `@hashintel/brunch-agent-plugin-gherkin`. */
  readonly name: string;
  /** Directory basename — the role-prefixed one, e.g. `plugin-gherkin`. */
  readonly dir: string;
  /** Absolute path to the package directory. */
  readonly path: string;
  /** Path relative to HASH root. */
  readonly relPath: string;
  /** `packages/` holds shells; `apps/` holds hosts. */
  readonly kind: "package" | "app";
  readonly manifest: PackageManifest;
}

export interface PackageManifest {
  name: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  exports?: Record<string, unknown>;
  scripts?: Record<string, string>;
}

function directoriesIn(parent: string): string[] {
  return readdirSync(parent).filter((entry) =>
    statSync(join(parent, entry)).isDirectory(),
  );
}

export function workspacePackages(): WorkspacePackage[] {
  const packagePaths = directoriesIn(PACKAGES_ROOT).map((dir) => ({
    dir,
    kind: "package" as const,
    path: join(PACKAGES_ROOT, dir),
  }));
  const workspacePaths = [
    ...packagePaths,
    { dir: "brunch-agent", kind: "app" as const, path: APP_ROOT },
  ];

  return workspacePaths.map(({ dir, kind, path }) => {
    const manifestPath = join(path, "package.json");
    if (!existsSync(manifestPath)) {
      throw new Error(
        `${relative(HASH_ROOT, path)} has no package.json — every Brunch workspace needs one.`,
      );
    }
    const manifest = JSON.parse(
      readFileSync(manifestPath, "utf8"),
    ) as PackageManifest;
    return {
      name: manifest.name,
      dir,
      path,
      relPath: relative(HASH_ROOT, path).replaceAll("\\", "/"),
      kind,
      manifest,
    };
  });
}

/** Every declared dependency of a package, production and dev alike. */
export function allDependencies(pkg: WorkspacePackage): string[] {
  return [
    ...Object.keys(pkg.manifest.dependencies ?? {}),
    ...Object.keys(pkg.manifest.devDependencies ?? {}),
  ];
}

/** Runtime dependencies encode the production package direction. */
export function runtimeDependencies(pkg: WorkspacePackage): string[] {
  return Object.keys(pkg.manifest.dependencies ?? {});
}

export interface SourceFile {
  readonly path: string;
  readonly relPath: string;
  readonly text: string;
}

const SOURCE_EXTENSIONS = /\.(ts|tsx|mts|mjs|js|jsx)$/;
/** Never scanned: not authored here, or build output. */
const SKIP_DIRECTORIES = ["node_modules", "dist", ".flue", ".git", ".turbo"];
const TEST_DIRECTORIES = ["test", "tests", "__tests__"];

/** Every source file under a directory, recursively. A missing directory yields none. */
export function filesIn(
  dir: string,
  skip: readonly string[] = SKIP_DIRECTORIES,
): SourceFile[] {
  if (!existsSync(dir)) return [];
  const skipped = new Set(skip);
  const found: SourceFile[] = [];
  const walk = (current: string): void => {
    for (const entry of readdirSync(current)) {
      if (skipped.has(entry)) continue;
      const path = join(current, entry);
      if (statSync(path).isDirectory()) walk(path);
      else if (SOURCE_EXTENSIONS.test(entry)) {
        found.push({
          path,
          relPath: relative(HASH_ROOT, path).replaceAll("\\", "/"),
          text: readFileSync(path, "utf8"),
        });
      }
    }
  };
  walk(dir);
  return found;
}

/**
 * Every file of a package, partitioned into source and test — totally: a file
 * under a test directory at any depth is a test file, and every other file is
 * source. One walk feeding both sides is what makes the partition total by
 * construction. The previous pair of independent walks left a hole (pruning
 * test dirs at any depth on one side, collecting only top-level test dirs on
 * the other), so a file in e.g. `src/test/` was governed by neither the
 * source invariants nor the test-hermeticity rules.
 */
function partitionedFiles(pkg: WorkspacePackage): {
  source: SourceFile[];
  test: SourceFile[];
} {
  const source: SourceFile[] = [];
  const test: SourceFile[] = [];
  for (const file of filesIn(pkg.path)) {
    const segments = relative(pkg.path, file.path).split(/[/\\]/);
    (segments.some((segment) => TEST_DIRECTORIES.includes(segment))
      ? test
      : source
    ).push(file);
  }
  return { source, test };
}

/**
 * A package's own source files — everything it ships, wherever it puts them.
 *
 * Deliberately not `src/`-only: keying the scan off a directory convention
 * would silently exempt a package laid out any other way from every file-level
 * invariant, which is the exact failure the boundary suite exists to prevent.
 * Tests are excluded because they are governed by their own rules.
 */
export function sourceFiles(pkg: WorkspacePackage): SourceFile[] {
  return partitionedFiles(pkg).source;
}

/** Every test file belonging to a package, at any depth. */
export function testFiles(pkg: WorkspacePackage): SourceFile[] {
  return partitionedFiles(pkg).test;
}

/**
 * The `'use agent'` directive as a statement: alone on its line, terminated,
 * quotes matching. Anchoring to a statement rather than matching raw text
 * keeps a comment that merely *mentions* the directive from turning a file
 * into an agent module (the FE-1361 review's verified failure: CI red on a
 * comment-only change).
 *
 * Deliberately not anchored to the *first* statement: a misplaced directive
 * must still be detected, so the first-statement invariant in
 * `test/boundaries.test.ts` can fail it loudly instead of never seeing it.
 */
export const AGENT_DIRECTIVE_STATEMENT =
  /^\s*(["'])use agent\1;?\s*(?:$|\/\/|\/\*)/mu;

/** Whether a file declares itself an agent module (well-placed or not). */
export function isAgentModule(file: SourceFile): boolean {
  return AGENT_DIRECTIVE_STATEMENT.test(file.text);
}

/**
 * The pinned identities a file assigns, extracted by the one pattern both
 * suites share: `test/boundaries.test.ts` checks each identity is never
 * duplicated in source, `test/build-artifact.test.ts` checks each is bound in
 * the emitted bundle. Two hand-copies of the regex would let the two checks
 * silently diverge on what counts as an identity.
 */
export function pinnedIdentities(file: SourceFile): string[] {
  return [...file.text.matchAll(/\w+\.agentName\s*=\s*(["'])([^"']+)\1/gu)].map(
    (match) => match[2]!,
  );
}

/**
 * A model-key environment variable name, as a pattern source for callers to
 * anchor or extend. Composed rather than written literally, so the hermeticity
 * check that reuses it does not flag this file's own source.
 */
export const MODEL_KEY_NAME = `[A-Z_]*${"API"}_${"KEY"}`;

/** Every agent module a package ships. */
export function agentModules(pkg: WorkspacePackage): SourceFile[] {
  return sourceFiles(pkg).filter(isAgentModule);
}

/**
 * The module specifiers a source file imports or re-exports.
 *
 * Deliberately textual: the invariants being checked are about which packages
 * a shell is *allowed to name at all*, so a regex over the source is the right
 * granularity — and it catches type-only imports, which erase at runtime but
 * still encode a forbidden dependency direction.
 */
export function importedModules(file: SourceFile): string[] {
  const specifiers = new Set<string>();
  const patterns = [
    /(?:^|\n)\s*import\s[^;]*?from\s*['"]([^'"]+)['"]/g,
    /(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g,
    /(?:^|\n)\s*export\s[^;]*?from\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of file.text.matchAll(pattern)) {
      if (match[1]) specifiers.add(match[1]);
    }
  }
  return [...specifiers];
}

/** Bare package specifiers only — relative and absolute paths dropped. */
export function importedPackages(file: SourceFile): string[] {
  return importedModules(file).filter(
    (specifier) => !specifier.startsWith(".") && !specifier.startsWith("/"),
  );
}

/** `@scope/name` or `name` — the installable unit a specifier resolves to. */
export function packageOf(specifier: string): string {
  const parts = specifier.split("/");
  return specifier.startsWith("@")
    ? parts.slice(0, 2).join("/")
    : (parts[0] ?? specifier);
}
