/**
 * The dev session: per-package scan results and symbol facts kept in memory
 * between rebuilds, so a change touches one package and a content edit
 * touches none. The first build takes its facts from the caches; the
 * language service over every TypeScript package, the same provider the
 * caches were filled from, is built in the background afterwards and answers
 * every later edit by walking only the files it touched.
 */

import { join } from "node:path";

import { writeBuild, type BuildResult } from "../build";
import { packageSchema, type ArchitecturePackage } from "../model";
import { assembleModel } from "../pipeline";
import { scanDeclarations, type ScanResult } from "../pipeline/scan";
import { sourceRootOf } from "../pipeline/shared/scope";
import {
  indexPackages,
  workspacePaths,
  type IndexedDocument,
} from "../pipeline/symbol-index";
import {
  createTypeScriptFacts,
  type TypeScriptFacts,
} from "../pipeline/typescript-facts";

import type { ArchinautConfig } from "../config";

interface PackageState {
  pkg: ArchitecturePackage;
  scan: ScanResult;
  facts: IndexedDocument[];
}

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
}

const mergeScans = (states: PackageState[]): ScanResult => ({
  layers: states
    .flatMap((state) => state.scan.layers)
    .sort((left, right) => left.id.localeCompare(right.id)),
  fileLayers: new Map(states.flatMap((state) => [...state.scan.fileLayers])),
  talksTo: states.flatMap((state) => state.scan.talksTo),
  interfaces: states.flatMap((state) => state.scan.interfaces),
  participations: states.flatMap((state) => state.scan.participations),
  diagnostics: states.flatMap((state) => state.scan.diagnostics),
});

export const createDevSession = (config: ArchinautConfig): DevSession => {
  const packages = config.packages.map((pkg) => packageSchema.parse(pkg));
  const states = new Map<string, PackageState>();
  const typescriptPackages = packages.filter(
    (pkg) => pkg.language === "typescript",
  );
  let typescript: Promise<TypeScriptFacts> | null = null;

  const typescriptFiles = (): string[] =>
    typescriptPackages.flatMap((pkg) => [
      ...(states.get(pkg.name)?.scan.fileLayers.keys() ?? []),
    ]);

  /** Facts of every TypeScript package replaced by the service's, grouped back per package. */
  const adoptTypeScriptFacts = (service: TypeScriptFacts): void => {
    const documents = service.documents();
    for (const pkg of typescriptPackages) {
      const state = states.get(pkg.name);
      if (state !== undefined) {
        const prefix = `${sourceRootOf(pkg)}/`;
        state.facts = documents.filter((document) =>
          document.file.startsWith(prefix),
        );
      }
    }
  };

  const ensureTypeScript = (): Promise<TypeScriptFacts> => {
    if (typescript === null) {
      typescript = new Promise((resolve) => {
        // Deferred past the current turn so the server starts first.
        setImmediate(() => {
          const started = performance.now();
          const service = createTypeScriptFacts({
            repoRoot: config.root,
            paths: workspacePaths(config.root, packages),
            files: typescriptFiles(),
          });
          process.stdout.write(
            `language service ready in ${Math.round(performance.now() - started)} ms; source edits now rebuild without the indexers\n`,
          );
          resolve(service);
        });
      });
    }
    return typescript;
  };

  const scanPackage = (pkg: ArchitecturePackage): Promise<ScanResult> =>
    scanDeclarations({
      repoRoot: config.root,
      packages: [pkg],
      ignoredDirectories: config.ignoredDirectories,
      ignoredFilePattern: config.ignoredFilePattern,
    });

  const timer = () => {
    const timings: Record<string, number> = {};
    let last = performance.now();
    return {
      timings,
      lap: (stage: string) => {
        const now = performance.now();
        timings[stage] = Math.round((timings[stage] ?? 0) + now - last);
        last = now;
      },
    };
  };

  const finish = async (
    timings: Record<string, number>,
    lap: (stage: string) => void,
    touched: string[],
  ): Promise<SessionBuild> => {
    const ordered = [...states.values()];
    const scan = mergeScans(ordered);
    const assembled = await assembleModel({
      config,
      packages,
      scan,
      facts: { documents: ordered.flatMap((state) => state.facts) },
    });
    lap("model");
    const result = await writeBuild(
      config,
      {
        model: assembled.model,
        diagnostics: [...scan.diagnostics, ...assembled.diagnostics],
        timings: {},
        reindexed: [],
      },
      { write: true },
    );
    lap("write");
    return { result, timings, touched };
  };

  return {
    build: async () => {
      const { timings, lap } = timer();
      for (const pkg of packages) {
        states.set(pkg.name, { pkg, scan: await scanPackage(pkg), facts: [] });
      }
      lap("scan");
      const index = await indexPackages({
        repoRoot: config.root,
        packages,
        files: [...states.values()].flatMap((state) => [
          ...state.scan.fileLayers.keys(),
        ]),
        cacheDirectory: join(config.root, config.cacheDirectory),
      });
      for (const state of states.values()) {
        const prefix = `${sourceRootOf(state.pkg)}/`;
        state.facts = index.facts.documents.filter((document) =>
          document.file.startsWith(prefix),
        );
      }
      lap("index");
      return finish(
        timings,
        lap,
        index.fresh.length === 0 ? ["indexes from cache"] : index.fresh,
      );
    },

    rebuild: async (changed) => {
      const { timings, lap } = timer();
      const touched: string[] = [];
      const changedTypeScript: string[] = [];
      for (const state of states.values()) {
        const prefix = `${sourceRootOf(state.pkg)}/`;
        const own = changed.filter((file) => file.startsWith(prefix));
        if (own.length === 0) {
          continue;
        }
        touched.push(state.pkg.name);
        state.scan = await scanPackage(state.pkg);
        lap("scan");
        if (state.pkg.language === "typescript") {
          changedTypeScript.push(...own);
        } else {
          const index = await indexPackages({
            repoRoot: config.root,
            packages: [state.pkg],
            files: [...state.scan.fileLayers.keys()],
            cacheDirectory: join(config.root, config.cacheDirectory),
          });
          state.facts = index.facts.documents;
          lap("facts");
        }
      }
      if (changedTypeScript.length > 0) {
        const service = await ensureTypeScript();
        lap("service");
        const walked = service.update(typescriptFiles(), changedTypeScript);
        adoptTypeScriptFacts(service);
        touched.push(`${walked} files walked`);
        lap("facts");
      }
      return finish(timings, lap, touched.length === 0 ? ["content"] : touched);
    },
  };
};
