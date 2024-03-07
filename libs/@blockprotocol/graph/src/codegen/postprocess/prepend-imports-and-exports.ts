import * as path from "node:path";

import { mustBeDefined } from "../../shared/util/must-be-defined.js";
import { PostprocessContext } from "../context/postprocess.js";

const inlineSort = <T>(
  array: T[],
  sortCallback: (a: T, b: T) => number,
): T[] => {
  array.sort(sortCallback);
  return array;
};

/**
 * Generates the required imports and exports for types that have been hoisted to a shared file.
 *
 * @param context
 */
export const prependImportsAndExports = (context: PostprocessContext): void => {
  context.logDebug("Adding imports and exports");

  for (const [file, dependentIdentifiers] of inlineSort(
    Object.entries(context.filesToDependentIdentifiers),
    ([fileA, _dependenciesA], [fileB, _dependenciesB]) =>
      fileA.localeCompare(fileB),
  )) {
    const localImportIdentifiersByPath: Record<string, string[]> = {};
    const externalImportIdentifiersByPath: Record<string, string[]> = {};

    for (const identifier of dependentIdentifiers) {
      const sourceDefinition = mustBeDefined(
        context.IdentifiersToSources[identifier],
        `Internal Error: source for identifier "${identifier}" not found`,
      );

      if (!sourceDefinition.locallyImportable) {
        if (
          sourceDefinition.source.find((source) => source.definingPath === file)
        ) {
          continue;
        }

        throw new Error(
          `Internal Error: file ${file} depends on an externally defined type "${identifier}" which is not locally importable"`,
        );
      }

      const { source } = sourceDefinition;

      if (source.definingPath === file) {
        continue;
      }

      if (source.kind === "external") {
        externalImportIdentifiersByPath[source.definingPath] ??= [];
        externalImportIdentifiersByPath[source.definingPath]!.push(identifier);
      } else {
        const importPath = `./${path.parse(source.definingPath).name}`;

        localImportIdentifiersByPath[importPath] ??= [];
        localImportIdentifiersByPath[importPath]!.push(identifier);
      }
    }

    const importStatements: string[] = [];
    const exportStatements: string[] = [];

    for (const [importPath, identifiers] of inlineSort(
      Object.entries(externalImportIdentifiersByPath),
      ([importPathA, _identifiersA], [importPathB, _identifiersB]) =>
        importPathA.localeCompare(importPathB),
    )) {
      identifiers.sort();

      const identifiersString = identifiers.join(", ");

      context.logTrace(
        `Adding external imports for ${file}: ${identifiersString}`,
      );

      importStatements.push(
        `import { ${identifiersString} } from "${importPath}"\n`,
      );
    }

    // Put a newline between external and local imports
    importStatements.push("\n");

    for (const [importPath, identifiers] of inlineSort(
      Object.entries(localImportIdentifiersByPath),
      ([importPathA, _identifiersA], [importPathB, _identifiersB]) =>
        importPathA.localeCompare(importPathB),
    )) {
      // Sort the titles alphabetically so that it's idempotent
      identifiers.sort();

      const identifiersString = identifiers.join(", ");
      context.logTrace(
        `Adding local imports for ${file}: ${identifiersString}`,
      );

      importStatements.push(
        `import { ${identifiersString} } from "${importPath}"\n`,
      );

      context.logTrace(
        `Adding re-exports of locally defined types for ${file}: ${identifiersString}`,
      );

      exportStatements.push(`export type { ${identifiersString} }\n`);
    }

    context.filesToContents[file] =
      // eslint-disable-next-line prefer-template -- Using a template string here ruins readability
      importStatements.join("") +
      "\n" +
      exportStatements.join("") +
      "\n" +
      context.filesToContents[file];
  }
};
