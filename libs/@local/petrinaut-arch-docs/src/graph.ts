/**
 * Turns the real import graphs into layer-level edges.
 *
 * One provider per language supplies the file-level truth: dependency-cruiser
 * for TypeScript, `python-imports.ts` for Python. The layer assignment comes
 * from `extract.ts`. Aggregating one against the other is what makes the
 * diagrams trustworthy: an import edge appears because imports exist, never
 * because someone drew it. The one annotation-drawn kind, a `@talksTo` edge for
 * a boundary no import crosses, is resolved here after aggregation, and it may
 * neither restate an import edge nor name a layer that does not exist.
 *
 * Package subpath aliases are derived from each package's `exports` map rather
 * than hand-listed, so a new entry point cannot drop out of the graph unnoticed.
 * The previous script hard-coded seven of `petrinaut-core`'s ten entry points,
 * which meant imports through `./ai`, `./optimization` and `./compiled-model`
 * resolved to nothing and vanished from the diagram. An `exports` subpath that
 * no longer resolves is an error here for the same reason: the failure is a loss
 * of coverage, and coverage that goes missing without complaint is what this
 * package exists to prevent.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { cruise, type ICruiseResult, type IModule } from "dependency-cruiser";
import extractTSConfig from "dependency-cruiser/config-utl/extract-ts-config";

import { error, warning, type Diagnostic } from "./diagnostics";
import { toPosix } from "./paths";
import { collectPythonImports } from "./python-imports";
import {
  exclusionPattern,
  sourceExtensions,
  sourceRootOf,
  sourceRootPattern,
} from "./scope";

import type { TalksToDeclaration } from "./extract";
import type { ArchitecturePackage, DeclaredEdge, Edge, Layer } from "./model";

/** How many representative file pairs to record per edge. */
const examplesPerEdge = 3;

/** One file-level import, the record every language provider emits. */
export interface FileDependency {
  /** Repo-relative posix path of the importing file. */
  from: string;
  /** Repo-relative posix path of the imported file. */
  to: string;
}

interface Alias {
  alias: string;
  name: string;
  onlyModule: true;
}

/**
 * Maps a package's `exports` targets back to their source entry files.
 *
 * `./dist/hir.js` → `src/hir.ts`, and `./dist/react.js` → `src/react/index.ts`
 * when the flat file does not exist. Both shapes are in use across the
 * Petrinaut packages.
 */
const deriveAliases = (
  repoRoot: string,
  pkg: ArchitecturePackage,
): { aliases: Alias[]; diagnostics: Diagnostic[] } => {
  const packageRoot = join(repoRoot, pkg.path);
  const manifestPath = `${pkg.path}/package.json`;
  const diagnostics: Diagnostic[] = [];

  const manifest = JSON.parse(
    readFileSync(join(packageRoot, "package.json"), "utf8"),
  ) as { exports?: Record<string, unknown>; bin?: unknown; private?: boolean };

  const aliases: Alias[] = [];

  for (const [subpath, target] of Object.entries(manifest.exports ?? {})) {
    if (subpath === "./package.json") {
      continue;
    }

    const distPath =
      typeof target === "string"
        ? target
        : ((target as Record<string, string> | null)?.import ??
          (target as Record<string, string> | null)?.default ??
          null);

    if (distPath === null || !distPath.endsWith(".js")) {
      // Asset exports such as `./styles.css` have no module counterpart.
      continue;
    }

    const stem = distPath.replace(/^\.\/dist\//u, "").replace(/\.js$/u, "");

    const resolved = [
      join(packageRoot, pkg.sourceDirectory, `${stem}.ts`),
      join(packageRoot, pkg.sourceDirectory, `${stem}.tsx`),
      join(packageRoot, pkg.sourceDirectory, stem, "index.ts"),
      join(packageRoot, pkg.sourceDirectory, stem, "index.tsx"),
    ].find((candidate) => existsSync(candidate));

    if (resolved === undefined) {
      diagnostics.push(
        error(
          manifestPath,
          `exports \`${subpath}\` but no source entry file resolves for it (looked for ${pkg.sourceDirectory}/${stem}.ts and ${pkg.sourceDirectory}/${stem}/index.ts). Imports through this specifier would be missing from the graph.`,
        ),
      );
      continue;
    }

    aliases.push({
      alias: resolved,
      name: subpath === "." ? pkg.name : `${pkg.name}${subpath.slice(1)}`,
      onlyModule: true,
    });
  }

  // A library with no module entry points is invisible to import resolution,
  // so imports of it silently vanish from the graph. Bin-only packages are
  // exempt: nothing can import them by specifier in the first place. So are
  // private packages, which are applications rather than libraries and are
  // never imported by name.
  if (
    aliases.length === 0 &&
    manifest.bin === undefined &&
    manifest.private !== true
  ) {
    diagnostics.push(
      warning(
        manifestPath,
        `declares no importable \`exports\` (and no \`bin\`), so no entry aliases were derived: imports of ${pkg.name} would be missing from the graph.`,
      ),
    );
  }

  // Longest specifier first so `@pkg/workers/lsp` is not shadowed by `@pkg`.
  return {
    aliases: aliases.sort(
      (left, right) => right.name.length - left.name.length,
    ),
    diagnostics,
  };
};

export interface GraphOptions {
  repoRoot: string;
  /** Every covered package; `buildGraph` splits them by language. */
  packages: ArchitecturePackage[];
  tsconfigPath: string;
  ignoredDirectories: string[];
  ignoredFilePattern: RegExp;
  /** Repo-relative source file → layer id, from `extract`. */
  fileLayers: Map<string, string>;
  layers: Layer[];
  /** `@talksTo` declarations from `extract`, from any covered language. */
  talksTo: TalksToDeclaration[];
}

export interface GraphResult {
  edges: Edge[];
  diagnostics: Diagnostic[];
}

/** Runs dependency-cruiser over the covered source roots. */
const cruiseModules = async (
  options: GraphOptions,
  aliases: Alias[],
): Promise<IModule[]> => {
  const result = await cruise(
    options.packages.map(sourceRootOf),
    {
      baseDir: options.repoRoot,
      exclude: exclusionPattern(options),
      includeOnly: sourceRootPattern(options.packages),
      moduleSystems: ["es6"],
      tsPreCompilationDeps: true,
    },
    {
      alias: aliases,
      conditionNames: ["types", "import", "default"],
      // Mirrors `sourceExtensions`, plus the JavaScript forms a dependency may
      // legitimately resolve to inside a covered package.
      extensions: [
        ".ts",
        ".tsx",
        ".mts",
        ".cts",
        ".js",
        ".jsx",
        ".mjs",
        ".cjs",
      ],
    },
    { tsConfig: extractTSConfig(options.tsconfigPath) },
  );

  if (typeof result.output === "string") {
    throw new TypeError("dependency-cruiser returned formatted output");
  }

  return (result.output as ICruiseResult).modules;
};

/**
 * Reports source files the graph reached but no layer claims.
 *
 * Both stages exclude the same paths, so a source file left over is a real
 * disagreement about what is in scope, and every edge touching it is missing
 * from the model. Two defects hid here until this check existed: the cruise root
 * ignored `sourceDirectory`, and `.mts` files were assigned to layers while
 * being unresolvable to the graph. Neither produced a single message.
 *
 * Restricted to source extensions, because the graph legitimately reaches assets
 * no layer should claim. `ui/index.css` is imported by TypeScript and belongs to
 * no layer, which is correct: the model describes modules, not the stylesheet one
 * of them pulls in.
 */
const checkCoverage = (
  modules: IModule[],
  fileLayers: Map<string, string>,
): Diagnostic[] =>
  modules
    .map((module) => toPosix(module.source))
    .filter(
      (file) =>
        sourceExtensions.some((extension) => file.endsWith(extension)) &&
        !fileLayers.has(file),
    )
    .sort((left, right) => left.localeCompare(right))
    .map((file) =>
      error(
        file,
        "the import graph reached this source file but no layer claims it, so its imports are missing from the model. Either it sits outside every declaration's folder, or the extractor and the graph disagree about what counts as source.",
      ),
    );

/**
 * Resolves `@talksTo` declarations into declared edges.
 *
 * Separate from `buildGraph` so the error cases are testable without running
 * dependency-cruiser. Each error names the annotation's file and line: an
 * unknown target would otherwise draw an edge to a node no page describes, and
 * a pair the import graph already carries would double an edge whose truth is
 * the imports, so both refuse the declaration instead.
 */
export const resolveDeclaredEdges = (options: {
  talksTo: TalksToDeclaration[];
  /** Repo-relative source file → layer id, from `extract`. */
  fileLayers: Map<string, string>;
  layers: Layer[];
  importEdges: Edge[];
}): { edges: DeclaredEdge[]; diagnostics: Diagnostic[] } => {
  const diagnostics: Diagnostic[] = [];
  const edges: DeclaredEdge[] = [];

  const packageOf = new Map(
    options.layers.map((layer) => [layer.id, layer.package]),
  );
  const importPairs = new Set(
    options.importEdges.map((edge) => `${edge.from}>${edge.to}`),
  );
  /** Pair → file that declared it, so a repeat is reported with its rival. */
  const declaredPairs = new Map<string, string>();

  for (const declaration of options.talksTo) {
    const from = options.fileLayers.get(declaration.file);

    // A file no layer resolves for is already an error in `extract`.
    if (from === undefined) {
      continue;
    }

    if (!packageOf.has(declaration.target)) {
      diagnostics.push(
        error(
          declaration.file,
          `@talksTo names \`${declaration.target}\`, which is not a declared layer`,
          declaration.line,
        ),
      );
      continue;
    }

    if (declaration.target === from) {
      diagnostics.push(
        error(
          declaration.file,
          `@talksTo names \`${declaration.target}\`, the declaring file's own layer; declare the edge on the calling side only`,
          declaration.line,
        ),
      );
      continue;
    }

    const pair = `${from}>${declaration.target}`;

    if (importPairs.has(pair)) {
      diagnostics.push(
        error(
          declaration.file,
          `@talksTo declares \`${from}\` → \`${declaration.target}\`, but that edge is already derived from imports; remove the declaration`,
          declaration.line,
        ),
      );
      continue;
    }

    const rival = declaredPairs.get(pair);
    if (rival !== undefined) {
      diagnostics.push(
        error(
          declaration.file,
          `\`${from}\` → \`${declaration.target}\` is already declared in ${rival}`,
          declaration.line,
        ),
      );
      continue;
    }
    declaredPairs.set(pair, declaration.file);

    const fromPackage = packageOf.get(from);
    const toPackage = packageOf.get(declaration.target);

    edges.push({
      from,
      to: declaration.target,
      provenance: "declared",
      protocol: declaration.protocol,
      declaredIn: declaration.file,
      line: declaration.line,
      crossesPackage:
        fromPackage !== undefined &&
        toPackage !== undefined &&
        fromPackage !== toPackage,
    });
  }

  return { edges, diagnostics };
};

/**
 * Runs dependency-cruiser over the TypeScript packages and flattens the result
 * to file-level records, so aggregation reads one shape from every language.
 */
const collectTypeScriptImports = async (
  options: GraphOptions,
): Promise<{ dependencies: FileDependency[]; diagnostics: Diagnostic[] }> => {
  // Nothing to cruise; also keeps Python-only tests off dependency-cruiser.
  if (options.packages.length === 0) {
    return { dependencies: [], diagnostics: [] };
  }

  const aliases: Alias[] = [];
  const diagnostics: Diagnostic[] = [];

  for (const pkg of options.packages) {
    const derived = deriveAliases(options.repoRoot, pkg);
    aliases.push(...derived.aliases);
    diagnostics.push(...derived.diagnostics);
  }

  const modules = await cruiseModules(options, aliases);
  diagnostics.push(...checkCoverage(modules, options.fileLayers));

  const dependencies: FileDependency[] = modules.flatMap((module) =>
    module.dependencies.map((dependency) => ({
      from: toPosix(module.source),
      to: toPosix(dependency.resolved),
    })),
  );

  return { dependencies, diagnostics };
};

export const buildGraph = async (
  options: GraphOptions,
): Promise<GraphResult> => {
  const { repoRoot, fileLayers, layers } = options;

  const byLanguage = (language: ArchitecturePackage["language"]) =>
    options.packages.filter((pkg) => pkg.language === language);

  const typescript = await collectTypeScriptImports({
    ...options,
    packages: byLanguage("typescript"),
  });
  const python = await collectPythonImports({
    repoRoot,
    packages: byLanguage("python"),
    fileLayers,
  });

  const dependencies = [...typescript.dependencies, ...python.dependencies];
  const diagnostics = [...typescript.diagnostics, ...python.diagnostics];

  interface EdgeAccumulator {
    fileDependencies: number;
    examples: { from: string; to: string }[];
  }

  const accumulated = new Map<string, EdgeAccumulator>();

  for (const { from: fromFile, to: toFile } of dependencies) {
    const fromLayer = fileLayers.get(fromFile);
    const toLayer = fileLayers.get(toFile);

    if (fromLayer === undefined) {
      continue;
    }

    // Imports landing outside any layer: node_modules, uncovered packages.
    // A file *inside* the covered roots is reported by `checkCoverage` for
    // TypeScript and by `extract` for Python.
    if (toLayer === undefined || toLayer === fromLayer) {
      continue;
    }

    // `>` cannot occur in a layer id, which is dot-separated kebab-case, so
    // the pair round-trips. An earlier version used a NUL byte for this and
    // left two raw NULs in the file, which made every text tool treat the
    // source as binary.
    const key = `${fromLayer}>${toLayer}`;
    const edge = accumulated.get(key) ?? {
      fileDependencies: 0,
      examples: [],
    };
    edge.fileDependencies += 1;
    if (edge.examples.length < examplesPerEdge) {
      edge.examples.push({ from: fromFile, to: toFile });
    }
    accumulated.set(key, edge);
  }

  const packageOf = new Map(layers.map((layer) => [layer.id, layer.package]));

  const importEdges: Edge[] = [...accumulated.entries()].map(([key, edge]) => {
    const [from = "", to = ""] = key.split(">");
    const fromPackage = packageOf.get(from);
    const toPackage = packageOf.get(to);

    return {
      from,
      to,
      provenance: "imports" as const,
      fileDependencies: edge.fileDependencies,
      examples: edge.examples,
      crossesPackage:
        fromPackage !== undefined &&
        toPackage !== undefined &&
        fromPackage !== toPackage,
    };
  });

  const declared = resolveDeclaredEdges({
    talksTo: options.talksTo,
    fileLayers,
    layers,
    importEdges,
  });
  diagnostics.push(...declared.diagnostics);

  const edges: Edge[] = [...importEdges, ...declared.edges].sort(
    (left, right) =>
      left.from.localeCompare(right.from) || left.to.localeCompare(right.to),
  );

  return { edges, diagnostics };
};
