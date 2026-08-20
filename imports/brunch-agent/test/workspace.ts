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
  if (!existsSync(parent)) return [];
  return readdirSync(parent).filter((entry) => statSync(join(parent, entry)).isDirectory());
}

export function workspacePackages(): WorkspacePackage[] {
  const groups: ReadonlyArray<[string, 'package' | 'app']> = [
    ['packages', 'package'],
    ['apps', 'app'],
  ];
  return groups.flatMap(([group, kind]) =>
    directoriesIn(join(REPO_ROOT, group)).map((dir) => {
      const path = join(REPO_ROOT, group, dir);
      const manifestPath = join(path, 'package.json');
      if (!existsSync(manifestPath)) {
        // A workspace directory without a manifest is a half-finished package,
        // not a reason to take the whole suite down with a raw ENOENT.
        throw new Error(`${group}/${dir} has no package.json — every workspace member needs one.`);
      }
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as PackageManifest;
      return { name: manifest.name, dir, path, relPath: `${group}/${dir}`, kind, manifest };
    }),
  );
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
 * A package's own source files — everything it ships, wherever it puts them.
 *
 * Deliberately not `src/`-only: keying the scan off a directory convention
 * would silently exempt a package laid out any other way from every file-level
 * invariant, which is the exact failure the boundary suite exists to prevent.
 * Tests are excluded because they are governed by their own rules.
 */
export function sourceFiles(pkg: WorkspacePackage): SourceFile[] {
  return filesIn(pkg.path, [...SKIP_DIRECTORIES, ...TEST_DIRECTORIES]);
}

/** Every test file belonging to a package. */
export function testFiles(pkg: WorkspacePackage): SourceFile[] {
  return TEST_DIRECTORIES.flatMap((dir) => filesIn(join(pkg.path, dir)));
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
