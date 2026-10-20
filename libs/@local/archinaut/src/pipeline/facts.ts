/**
 * Symbol facts: for every covered file, the symbols it defines and the
 * symbols it references, each named by its defining file. The model reads
 * nothing else from the code, so a provider is anything that can produce
 * this shape for a language, and the analysis depth is a choice:
 *
 * - `program` asks a type checker, so a reference through inference, such as
 *   a property of a type another file declares, counts.
 * - `syntactic` follows imports and re-export chains only, with no checker.
 *
 * A source holds a provider's state for a language so a dev session can ask
 * for an update after an edit; a one-shot build opens one, indexes, and
 * closes it, unless the cache already has the answer.
 */

import { join } from "node:path";

import { factsCacheKey, readFactsCache, writeFactsCache } from "./facts/cache";
import { openPythonSource, pythonSalt } from "./facts/python";
import { openTypeScriptSource, typeScriptSalt } from "./facts/typescript";
import { sourceRootOf } from "./shared/scope";

import type { ArchitecturePackage } from "../model";
import type { Diagnostic } from "../shared/diagnostics";

export type Language = ArchitecturePackage["language"];
export type Analysis = "program" | "syntactic";

export interface SymbolOccurrence {
  /** `<repo-relative file>#<name>`; `<file>#` is the module itself. */
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

export interface FactsResult {
  documents: IndexedDocument[];
  diagnostics: Diagnostic[];
}

/** A language's facts provider with its state, kept between calls. */
export interface FactsSource {
  /** Facts for `files`, from scratch. */
  index: (files: string[]) => Promise<FactsResult>;
  /** Facts for `files` after `changed` changed on disk. */
  update: (files: string[], changed: string[]) => Promise<FactsResult>;
  close: () => Promise<void>;
}

export interface FactsOptions {
  repoRoot: string;
  packages: ArchitecturePackage[];
  analysis: Analysis;
  /** Absolute. */
  cacheDirectory: string;
}

export const openFactsSource = (
  language: Language,
  options: FactsOptions,
): FactsSource =>
  language === "typescript"
    ? openTypeScriptSource(options)
    : openPythonSource(options);

/** The covered files of every package in `language`. */
export const filesInLanguage = (
  language: Language,
  packages: ArchitecturePackage[],
  files: string[],
): string[] => {
  const roots = packages
    .filter((pkg) => pkg.language === language)
    .map((pkg) => `${sourceRootOf(pkg)}/`);
  return files.filter((file) => roots.some((root) => file.startsWith(root)));
};

export const languagesOf = (packages: ArchitecturePackage[]): Language[] => [
  ...new Set(packages.map((pkg) => pkg.language)),
];

const saltFor = (language: Language, options: FactsOptions): string =>
  language === "typescript" ? typeScriptSalt(options) : pythonSalt(options);

export interface CollectedFacts {
  facts: SymbolFacts;
  /** Languages indexed this time rather than read from the cache. */
  fresh: Language[];
  diagnostics: Diagnostic[];
}

/**
 * Facts for every language, from the cache when its key holds. A language
 * with a source in `sources` is indexed through it and the source stays
 * open; any other language gets a temporary source, closed afterwards.
 */
export const collectFacts = async (
  options: FactsOptions & {
    files: string[];
    sources?: Map<Language, FactsSource>;
  },
): Promise<CollectedFacts> => {
  const collected: CollectedFacts = {
    facts: { documents: [] },
    fresh: [],
    diagnostics: [],
  };
  await Promise.all(
    languagesOf(options.packages).map(async (language) => {
      const files = filesInLanguage(language, options.packages, options.files);
      const key = await factsCacheKey({
        repoRoot: options.repoRoot,
        files,
        salt: saltFor(language, options),
      });
      const entry = `${language}-${options.analysis}`;
      const cached = await readFactsCache(options.cacheDirectory, entry, key);
      if (cached !== null) {
        collected.facts.documents.push(...cached);
        return;
      }
      const kept = options.sources?.get(language);
      const source = kept ?? openFactsSource(language, options);
      try {
        const result = await source.index(files);
        collected.facts.documents.push(...result.documents);
        collected.diagnostics.push(...result.diagnostics);
        collected.fresh.push(language);
        await writeFactsCache(
          options.cacheDirectory,
          entry,
          key,
          result.documents,
        );
      } finally {
        if (kept === undefined) {
          await source.close();
        }
      }
    }),
  );
  collected.facts.documents.sort((left, right) =>
    left.file.localeCompare(right.file),
  );
  return collected;
};

/** Where facts are cached for a config, absolute. */
export const factsCacheDirectory = (
  repoRoot: string,
  cacheDirectory: string,
): string => join(repoRoot, cacheDirectory, "facts");
