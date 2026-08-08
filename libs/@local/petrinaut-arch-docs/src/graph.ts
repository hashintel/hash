/**
 * Turns the real TypeScript import graph into layer-level edges.
 *
 * dependency-cruiser supplies the file-level truth; the layer assignment comes
 * from `extract.ts`. Aggregating one against the other is what makes the
 * diagrams trustworthy — an edge appears because imports exist, never because
 * someone drew it.
 *
 * Package subpath aliases are derived from each package's `exports` map rather
 * than hand-listed, so a new entry point cannot silently drop out of the graph.
 * The previous script hard-coded seven of `petrinaut-core`'s ten entry points,
 * which meant imports through `./ai`, `./optimization` and `./compiled-model`
 * resolved to nothing and vanished from the diagram.
 */

import { existsSync, readFileSync } from "node:fs";
import { join, posix, relative, sep } from "node:path";

import { cruise, type ICruiseResult, type IModule } from "dependency-cruiser";
import extractTSConfig from "dependency-cruiser/config-utl/extract-ts-config";

import type { ArchitecturePackage, Edge, Layer } from "./model";

/** How many representative file pairs to record per edge. */
const examplesPerEdge = 3;

const toPosix = (path: string): string => path.split(sep).join(posix.sep);

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
): { aliases: Alias[]; warnings: string[] } => {
  const packageRoot = join(repoRoot, pkg.path);
  const manifestPath = join(packageRoot, "package.json");
  const warnings: string[] = [];

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
    exports?: Record<string, unknown>;
  };

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

    const withoutDist = distPath.replace(/^\.\/dist\//u, "");
    const stem = withoutDist.replace(/\.js$/u, "");

    const candidates = [
      join(packageRoot, "src", `${stem}.ts`),
      join(packageRoot, "src", `${stem}.tsx`),
      join(packageRoot, "src", stem, "index.ts"),
      join(packageRoot, "src", stem, "index.tsx"),
    ];

    const resolved = candidates.find((candidate) => existsSync(candidate));

    if (resolved === undefined) {
      warnings.push(
        `${pkg.name} exports \`${subpath}\` but no source entry file was found for it (looked for src/${stem}.ts and src/${stem}/index.ts)`,
      );
      continue;
    }

    const specifier =
      subpath === "." ? pkg.name : `${pkg.name}${subpath.slice(1)}`;

    aliases.push({ alias: resolved, name: specifier, onlyModule: true });
  }

  // Longest specifier first so `@pkg/workers/lsp` is not shadowed by `@pkg`.
  return {
    aliases: aliases.sort(
      (left, right) => right.name.length - left.name.length,
    ),
    warnings,
  };
};

export interface GraphOptions {
  repoRoot: string;
  packages: ArchitecturePackage[];
  tsconfigPath: string;
  excludePattern: string;
  /** Repo-relative source file → layer id, from `extract`. */
  fileLayers: Map<string, string>;
  layers: Layer[];
}

export interface GraphResult {
  edges: Edge[];
  warnings: string[];
}

export const buildGraph = async (
  options: GraphOptions,
): Promise<GraphResult> => {
  const { repoRoot, packages, fileLayers, layers } = options;
  const warnings: string[] = [];

  const aliases: Alias[] = [];
  for (const pkg of packages) {
    if (pkg.language !== "typescript") {
      continue;
    }
    const derived = deriveAliases(repoRoot, pkg);
    aliases.push(...derived.aliases);
    warnings.push(...derived.warnings);
  }

  const sourceRoots = packages
    .filter((pkg) => pkg.language === "typescript")
    .map((pkg) => `${pkg.path}/src`);

  const includeOnly = `^(?:${sourceRoots
    .map((root) => root.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"))
    .join("|")})/`;

  const cruiseResult = await cruise(
    sourceRoots,
    {
      baseDir: repoRoot,
      exclude: options.excludePattern,
      includeOnly,
      moduleSystems: ["es6"],
      tsPreCompilationDeps: true,
    },
    {
      alias: aliases,
      conditionNames: ["types", "import", "default"],
      extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"],
    },
    { tsConfig: extractTSConfig(options.tsconfigPath) },
  );

  if (typeof cruiseResult.output === "string") {
    throw new TypeError("dependency-cruiser returned formatted output");
  }

  const modules: IModule[] = (cruiseResult.output as ICruiseResult).modules;

  const layerPackages = new Map(
    layers.map((layer) => [layer.id, layer.package]),
  );

  interface EdgeAccumulator {
    fileDependencies: number;
    examples: { from: string; to: string }[];
  }

  const edges = new Map<string, EdgeAccumulator>();

  for (const module of modules) {
    const fromFile = toPosix(relative(repoRoot, join(repoRoot, module.source)));
    const fromLayer = fileLayers.get(fromFile);

    if (fromLayer === undefined) {
      continue;
    }

    for (const dependency of module.dependencies) {
      const toFile = toPosix(
        relative(repoRoot, join(repoRoot, dependency.resolved)),
      );
      const toLayer = fileLayers.get(toFile);

      // Imports landing outside any layer — node_modules, uncovered packages.
      if (toLayer === undefined) {
        continue;
      }

      if (toLayer === fromLayer) {
        continue;
      }

      const key = `${fromLayer}\u0000${toLayer}`;
      const accumulator = edges.get(key) ?? {
        fileDependencies: 0,
        examples: [],
      };
      accumulator.fileDependencies += 1;
      if (accumulator.examples.length < examplesPerEdge) {
        accumulator.examples.push({ from: fromFile, to: toFile });
      }
      edges.set(key, accumulator);
    }
  }

  const result: Edge[] = [...edges.entries()]
    .map(([key, accumulator]) => {
      const [from = "", to = ""] = key.split("\u0000");
      const fromPackage = layerPackages.get(from);
      const toPackage = layerPackages.get(to);

      return {
        from,
        to,
        fileDependencies: accumulator.fileDependencies,
        examples: accumulator.examples,
        crossesPackage:
          fromPackage !== undefined &&
          toPackage !== undefined &&
          fromPackage !== toPackage,
      };
    })
    .sort(
      (left, right) =>
        left.from.localeCompare(right.from) || left.to.localeCompare(right.to),
    );

  return { edges: result, warnings };
};
