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

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Resolved through `fileURLToPath` — a raw `URL.pathname` is percent-encoded. */
export const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/[/\\]$/, '');

export interface WorkspacePackage {
  /** Package name from its manifest, e.g. `@brunch/plugin-gherkin`. */
  readonly name: string;
  /** Directory basename — the role-prefixed one, e.g. `plugin-gherkin`. */
  readonly dir: string;
  /** Absolute path to the package directory. */
  readonly path: string;
  /** Path relative to the repo root, e.g. `packages/plugin-gherkin`. */
  readonly relPath: string;
  /** `packages/` holds shells; `apps/` holds hosts. */
  readonly kind: 'package' | 'app';
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
  return readdirSync(parent).filter((entry) => statSync(join(parent, entry)).isDirectory());
}

/**
 * The architectural kind of each workspace group. Every glob the root manifest
 * declares must resolve here: a group this map does not know is a group no
 * boundary invariant governs, and that has to be a loud failure rather than a
 * vacuous pass (the FE-1361 review's verified finding — the old hardcoded
 * group list simply never saw a new group).
 */
const GROUP_KINDS: Readonly<Record<string, 'package' | 'app'>> = {
  packages: 'package',
  apps: 'app',
};

export function workspacePackages(): WorkspacePackage[] {
  // Derived from the root manifest rather than listed by hand, so the set of
  // groups the suite scans is the set Bun actually links as workspaces.
  const rootManifest = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')) as {
    workspaces?: string[];
  };
  const globs = rootManifest.workspaces ?? [];
  if (globs.length === 0) {
    throw new Error('Root package.json declares no workspaces — nothing for the suite to govern.');
  }
  return globs.flatMap((glob) => {
    const group = /^([\w-]+)\/\*$/.exec(glob)?.[1];
    if (!group) {
      throw new Error(
        `Workspace glob ${JSON.stringify(glob)} is not the '<group>/*' shape this suite scans — teach test/workspace.ts to read it.`,
      );
    }
    const kind = GROUP_KINDS[group];
    if (!kind) {
      throw new Error(
        `Workspace group '${group}/' has no architectural kind — add it to GROUP_KINDS in test/workspace.ts so its packages are governed by the boundary suite.`,
      );
    }
    const parent = join(REPO_ROOT, group);
    if (!existsSync(parent)) {
      throw new Error(
        `Workspace group '${group}/' is declared in package.json but missing on disk.`,
      );
    }
    return directoriesIn(parent).map((dir) => {
      const path = join(REPO_ROOT, group, dir);
      const manifestPath = join(path, 'package.json');
      if (!existsSync(manifestPath)) {
        // A workspace directory without a manifest is a half-finished package,
        // not a reason to take the whole suite down with a raw ENOENT.
        throw new Error(`${group}/${dir} has no package.json — every workspace member needs one.`);
      }
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as PackageManifest;
      return { name: manifest.name, dir, path, relPath: `${group}/${dir}`, kind, manifest };
    });
  });
}

/** Every declared dependency of a package, production and dev alike. */
export function allDependencies(pkg: WorkspacePackage): string[] {
  return [
    ...Object.keys(pkg.manifest.dependencies ?? {}),
    ...Object.keys(pkg.manifest.devDependencies ?? {}),
  ];
}

export interface SourceFile {
  readonly path: string;
  readonly relPath: string;
  readonly text: string;
}

const SOURCE_EXTENSIONS = /\.(ts|tsx|mts|mjs|js|jsx)$/;
/** Never scanned: not authored here, or build output. */
const SKIP_DIRECTORIES = ['node_modules', 'dist', '.flue', '.git'];
const TEST_DIRECTORIES = ['test', 'tests', '__tests__'];

/** Every source file under a directory, recursively. A missing directory yields none. */
export function filesIn(dir: string, skip: readonly string[] = SKIP_DIRECTORIES): SourceFile[] {
  if (!existsSync(dir)) return [];
  const skipped = new Set(skip);
  const found: SourceFile[] = [];
  const walk = (current: string): void => {
    for (const entry of readdirSync(current)) {
      if (skipped.has(entry)) continue;
      const path = join(current, entry);
      if (statSync(path).isDirectory()) walk(path);
      else if (SOURCE_EXTENSIONS.test(entry)) {
        found.push({ path, relPath: relative(REPO_ROOT, path), text: readFileSync(path, 'utf8') });
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
function partitionedFiles(pkg: WorkspacePackage): { source: SourceFile[]; test: SourceFile[] } {
  const source: SourceFile[] = [];
  const test: SourceFile[] = [];
  for (const file of filesIn(pkg.path)) {
    const segments = relative(pkg.path, file.path).split(/[/\\]/);
    (segments.some((segment) => TEST_DIRECTORIES.includes(segment)) ? test : source).push(file);
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
export const AGENT_DIRECTIVE_STATEMENT = /^\s*(['"])use agent\1;?\s*(?:$|\/\/|\/\*)/m;

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
  return [...file.text.matchAll(/\w+\.agentName\s*=\s*'([^']+)'/g)].map((match) => match[1]!);
}

/**
 * A model-key environment variable name, as a pattern source for callers to
 * anchor or extend. Composed rather than written literally, so the hermeticity
 * check that reuses it does not flag this file's own source.
 */
export const MODEL_KEY_NAME = `[A-Z_]*${'API'}_${'KEY'}`;

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
    (specifier) => !specifier.startsWith('.') && !specifier.startsWith('/'),
  );
}

/** `@scope/name` or `name` — the installable unit a specifier resolves to. */
export function packageOf(specifier: string): string {
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : (parts[0] ?? specifier);
}
