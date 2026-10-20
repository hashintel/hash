/**
 * Python facts: the import-statement scan, which every analysis runs, plus
 * scip-python's symbol-level index under `program` analysis. The scan is the
 * safety net for the modules scip-python leaves unresolved, so the union is
 * the edge set; it alone is the syntactic answer.
 */

import { join } from "node:path";

import { error, type Diagnostic } from "../../shared/diagnostics";
import { collectPythonImports } from "./python/imports";
import { indexPythonPackage, scipPythonVersion } from "./python/scip";

import type {
  FactsOptions,
  FactsResult,
  FactsSource,
  IndexedDocument,
} from "../facts";

/** Bumped whenever the scan's output changes for the same input. */
const scannerVersion = 1;

/** What, besides the files, decides Python facts. */
export const pythonSalt = (options: FactsOptions): string =>
  JSON.stringify({
    provider: "python",
    version: scipPythonVersion,
    scanner: scannerVersion,
    analysis: options.analysis,
  });

/** Every file as a module, each importing file referencing its targets. */
const importDocuments = (
  files: string[],
  dependencies: { from: string; to: string }[],
): IndexedDocument[] => {
  const documents = new Map(
    files.map((file): [string, IndexedDocument] => [
      file,
      { file, occurrences: [{ symbol: `${file}#`, definition: true }] },
    ]),
  );
  for (const dependency of dependencies) {
    documents
      .get(dependency.from)
      ?.occurrences.push({ symbol: `${dependency.to}#`, definition: false });
  }
  return [...documents.values()];
};

const merge = (sides: IndexedDocument[][]): IndexedDocument[] => {
  const byFile = new Map<string, IndexedDocument>();
  for (const document of sides.flat()) {
    const existing = byFile.get(document.file);
    if (existing === undefined) {
      byFile.set(document.file, { ...document });
    } else {
      existing.occurrences = [...existing.occurrences, ...document.occurrences];
    }
  }
  return [...byFile.values()];
};

export const openPythonSource = (options: FactsOptions): FactsSource => {
  const packages = options.packages.filter((pkg) => pkg.language === "python");
  const index = async (files: string[]): Promise<FactsResult> => {
    const diagnostics: Diagnostic[] = [];
    const imports = await collectPythonImports({
      repoRoot: options.repoRoot,
      packages,
      files,
    });
    diagnostics.push(...imports.diagnostics);
    const sides = [importDocuments(files, imports.dependencies)];
    if (options.analysis === "program") {
      sides.push(
        ...(await Promise.all(
          packages.map((pkg) =>
            indexPythonPackage({
              repoRoot: options.repoRoot,
              pkg,
              outputDirectory: join(options.cacheDirectory, "scip"),
            }).catch((cause: unknown) => {
              diagnostics.push(
                error(
                  `${pkg.path}/package.json`,
                  `indexing ${pkg.name} failed, so only its import statements count: ${cause instanceof Error ? cause.message : String(cause)}`,
                ),
              );
              return [];
            }),
          ),
        )),
      );
    }
    return { documents: merge(sides), diagnostics };
  };
  return {
    index,
    update: (files) => index(files),
    close: () => Promise.resolve(),
  };
};
