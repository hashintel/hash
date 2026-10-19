/**
 * Symbol facts from SCIP indexers, one index per package, cached by the
 * package's source listing.
 *
 * TypeScript packages are indexed with scip-typescript through a generated
 * tsconfig that maps every covered workspace package to its source entries,
 * so a cross-package reference lands on the defining source file rather than
 * on a rolled-up declaration bundle. Python packages are indexed with
 * scip-python on the package's own virtual environment when it has one.
 */

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, posix } from "node:path";
import { promisify } from "node:util";

import { error, type Diagnostic } from "../diagnostics";
import { sourceRootOf } from "../scope";

import type { ArchitecturePackage } from "../model/types";

const require = createRequire(import.meta.url);
const run = promisify(execFile);

export interface SymbolOccurrence {
  symbol: string;
  definition: boolean;
}

export interface IndexedDocument {
  /** Repo-relative, posix-separated. */
  file: string;
  occurrences: SymbolOccurrence[];
}

export interface SymbolFacts {
  documents: IndexedDocument[];
}

export interface IndexOptions {
  repoRoot: string;
  packages: ArchitecturePackage[];
  /** Repo-relative source files, from the scan; the cache key is built from them. */
  files: string[];
  /** Absolute directory for indexes and generated tsconfigs. */
  cacheDirectory: string;
}

/** The subset of the generated protobuf bindings this module reads. */
interface ScipIndex {
  documents: {
    relative_path: string;
    occurrences: { symbol: string; symbol_roles: number }[];
  }[];
}

const DEFINITION_ROLE = 1;

const scipBindings =
  require("@sourcegraph/scip-typescript/dist/src/scip.js") as {
    scip: { Index: { deserializeBinary: (bytes: Uint8Array) => ScipIndex } };
  };

const indexerVersions = {
  typescript: (
    require("@sourcegraph/scip-typescript/package.json") as { version: string }
  ).version,
  python: (
    require("@sourcegraph/scip-python/package.json") as { version: string }
  ).version,
};

const indexerEntry = {
  typescript: require.resolve("@sourcegraph/scip-typescript/dist/src/main.js"),
  python: require.resolve("@sourcegraph/scip-python/index.js"),
};

/**
 * `exports` targets mapped back to source entry files: `./dist/hir.js` is
 * `src/hir.ts`, or `src/hir/index.ts` when the flat file does not exist.
 */
const sourceEntries = (
  repoRoot: string,
  pkg: ArchitecturePackage,
): Record<string, string[]> => {
  const manifest = JSON.parse(
    require("node:fs").readFileSync(
      join(repoRoot, pkg.path, "package.json"),
      "utf8",
    ) as string,
  ) as { name: string; exports?: Record<string, unknown> };
  const paths: Record<string, string[]> = {};
  for (const [subpath, target] of Object.entries(manifest.exports ?? {})) {
    const conditions = target as Record<string, string> | null;
    const distPath =
      typeof target === "string"
        ? target
        : (conditions?.import ?? conditions?.default ?? null);
    if (distPath === null || !distPath.endsWith(".js")) {
      continue;
    }
    const stem = distPath.replace(/^\.\/dist\//u, "").replace(/\.js$/u, "");
    const resolved = [
      `${stem}.ts`,
      `${stem}.tsx`,
      `${stem}/index.ts`,
      `${stem}/index.tsx`,
    ]
      .map((candidate) =>
        join(repoRoot, pkg.path, pkg.sourceDirectory, candidate),
      )
      .find((candidate) => existsSync(candidate));
    if (resolved !== undefined) {
      paths[
        subpath === "." ? manifest.name : `${manifest.name}${subpath.slice(1)}`
      ] = [resolved];
    }
  }
  return paths;
};

const safeName = (pkg: ArchitecturePackage): string =>
  pkg.name.replace(/[^a-z0-9]+/giu, "-");

const cacheKey = async (
  repoRoot: string,
  pkg: ArchitecturePackage,
  files: string[],
  extra: string,
): Promise<string> => {
  const hash = createHash("sha1");
  hash.update(
    `${pkg.language}:${indexerVersions[pkg.language]}:${pkg.path}:${extra}\n`,
  );
  for (const file of files) {
    const info = await stat(join(repoRoot, file));
    hash.update(`${file}:${info.size}:${info.mtimeMs}\n`);
  }
  return hash.digest("hex").slice(0, 16);
};

/** The tsconfig a package is indexed with: its own, plus workspace sources. */
const generatedTsconfig = (
  options: IndexOptions,
  pkg: ArchitecturePackage,
): string => {
  const packageRoot = join(options.repoRoot, pkg.path);
  const baseTsconfig = join(packageRoot, "tsconfig.json");
  const paths = Object.assign(
    {},
    ...options.packages
      .filter((candidate) => candidate.language === "typescript")
      .map((candidate) => sourceEntries(options.repoRoot, candidate)),
  ) as Record<string, string[]>;
  const tsconfig = {
    ...(existsSync(baseTsconfig) ? { extends: baseTsconfig } : {}),
    compilerOptions: { paths },
    include: [join(packageRoot, pkg.sourceDirectory)],
  };
  return `${JSON.stringify(tsconfig, null, 2)}\n`;
};

const indexTypeScript = async (
  options: IndexOptions,
  pkg: ArchitecturePackage,
  output: string,
  tsconfigPath: string,
  tsconfig: string,
): Promise<void> => {
  const packageRoot = join(options.repoRoot, pkg.path);
  await writeFile(tsconfigPath, tsconfig);
  await run(
    process.execPath,
    [
      indexerEntry.typescript,
      "index",
      "--cwd",
      packageRoot,
      "--output",
      output,
      tsconfigPath,
    ],
    { maxBuffer: 64 * 1024 * 1024 },
  );
};

const indexPython = async (
  options: IndexOptions,
  pkg: ArchitecturePackage,
  output: string,
): Promise<void> => {
  const packageRoot = join(options.repoRoot, pkg.path);
  const venvBin = join(packageRoot, ".venv", "bin");
  await run(
    process.execPath,
    [
      indexerEntry.python,
      "index",
      "--cwd",
      packageRoot,
      "--target-only",
      pkg.sourceDirectory,
      "--project-name",
      pkg.name,
      "--output",
      output,
      "--quiet",
    ],
    {
      maxBuffer: 64 * 1024 * 1024,
      env: existsSync(venvBin)
        ? { ...process.env, PATH: `${venvBin}:${process.env.PATH ?? ""}` }
        : process.env,
    },
  );
};

const decode = async (
  pkg: ArchitecturePackage,
  indexPath: string,
): Promise<IndexedDocument[]> => {
  const index = scipBindings.scip.Index.deserializeBinary(
    await readFile(indexPath),
  );
  const sourceRoot = sourceRootOf(pkg);
  return index.documents.map((document) => {
    // scip-python reports paths relative to `--target-only`; scip-typescript
    // relative to `--cwd`. Both are brought to repo-relative here.
    const relativePath = document.relative_path;
    const file =
      pkg.language === "python" &&
      !relativePath.startsWith(`${pkg.sourceDirectory}/`)
        ? posix.join(sourceRoot, relativePath)
        : posix.join(pkg.path, relativePath);
    return {
      file,
      occurrences: document.occurrences
        .filter((occurrence) => !occurrence.symbol.startsWith("local "))
        .map((occurrence) => ({
          symbol: occurrence.symbol,
          definition: (occurrence.symbol_roles & DEFINITION_ROLE) !== 0,
        })),
    };
  });
};

/** Indexes every package, reusing a cached index whose key still matches. */
export const indexPackages = async (
  options: IndexOptions,
): Promise<{
  facts: SymbolFacts;
  diagnostics: Diagnostic[];
  fresh: string[];
}> => {
  await mkdir(options.cacheDirectory, { recursive: true });
  const diagnostics: Diagnostic[] = [];
  const fresh: string[] = [];

  const results = await Promise.all(
    options.packages.map(async (pkg): Promise<IndexedDocument[]> => {
      const files = options.files.filter((file) =>
        file.startsWith(`${sourceRootOf(pkg)}/`),
      );
      const tsconfigPath = join(
        options.cacheDirectory,
        `${safeName(pkg)}.tsconfig.json`,
      );
      const tsconfig =
        pkg.language === "typescript" ? generatedTsconfig(options, pkg) : "";
      const key = await cacheKey(
        options.repoRoot,
        pkg,
        files,
        `${pkg.sourceDirectory}\n${tsconfig}`,
      );
      const indexPath = join(
        options.cacheDirectory,
        `${safeName(pkg)}-${key}.scip`,
      );
      if (!existsSync(indexPath)) {
        try {
          if (pkg.language === "typescript") {
            await indexTypeScript(options, pkg, indexPath, tsconfigPath, tsconfig);
          } else {
            await indexPython(options, pkg, indexPath);
          }
          fresh.push(pkg.name);
        } catch (cause) {
          diagnostics.push(
            error(
              `${pkg.path}/package.json`,
              `indexing ${pkg.name} failed, so its edges are missing: ${cause instanceof Error ? cause.message : String(cause)}`,
            ),
          );
          return [];
        }
      }
      return decode(pkg, indexPath);
    }),
  );

  return { facts: { documents: results.flat() }, diagnostics, fresh };
};
