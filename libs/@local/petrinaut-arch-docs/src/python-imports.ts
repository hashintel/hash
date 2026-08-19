/**
 * Python counterpart of the dependency-cruiser stage: reads `import` and
 * `from ... import` statements in the covered Python packages and resolves them
 * to files, so Python edges carry the same imports provenance as TypeScript
 * ones. Imports that resolve to nothing covered (stdlib, third-party) are
 * dropped, exactly as dependency-cruiser edges leaving the covered roots are.
 *
 * The parser is line-based and conservative: a missed import loses one edge,
 * while an invented one would put a false claim in the docs. Docstring bodies
 * are skipped so a code example in one cannot contribute an edge.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { sourceRootOf } from "./scope";

import type { Diagnostic } from "./diagnostics";
import type { FileDependency } from "./graph";
import type { ArchitecturePackage } from "./model";

/** One parsed import statement. */
export interface PythonImport {
  kind: "import" | "from";
  /** Dotted module path; empty for `from . import x`. */
  module: string;
  /** Leading dots on a relative `from` import; 0 when absolute. */
  level: number;
  /** Names a `from` import binds; empty for `import a.b` and `import *`. */
  names: string[];
}

const importPattern = /^\s*import\s+([^#]+)/u;
const fromPattern = /^\s*from\s+(\.*)([\w.]*)\s+import\s*([^#]*)/u;
const identifierPattern = /^\s*([A-Za-z_]\w*)/u;
const modulePattern = /^\s*([A-Za-z_][\w.]*)/u;

const tripleQuotes = ['"""', "'''"] as const;

/** The triple-quote delimiter `text` leaves open, or null when balanced. */
const openDelimiterAfter = (text: string): string | null => {
  // Naive comment strip: a `#` inside a string followed by a real opening on
  // the same line would be mis-tracked, which no covered file comes close to.
  let rest = text.split("#")[0] ?? "";

  for (;;) {
    const opening = tripleQuotes
      .map((delimiter) => ({ delimiter, index: rest.indexOf(delimiter) }))
      .filter(({ index }) => index !== -1)
      .sort((left, right) => left.index - right.index)[0];

    if (opening === undefined) {
      return null;
    }

    const close = rest.indexOf(opening.delimiter, opening.index + 3);
    if (close === -1) {
      return opening.delimiter;
    }
    rest = rest.slice(close + 3);
  }
};

const parseNames = (text: string): string[] =>
  text
    .replace(/[()\\]/gu, " ")
    .split(",")
    .flatMap((part) => {
      const name = identifierPattern.exec(part)?.[1];
      return name === undefined ? [] : [name];
    });

/**
 * Extracts the import statements of one Python source file. Line-based:
 * a statement's module part always sits on its first line, and names spilling
 * onto continuation lines only cost the submodule-name refinement.
 */
export const parsePythonImports = (source: string): PythonImport[] => {
  const imports: PythonImport[] = [];
  let openDelimiter: string | null = null;

  for (const line of source.split("\n")) {
    if (openDelimiter !== null) {
      const close = line.indexOf(openDelimiter);
      if (close === -1) {
        continue;
      }
      openDelimiter = openDelimiterAfter(line.slice(close + 3));
      continue;
    }

    const fromMatch = fromPattern.exec(line);
    if (fromMatch !== null) {
      imports.push({
        kind: "from",
        module: fromMatch[2] ?? "",
        level: (fromMatch[1] ?? "").length,
        names: parseNames(fromMatch[3] ?? ""),
      });
      continue;
    }

    const importMatch = importPattern.exec(line);
    if (importMatch !== null) {
      for (const part of (importMatch[1] ?? "").split(",")) {
        const module = modulePattern.exec(part)?.[1];
        if (module !== undefined) {
          imports.push({ kind: "import", module, level: 0, names: [] });
        }
      }
      continue;
    }

    openDelimiter = openDelimiterAfter(line);
  }

  return imports;
};

/** Both directions of the module↔file mapping for the covered packages. */
export interface PythonModuleIndex {
  /** Dotted module path → repo-relative file. */
  moduleFiles: Map<string, string>;
  /** Repo-relative file → dotted module path. */
  fileModules: Map<string, string>;
}

/**
 * Maps every covered Python file to its importable dotted name. The import
 * root is the package root when the source directory is itself a package
 * (petrinaut-opt imports `src.utils`), the source root otherwise
 * (petrinaut-python imports `petrinaut.session`).
 */
export const indexPythonModules = (
  packages: ArchitecturePackage[],
  /** Repo-relative posix paths of the covered `.py` files. */
  files: string[],
): PythonModuleIndex => {
  const moduleFiles = new Map<string, string>();
  const fileModules = new Map<string, string>();

  for (const pkg of packages) {
    const root = sourceRootOf(pkg);
    const packageFiles = files.filter((file) => file.startsWith(`${root}/`));
    const rootIsPackage = packageFiles.includes(`${root}/__init__.py`);
    const importRoot = rootIsPackage ? pkg.path : root;

    for (const file of packageFiles) {
      const segments = file
        .slice(importRoot.length + 1)
        .replace(/\.py$/u, "")
        .split("/");

      if (segments[segments.length - 1] === "__init__") {
        segments.pop();
      }
      if (segments.length === 0) {
        continue;
      }

      const moduleName = segments.join(".");
      moduleFiles.set(moduleName, file);
      fileModules.set(file, moduleName);
    }
  }

  return { moduleFiles, fileModules };
};

/**
 * Resolves one import to covered files. A `from` import may bind submodules
 * (`from . import session, errors` is two edges), so each bound name is tried
 * as a module first, with the base module as the fallback.
 */
export const resolvePythonImport = (
  imported: PythonImport,
  /** Repo-relative file carrying the import. */
  importer: string,
  index: PythonModuleIndex,
): string[] => {
  let baseSegments: string[];

  if (imported.level === 0) {
    baseSegments = imported.module.split(".");
  } else {
    const importerModule = index.fileModules.get(importer);
    if (importerModule === undefined) {
      return [];
    }

    // The package containing the importer: an `__init__.py`'s module name is
    // already its package, any other file drops its final segment.
    const packageSegments = importerModule.split(".");
    if (!importer.endsWith("/__init__.py")) {
      packageSegments.pop();
    }

    // Each dot beyond the first climbs one package; past the top is invalid.
    if (imported.level > packageSegments.length) {
      return [];
    }

    baseSegments = [
      ...packageSegments.slice(
        0,
        packageSegments.length - (imported.level - 1),
      ),
      ...(imported.module === "" ? [] : imported.module.split(".")),
    ];
  }

  const base = baseSegments.join(".");
  if (base === "") {
    return [];
  }

  if (imported.kind === "import") {
    const file = index.moduleFiles.get(base);
    return file === undefined ? [] : [file];
  }

  const targets: string[] = [];
  let dependsOnBase = imported.names.length === 0;

  for (const name of imported.names) {
    const submodule = index.moduleFiles.get(`${base}.${name}`);
    if (submodule === undefined) {
      dependsOnBase = true;
    } else {
      targets.push(submodule);
    }
  }

  if (dependsOnBase) {
    const baseFile = index.moduleFiles.get(base);
    if (baseFile !== undefined) {
      targets.push(baseFile);
    }
  }

  return targets;
};

/**
 * Collects file-level dependency records for the covered Python packages.
 * The files come from `fileLayers`, so this stage reads exactly what the
 * extractor claimed: an unclaimed Python file is already an error there.
 */
export const collectPythonImports = async (options: {
  repoRoot: string;
  /** Python packages only; `buildGraph` splits by language. */
  packages: ArchitecturePackage[];
  /** Repo-relative source file → layer id, from `extract`. */
  fileLayers: Map<string, string>;
}): Promise<{ dependencies: FileDependency[]; diagnostics: Diagnostic[] }> => {
  const files = [...options.fileLayers.keys()].filter((file) =>
    file.endsWith(".py"),
  );
  const index = indexPythonModules(options.packages, files);
  const dependencies: FileDependency[] = [];

  for (const [file] of index.fileModules) {
    const source = await readFile(join(options.repoRoot, file), "utf8");
    const targets = new Set<string>();

    for (const imported of parsePythonImports(source)) {
      for (const target of resolvePythonImport(imported, file, index)) {
        if (target !== file) {
          targets.add(target);
        }
      }
    }

    // One record per file pair, matching dependency-cruiser's counting.
    for (const target of [...targets].sort((left, right) =>
      left.localeCompare(right),
    )) {
      dependencies.push({ from: file, to: target });
    }
  }

  return { dependencies, diagnostics: [] };
};
