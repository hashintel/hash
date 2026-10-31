/**
 * The stages in order: scan declarations, collect symbol facts, assemble
 * the model, check it. Pure data between stages, so `check` and `build`
 * share everything up to the point where one writes, and the dev session
 * can keep the first two stages' results in memory.
 */

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
} from "./pipeline/edges";
import {
  collectFacts,
  factsCacheDirectory,
  type FactsSource,
  type Language,
  type SymbolFacts,
} from "./pipeline/facts";
import { buildInterfaces } from "./pipeline/interfaces";
import { scanDeclarations, type ScanResult } from "./pipeline/scan";
import { countErrors, error, type Diagnostic } from "./shared/diagnostics";

import type { ArchinautConfig } from "./config";

export interface PipelineOptions {
  /** Facts sources the caller keeps open, by language. */
  sources?: Map<Language, FactsSource>;
}

/** Wall time per stage, lapped as each one ends. */
export const stopwatch = () => {
  const timings: Record<string, number> = {};
  let last = performance.now();
  return {
    timings,
    lap: (stage: string): void => {
      const now = performance.now();
      timings[stage] = Math.round((timings[stage] ?? 0) + now - last);
      last = now;
    },
  };
};
export type Stopwatch = ReturnType<typeof stopwatch>;

export interface PipelineResult {
  model: ArchitectureModel;
  diagnostics: Diagnostic[];
  /** Wall time per stage, in milliseconds. */
  timings: Record<string, number>;
  /** Languages whose facts were indexed rather than read from the cache. */
  reindexed: string[];
}

/** The validated package list of a config. */
export const packagesOf = (config: ArchinautConfig): ArchitecturePackage[] =>
  config.packages.map((pkg) => packageSchema.parse(pkg));

export const scanConfig = (
  config: ArchinautConfig,
  packages: ArchitecturePackage[],
): Promise<ScanResult> =>
  scanDeclarations({
    repoRoot: config.root,
    packages,
    ignoredDirectories: config.ignoredDirectories,
    ignoredFilePattern: config.ignoredFilePattern,
  });

/** From declarations and symbol facts to a checked model. */
export const assembleModel = (options: {
  config: ArchinautConfig;
  packages: ArchitecturePackage[];
  scan: ScanResult;
  facts: SymbolFacts;
}): { model: ArchitectureModel; diagnostics: Diagnostic[] } => {
  const { config, packages, scan, facts } = options;
  const diagnostics = checkCoverage(facts, scan.fileLayers, {
    directories: config.ignoredDirectories,
    filePattern: config.ignoredFilePattern,
  });
  const importEdges = aggregateImportEdges(
    dependenciesFromFacts(facts),
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
    edges: [...importEdges, ...declared.edges].sort(
      (left, right) =>
        left.from.localeCompare(right.from) || left.to.localeCompare(right.to),
    ),
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
  options: PipelineOptions = {},
): Promise<PipelineResult> => {
  const clock = stopwatch();
  const packages = packagesOf(config);
  const scan = await scanConfig(config, packages);
  clock.lap("scan");
  const collected = await collectFacts({
    repoRoot: config.root,
    packages,
    cacheDirectory: factsCacheDirectory(config.cacheDirectory),
    files: [...scan.fileLayers.keys()],
    sources: options.sources,
  });
  clock.lap("facts");
  const assembled = assembleModel({
    config,
    packages,
    scan,
    facts: collected.facts,
  });
  clock.lap("model");
  return {
    model: assembled.model,
    diagnostics: [
      ...scan.diagnostics,
      ...collected.diagnostics,
      ...assembled.diagnostics,
    ],
    timings: clock.timings,
    reindexed: collected.fresh,
  };
};
