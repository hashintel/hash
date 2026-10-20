/**
 * From symbol facts to layer edges.
 *
 * A file depends on another when it references a symbol the other defines.
 * Facts name a symbol by its defining file, so the edge lands there and not
 * on the barrel that re-exported it. File dependencies aggregate to one edge
 * per layer pair; `@talksTo` declarations add edges no import carries.
 */

import { error, type Diagnostic } from "../shared/diagnostics";
import { sourceExtensions } from "./shared/scope";

import type { DeclaredEdge, ImportEdge, Layer } from "../model";
import type { SymbolFacts } from "./facts";
import type { TalksToDeclaration } from "./scan";

/** One file-level dependency, the record every provider emits. */
export interface FileDependency {
  from: string;
  to: string;
}

/** How many representative file pairs an edge keeps. */
const examplesPerEdge = 3;

export const dependenciesFromFacts = (facts: SymbolFacts): FileDependency[] => {
  const definingFile = new Map<string, string>();
  for (const document of facts.documents) {
    for (const occurrence of document.occurrences) {
      if (occurrence.definition && !definingFile.has(occurrence.symbol)) {
        definingFile.set(occurrence.symbol, document.file);
      }
    }
  }

  const pairs = new Set<string>();
  for (const document of facts.documents) {
    for (const occurrence of document.occurrences) {
      if (occurrence.definition) {
        continue;
      }
      const target = definingFile.get(occurrence.symbol);
      if (target !== undefined && target !== document.file) {
        pairs.add(`${document.file}>${target}`);
      }
    }
  }

  return [...pairs].sort().map((pair) => {
    const [from = "", to = ""] = pair.split(">");
    return { from, to };
  });
};

/**
 * TypeScript source files the facts mention inside the covered roots that
 * no layer claims. Every edge touching such a file is missing from the model.
 */
export const checkCoverage = (
  facts: SymbolFacts,
  fileLayers: Map<string, string>,
  ignored: { directories: string[]; filePattern: RegExp },
): Diagnostic[] =>
  facts.documents
    .map((document) => document.file)
    .filter(
      (file) =>
        sourceExtensions.some((extension) => file.endsWith(extension)) &&
        !ignored.filePattern.test(file) &&
        !file
          .split("/")
          .some((segment) => ignored.directories.includes(segment)) &&
        !fileLayers.has(file),
    )
    .sort((left, right) => left.localeCompare(right))
    .map((file) =>
      error(
        file,
        "the facts reach this source file but no layer claims it, so its edges are missing from the model",
      ),
    );

export const aggregateImportEdges = (
  dependencies: FileDependency[],
  fileLayers: Map<string, string>,
  layers: Layer[],
): ImportEdge[] => {
  const packageOf = new Map(layers.map((layer) => [layer.id, layer.package]));
  const accumulated = new Map<
    string,
    { fileDependencies: number; examples: FileDependency[] }
  >();

  for (const dependency of dependencies) {
    const fromLayer = fileLayers.get(dependency.from);
    const toLayer = fileLayers.get(dependency.to);
    if (
      fromLayer === undefined ||
      toLayer === undefined ||
      fromLayer === toLayer
    ) {
      continue;
    }
    const key = `${fromLayer}>${toLayer}`;
    const edge = accumulated.get(key) ?? { fileDependencies: 0, examples: [] };
    edge.fileDependencies += 1;
    if (edge.examples.length < examplesPerEdge) {
      edge.examples.push(dependency);
    }
    accumulated.set(key, edge);
  }

  return [...accumulated.entries()].map(([key, edge]) => {
    const [from = "", to = ""] = key.split(">");
    return {
      from,
      to,
      provenance: "imports" as const,
      fileDependencies: edge.fileDependencies,
      examples: edge.examples,
      crossesPackage: packageOf.get(from) !== packageOf.get(to),
    };
  });
};

/**
 * Resolves `@talksTo` declarations into declared edges. An unknown target
 * would draw an edge to a node no page describes, and a pair the imports
 * already carry would double an edge whose truth is the imports, so both
 * refuse the declaration.
 */
export const resolveDeclaredEdges = (options: {
  talksTo: TalksToDeclaration[];
  fileLayers: Map<string, string>;
  layers: Layer[];
  importEdges: ImportEdge[];
}): { edges: DeclaredEdge[]; diagnostics: Diagnostic[] } => {
  const diagnostics: Diagnostic[] = [];
  const edges: DeclaredEdge[] = [];
  const packageOf = new Map(
    options.layers.map((layer) => [layer.id, layer.package]),
  );
  const importPairs = new Set(
    options.importEdges.map((edge) => `${edge.from}>${edge.to}`),
  );
  const declaredPairs = new Map<string, string>();

  for (const declaration of options.talksTo) {
    const from = options.fileLayers.get(declaration.file);
    if (from === undefined) {
      continue;
    }
    const refuse = (message: string): void => {
      diagnostics.push(error(declaration.file, message, declaration.line));
    };
    if (!packageOf.has(declaration.target)) {
      refuse(
        `@talksTo names \`${declaration.target}\`, which is not a declared layer`,
      );
      continue;
    }
    if (declaration.target === from) {
      refuse(
        `@talksTo names \`${declaration.target}\`, the declaring file's own layer; declare the edge on the calling side only`,
      );
      continue;
    }
    const pair = `${from}>${declaration.target}`;
    if (importPairs.has(pair)) {
      refuse(
        `@talksTo declares \`${from}\` → \`${declaration.target}\`, but that edge is already derived from imports; remove the declaration`,
      );
      continue;
    }
    const rival = declaredPairs.get(pair);
    if (rival !== undefined) {
      refuse(
        `\`${from}\` → \`${declaration.target}\` is already declared in ${rival}`,
      );
      continue;
    }
    declaredPairs.set(pair, declaration.file);
    edges.push({
      from,
      to: declaration.target,
      provenance: "declared",
      protocol: declaration.protocol,
      declaredIn: declaration.file,
      line: declaration.line,
      crossesPackage: packageOf.get(from) !== packageOf.get(declaration.target),
    });
  }

  return { edges, diagnostics };
};
