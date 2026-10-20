/**
 * The dev session: per-package scan results and per-language facts kept in
 * memory between rebuilds, so a change touches one package and a content
 * edit touches none. Each language's facts source stays open in its worker;
 * one that answered the first build from the cache is warmed behind the
 * server, so the first edit after a start pays for no program.
 */

import { writeBuild, type BuildResult } from "../build";
import {
  assembleModel,
  packagesOf,
  scanConfig,
  type PipelineResult,
} from "../pipeline";
import {
  collectFacts,
  factsCacheDirectory,
  filesInLanguage,
  languagesOf,
  openFactsSource,
  type Analysis,
  type FactsSource,
  type IndexedDocument,
  type Language,
} from "../pipeline/facts";
import { sourceExtensionsFor, sourceRootOf } from "../pipeline/shared/scope";

import type { ArchinautConfig } from "../config";
import type { ArchitecturePackage } from "../model";
import type { ScanResult } from "../pipeline/scan";
import type { Diagnostic } from "../shared/diagnostics";

export interface SessionBuild {
  result: BuildResult;
  /** Wall time per stage, in milliseconds. */
  timings: Record<string, number>;
  /** What the rebuild touched, for the log line. */
  touched: string[];
}

export interface DevSession {
  build: () => Promise<SessionBuild>;
  rebuild: (changed: string[]) => Promise<SessionBuild>;
  close: () => Promise<void>;
}

const mergeScans = (scans: ScanResult[]): ScanResult => ({
  layers: scans
    .flatMap((scan) => scan.layers)
    .sort((left, right) => left.id.localeCompare(right.id)),
  fileLayers: new Map(scans.flatMap((scan) => [...scan.fileLayers])),
  talksTo: scans.flatMap((scan) => scan.talksTo),
  diagnostics: scans.flatMap((scan) => scan.diagnostics),
});

const stopwatch = () => {
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

export const createDevSession = (
  config: ArchinautConfig,
  options: { analysis: Analysis; log: (line: string) => void },
): DevSession => {
  const packages = packagesOf(config);
  const factsOptions = {
    repoRoot: config.root,
    packages,
    analysis: options.analysis,
    cacheDirectory: factsCacheDirectory(config.root, config.cacheDirectory),
  };
  const scans = new Map<string, ScanResult>();
  const facts = new Map<Language, IndexedDocument[]>();
  const sources = new Map<Language, FactsSource>(
    languagesOf(packages).map((language) => [
      language,
      openFactsSource(language, factsOptions),
    ]),
  );
  /** Per language, the work its source is busy with; updates queue behind it. */
  const busy = new Map<Language, Promise<unknown>>();
  const queue = <T>(language: Language, work: () => Promise<T>): Promise<T> => {
    const next = (busy.get(language) ?? Promise.resolve()).then(work, work);
    busy.set(
      language,
      next.catch(() => undefined),
    );
    return next;
  };

  const allFiles = (): string[] =>
    [...scans.values()].flatMap((scan) => [...scan.fileLayers.keys()]);

  const packageOf = (file: string): ArchitecturePackage | undefined =>
    packages.find((pkg) => file.startsWith(`${sourceRootOf(pkg)}/`));

  const rescan = async (touched: ArchitecturePackage[]): Promise<void> => {
    await Promise.all(
      touched.map(async (pkg) => {
        scans.set(pkg.name, await scanConfig(config, [pkg]));
      }),
    );
  };

  /** Indexes a language in its source, so later edits are incremental. */
  const warm = (language: Language): void => {
    const source = sources.get(language);
    if (source === undefined) {
      return;
    }
    const started = performance.now();
    void queue(language, async () => {
      const result = await source.index(
        filesInLanguage(language, packages, allFiles()),
      );
      facts.set(language, result.documents);
      options.log(
        `${language} facts ready in ${Math.round(performance.now() - started)} ms; edits now rebuild incrementally`,
      );
    }).catch((cause: unknown) => {
      options.log(
        `${language} facts source failed: ${cause instanceof Error ? cause.message : String(cause)}`,
      );
    });
  };

  const finish = async (
    clock: ReturnType<typeof stopwatch>,
    touched: string[],
    extraDiagnostics: Diagnostic[],
  ): Promise<SessionBuild> => {
    const scan = mergeScans([...scans.values()]);
    const assembled = assembleModel({
      config,
      packages,
      scan,
      facts: { documents: [...facts.values()].flat() },
    });
    clock.lap("model");
    const pipeline: PipelineResult = {
      model: assembled.model,
      diagnostics: [
        ...scan.diagnostics,
        ...extraDiagnostics,
        ...assembled.diagnostics,
      ],
      timings: {},
      reindexed: [],
    };
    const result = await writeBuild(config, pipeline, {
      write: true,
      analysis: options.analysis,
    });
    clock.lap("write");
    return { result, timings: clock.timings, touched };
  };

  return {
    build: async () => {
      const clock = stopwatch();
      await rescan(packages);
      clock.lap("scan");
      const files = allFiles();
      const collected = await collectFacts({ ...factsOptions, files, sources });
      for (const language of languagesOf(packages)) {
        facts.set(
          language,
          collected.facts.documents.filter(
            (document) =>
              filesInLanguage(language, packages, [document.file]).length > 0,
          ),
        );
        if (!collected.fresh.includes(language)) {
          // Deferred past the current turn so the server starts first.
          setImmediate(() => warm(language));
        }
      }
      clock.lap("facts");
      return finish(
        clock,
        collected.fresh.length === 0
          ? ["facts from cache"]
          : collected.fresh.map((language) => `${language} indexed`),
        collected.diagnostics,
      );
    },

    rebuild: async (changed) => {
      const clock = stopwatch();
      const touched = [
        ...new Set(
          changed
            .map(packageOf)
            .filter((pkg): pkg is ArchitecturePackage => pkg !== undefined),
        ),
      ];
      await rescan(touched);
      clock.lap("scan");
      const diagnostics: Diagnostic[] = [];
      const notes: string[] = [];
      // A page or diagram beside the code changes the model, not the facts.
      const changedSource = changed.filter((file) =>
        touched.some(
          (pkg) =>
            file.startsWith(`${sourceRootOf(pkg)}/`) &&
            sourceExtensionsFor(pkg).some((extension) =>
              file.endsWith(extension),
            ),
        ),
      );
      await Promise.all(
        languagesOf(touched).map((language) =>
          queue(language, async () => {
            const source = sources.get(language);
            const changedHere = filesInLanguage(
              language,
              packages,
              changedSource,
            );
            if (source === undefined || changedHere.length === 0) {
              return;
            }
            const result = await source.update(
              filesInLanguage(language, packages, allFiles()),
              changedHere,
            );
            facts.set(language, result.documents);
            diagnostics.push(...result.diagnostics);
            notes.push(`${language} updated`);
          }),
        ),
      );
      clock.lap("facts");
      return finish(
        clock,
        touched.length === 0
          ? ["content"]
          : [...touched.map((pkg) => pkg.name), ...notes],
        diagnostics,
      );
    },

    close: async () => {
      await Promise.all([...sources.values()].map((source) => source.close()));
    },
  };
};
