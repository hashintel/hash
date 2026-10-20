/**
 * Symbol facts for every TypeScript package from one language service. One
 * program holds every covered file once, so a reference from one package to
 * another resolves inside it. A build walks every file once and caches the
 * result; the dev session keeps the service and, on an edit, re-walks the
 * edited file and every file referencing a symbol it defines, nothing else.
 *
 * A symbol is identified by its defining file and name, resolved through
 * import aliases and re-exports to the original declaration; a module is
 * `file#`, so a bare or dynamic import of it is a reference too.
 */

import { readFileSync } from "node:fs";
import { join, relative } from "node:path";

import ts from "typescript";

import { toPosix } from "../shared/paths";

import type {
  IndexedDocument,
  SymbolOccurrence,
} from "../pipeline/symbol-index";

export interface TypeScriptFacts {
  /** Facts for every file currently in the package. */
  documents: () => IndexedDocument[];
  /**
   * Re-reads the package's file list and recomputes the facts the changed
   * files affect. Returns how many files were walked.
   */
  update: (files: string[], changed: string[]) => number;
}

/**
 * One set of options for every package. Symbol resolution needs module
 * resolution, JSX and the DOM and Node libraries; type errors are irrelevant,
 * so the packages' own strictness settings are not needed.
 */
const compilerOptions = (
  repoRoot: string,
  paths: Record<string, string[]>,
): ts.CompilerOptions => ({
  target: ts.ScriptTarget.ESNext,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  jsx: ts.JsxEmit.ReactJSX,
  lib: ["lib.esnext.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts"],
  types: ["node"],
  resolveJsonModule: true,
  allowImportingTsExtensions: true,
  paths,
  pathsBasePath: repoRoot,
  noEmit: true,
  skipLibCheck: true,
});

export const createTypeScriptFacts = (options: {
  repoRoot: string;
  paths: Record<string, string[]>;
  /** Repo-relative source files of every TypeScript package. */
  files: string[];
}): TypeScriptFacts => {
  const { repoRoot } = options;
  const absolute = (file: string): string => join(repoRoot, file);
  const repoRelative = (path: string): string =>
    toPosix(relative(repoRoot, path));

  let rootFiles = options.files.map(absolute);
  const versions = new Map<string, number>();
  const documents = new Map<string, IndexedDocument>();

  const host: ts.LanguageServiceHost = {
    getScriptFileNames: () => rootFiles,
    getScriptVersion: (fileName) => String(versions.get(fileName) ?? 0),
    getScriptSnapshot: (fileName) => {
      try {
        return ts.ScriptSnapshot.fromString(readFileSync(fileName, "utf8"));
      } catch {
        return undefined;
      }
    },
    getCurrentDirectory: () => repoRoot,
    getCompilationSettings: () => compilerOptions(repoRoot, options.paths),
    getDefaultLibFileName: (settings) => ts.getDefaultLibFilePath(settings),
    fileExists: ts.sys.fileExists,
    readFile: ts.sys.readFile,
    readDirectory: ts.sys.readDirectory,
    directoryExists: ts.sys.directoryExists,
    getDirectories: ts.sys.getDirectories,
  };
  const service = ts.createLanguageService(host, ts.createDocumentRegistry());

  /** Where a symbol was declared, repo-relative, or null outside the repository. */
  const declaringFile = (
    symbol: ts.Symbol,
  ): { file: string; declarations: ts.Declaration[] } | null => {
    const declarations = symbol.declarations ?? [];
    const first = declarations[0];
    if (first === undefined) {
      return null;
    }
    const file = repoRelative(first.getSourceFile().fileName);
    if (file.startsWith("..") || file.includes("/node_modules/")) {
      return null;
    }
    return { file, declarations };
  };

  const walk = (fileName: string): IndexedDocument => {
    const program = service.getProgram();
    const sourceFile = program?.getSourceFile(fileName);
    if (program === undefined || sourceFile === undefined) {
      return { file: repoRelative(fileName), occurrences: [] };
    }
    const checker = program.getTypeChecker();
    const seen = new Set<string>();
    const occurrences: SymbolOccurrence[] = [];
    const record = (id: string, definition: boolean): void => {
      const key = `${id}|${definition}`;
      if (!seen.has(key)) {
        seen.add(key);
        occurrences.push({ symbol: id, definition });
      }
    };
    // The module itself, so a bare or dynamic import of it resolves.
    record(`${repoRelative(fileName)}#`, true);
    const moduleReference = (specifier: ts.Expression): void => {
      if (!ts.isStringLiteralLike(specifier)) {
        return;
      }
      const symbol = checker.getSymbolAtLocation(specifier);
      const declared = symbol === undefined ? null : declaringFile(symbol);
      if (declared !== null) {
        record(`${declared.file}#`, false);
      }
    };
    const visit = (node: ts.Node): void => {
      if (ts.isImportDeclaration(node) && node.importClause === undefined) {
        moduleReference(node.moduleSpecifier);
      }
      if (
        ts.isCallExpression(node) &&
        node.expression.kind === ts.SyntaxKind.ImportKeyword
      ) {
        const [specifier] = node.arguments;
        if (specifier !== undefined) {
          moduleReference(specifier);
        }
      }
      if (ts.isIdentifier(node)) {
        let symbol = checker.getSymbolAtLocation(node);
        if (
          symbol !== undefined &&
          (symbol.flags & ts.SymbolFlags.Alias) !== 0
        ) {
          symbol = checker.getAliasedSymbol(symbol);
        }
        const declared = symbol === undefined ? null : declaringFile(symbol);
        if (symbol !== undefined && declared !== null) {
          const id = `${declared.file}#${symbol.name}`;
          const definition = declared.declarations.some(
            (declaration) => ts.getNameOfDeclaration(declaration) === node,
          );
          record(id, definition);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    return { file: repoRelative(fileName), occurrences };
  };

  const refresh = (fileNames: string[]): number => {
    for (const fileName of fileNames) {
      documents.set(fileName, walk(fileName));
    }
    return fileNames.length;
  };

  refresh(rootFiles);

  return {
    documents: () => [...documents.values()],
    update: (files, changed) => {
      rootFiles = files.map(absolute);
      const rootSet = new Set(rootFiles);
      for (const fileName of documents.keys()) {
        if (!rootSet.has(fileName)) {
          documents.delete(fileName);
        }
      }
      const changedAbsolute = changed.map(absolute);
      for (const fileName of changedAbsolute) {
        versions.set(fileName, (versions.get(fileName) ?? 0) + 1);
      }
      // Files referencing a symbol a changed file defines may now point at a
      // moved or renamed declaration, so they are walked again too.
      const changedPrefixes = changed.map((file) => `${file}#`);
      const dependents = [...documents.entries()]
        .filter(
          ([fileName, document]) =>
            !changedAbsolute.includes(fileName) &&
            document.occurrences.some((occurrence) =>
              changedPrefixes.some((prefix) =>
                occurrence.symbol.startsWith(prefix),
              ),
            ),
        )
        .map(([fileName]) => fileName);
      return refresh([
        ...changedAbsolute.filter((fileName) => rootSet.has(fileName)),
        ...dependents,
      ]);
    },
  };
};
