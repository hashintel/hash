/**
 * Symbol facts per package, cached by the package's source listing.
 *
 * TypeScript packages share one TypeScript program whose facts are walked
 * once and stored as JSON; cross-package references resolve to source entries
 * through the `paths` map derived from each package's `exports`. Python
 * packages are indexed with scip-python on the package's own virtual
 * environment when it has one.
 */

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, posix } from "node:path";
import { promisify } from "node:util";

import ts from "typescript";

import { error, type Diagnostic } from "../shared/diagnostics";
import { sourceRootOf } from "./shared/scope";
import { createTypeScriptFacts } from "./typescript-facts";

import type { ArchitecturePackage } from "../model";

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
  /**
   * Builds the TypeScript program when its facts are not cached. A caller
   * that keeps the result, like the dev session, passes its own.
   */
  createTypeScript?: typeof createTypeScriptFacts;
}

/** The subset of scip-typescript's protobuf bindings this module reads; the indexer itself is not run. */
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
  typescript: ts.version,
  python: (
    require("@sourcegraph/scip-python/package.json") as { version: string }
  ).version,
};

const indexerEntry = {
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
    readFileSync(join(repoRoot, pkg.path, "package.json"), "utf8"),
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
  pkg: Pick<ArchitecturePackage, "language" | "path">,
  files: string[],
  extra: string,
): Promise<string> => {
  const hash = createHash("sha1");
  hash.update(
    `${pkg.language}:${indexerVersions[pkg.language]}:${pkg.path}:${extra}\n`,
  );
  const contents = await Promise.all(
    files.map((file) => readFile(join(repoRoot, file))),
  );
  files.forEach((file, index) => {
    hash.update(`${file}:${contents[index]?.length ?? 0}\n`);
    hash.update(contents[index] ?? "");
  });
  return hash.digest("hex").slice(0, 16);
};

/** `paths` mapping every covered TypeScript package to its source entries. */
export const workspacePaths = (
  repoRoot: string,
  packages: ArchitecturePackage[],
): Record<string, string[]> =>
  Object.assign(
    {},
    ...packages
      .filter((candidate) => candidate.language === "typescript")
      .map((candidate) => sourceEntries(repoRoot, candidate)),
  ) as Record<string, string[]>;

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
    // scip-python reports paths relative to `--target-only`, or to `--cwd`
    // when the package has a single root; both become repo-relative here.
    const relativePath = document.relative_path;
    const file = relativePath.startsWith(`${pkg.sourceDirectory}/`)
      ? posix.join(pkg.path, relativePath)
      : posix.join(sourceRoot, relativePath);
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

/**
 * Facts for every package: the TypeScript packages from one program, walked
 * once and cached as JSON; each Python package from its scip-python index.
 * A cached entry is reused while its key, the content of the package's files,
 * holds, so an edit undone finds its entry again.
 */
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
  const filesOf = (pkg: ArchitecturePackage): string[] =>
    options.files.filter((file) => file.startsWith(`${sourceRootOf(pkg)}/`));

  const typescriptPackages = options.packages.filter(
    (pkg) => pkg.language === "typescript",
  );
  const typescript = async (): Promise<IndexedDocument[]> => {
    if (typescriptPackages.length === 0) {
      return [];
    }
    const files = typescriptPackages.flatMap(filesOf);
    const paths = workspacePaths(options.repoRoot, options.packages);
    const key = await cacheKey(
      options.repoRoot,
      { language: "typescript", path: "typescript" },
      files,
      JSON.stringify(paths),
    );
    const cachePath = join(options.cacheDirectory, `typescript-${key}.json`);
    if (existsSync(cachePath)) {
      return JSON.parse(await readFile(cachePath, "utf8")) as IndexedDocument[];
    }
    const documents = (options.createTypeScript ?? createTypeScriptFacts)({
      repoRoot: options.repoRoot,
      paths,
      files,
    }).documents();
    await writeFile(cachePath, JSON.stringify(documents));
    fresh.push("typescript");
    return documents;
  };

  const python = async (
    pkg: ArchitecturePackage,
  ): Promise<IndexedDocument[]> => {
    const files = filesOf(pkg);
    const key = await cacheKey(
      options.repoRoot,
      pkg,
      files,
      pkg.sourceDirectory,
    );
    const indexPath = join(
      options.cacheDirectory,
      `${safeName(pkg)}-${key}.scip`,
    );
    if (!existsSync(indexPath)) {
      try {
        await indexPython(options, pkg, indexPath);
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
  };

  const results = await Promise.all([
    typescript(),
    ...options.packages.filter((pkg) => pkg.language === "python").map(python),
  ]);
  return { facts: { documents: results.flat() }, diagnostics, fresh };
};
