/**
 * The stages in order: scan declarations, index symbols, derive edges, build
 * the model, check it. Pure data between stages, so `check` and `build` share
 * everything up to the point where one writes.
 */

import { join } from "node:path";

import {
  ARCHITECTURE_MODEL_VERSION,
  architectureModelSchema,
  packageSchema,
  type ArchitectureModel,
  type ArchitecturePackage,
} from "./model";
import { runChecks } from "./pipeline/check";
import {
  aggregateImportEdges,
  checkCoverage,
  dependenciesFromFacts,
  resolveDeclaredEdges,
  type FileDependency,
} from "./pipeline/edges";
import { collectPythonImports } from "./pipeline/edges/python-imports";
import { buildInterfaces } from "./pipeline/interfaces";
import { scanDeclarations, type ScanResult } from "./pipeline/scan";
import { indexPackages, type SymbolFacts } from "./pipeline/symbol-index";
import { countErrors, error, type Diagnostic } from "./shared/diagnostics";

import type { ArchinautConfig } from "./config";

export interface PipelineResult {
  model: ArchitectureModel;
  diagnostics: Diagnostic[];
  /** Wall time per stage, in milliseconds. */
  timings: Record<string, number>;
  /** Packages whose index was rebuilt rather than read from the cache. */
  reindexed: string[];
}

/**
 * From declarations and symbol facts to a checked model. Shared by the one-shot
 * pipeline and the dev session, which keeps both inputs in memory.
 */
export const assembleModel = async (options: {
  config: ArchinautConfig;
  packages: ArchitecturePackage[];
  scan: ScanResult;
  facts: SymbolFacts;
}): Promise<{ model: ArchitectureModel; diagnostics: Diagnostic[] }> => {
  const { config, packages, scan, facts } = options;
  const repoRoot = config.root;
  const diagnostics: Diagnostic[] = [];
  diagnostics.push(
    ...checkCoverage(facts, scan.fileLayers, {
      directories: config.ignoredDirectories,
      filePattern: config.ignoredFilePattern,
    }),
  );

  // The import-statement scan is the safety net for Python modules
  // scip-python leaves unresolved; the union of both is the edge set.
  const python = await collectPythonImports({
    repoRoot,
    packages: packages.filter((pkg) => pkg.language === "python"),
    fileLayers: scan.fileLayers,
  });
  diagnostics.push(...python.diagnostics);
  const dependencies: FileDependency[] = [
    ...dependenciesFromFacts(facts),
    ...python.dependencies,
  ];
  const importEdges = aggregateImportEdges(
    dependencies,
    scan.fileLayers,
    scan.layers,
  );
  const declared = resolveDeclaredEdges({
    talksTo: scan.talksTo,
    fileLayers: scan.fileLayers,
    layers: scan.layers,
    importEdges,
  });
  diagnostics.push(...declared.diagnostics);
  const edges = [...importEdges, ...declared.edges].sort(
    (left, right) =>
      left.from.localeCompare(right.from) || left.to.localeCompare(right.to),
  );
  const interfaces = buildInterfaces({
    declarations: scan.interfaces,
    participations: scan.participations,
    externals: config.externals,
    facts,
    fileLayers: scan.fileLayers,
  });
  diagnostics.push(...interfaces.diagnostics);
  const model = {
    version: ARCHITECTURE_MODEL_VERSION,
    packages,
    layers: scan.layers,
    edges,
    interfaces: interfaces.interfaces,
    externals: config.externals.map(
      ({ participates: _participates, ...external }) => external,
    ),
    tags: config.tags,
    rules: config.rules,
  } satisfies ArchitectureModel;

  const validated = architectureModelSchema.safeParse(model);
  if (!validated.success) {
    for (const issue of validated.error.issues) {
      if (issue.path[0] !== "layers") {
        diagnostics.push(
          error(
            "archinaut.config.ts",
            `the model is not valid at \`${issue.path.join(".")}\`: ${issue.message}`,
          ),
        );
      }
    }
  }
  diagnostics.push(...runChecks(model, config.rules));
  if (countErrors(diagnostics) === 0 && !validated.success) {
    diagnostics.push(
      error("archinaut.config.ts", "the model failed validation"),
    );
  }
  return { model, diagnostics };
};

export const runPipeline = async (
  config: ArchinautConfig,
): Promise<PipelineResult> => {
  const timings: Record<string, number> = {};
  const timed = async <T>(
    stage: string,
    work: () => Promise<T>,
  ): Promise<T> => {
    const started = performance.now();
    const result = await work();
    timings[stage] = Math.round(performance.now() - started);
    return result;
  };

  const packages = config.packages.map((pkg) => packageSchema.parse(pkg));
  const { root: repoRoot } = config;

  const scan = await timed("scan", () =>
    scanDeclarations({
      repoRoot,
      packages,
      ignoredDirectories: config.ignoredDirectories,
      ignoredFilePattern: config.ignoredFilePattern,
    }),
  );
  const diagnostics = [...scan.diagnostics];

  const index = await timed("index", () =>
    indexPackages({
      repoRoot,
      packages,
      files: [...scan.fileLayers.keys()],
      cacheDirectory: join(repoRoot, config.cacheDirectory),
    }),
  );
  diagnostics.push(...index.diagnostics);
  const assembled = await timed("model", () =>
    assembleModel({ config, packages, scan, facts: index.facts }),
  );
  diagnostics.push(...assembled.diagnostics);
  timings.check = 0;

  return {
    model: assembled.model,
    diagnostics,
    timings,
    reindexed: index.fresh,
  };
};
