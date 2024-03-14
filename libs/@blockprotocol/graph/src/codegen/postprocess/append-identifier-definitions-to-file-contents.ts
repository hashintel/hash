import { mustBeDefined } from "../../shared/util/must-be-defined.js";
import { typedEntries } from "../../shared/util/typed-object-iter.js";
import type { PostprocessContext } from "../context/postprocess.js";

export const appendIdentifierDefinitionsToFileContents = (
  context: PostprocessContext,
): void => {
  context.logDebug("Adding types to file contents");

  for (const [file, identifiersSet] of typedEntries(
    context.filesToDefinedIdentifiers,
  )) {
    const identifiers = [...identifiersSet];
    identifiers.sort();

    for (const identifier of identifiers) {
      const identifierSourceDefinition = mustBeDefined(
        context.IdentifiersToSources[identifier],
      );

      const source = identifierSourceDefinition.locallyImportable
        ? identifierSourceDefinition.source
        : mustBeDefined(
            identifierSourceDefinition.source.find(
              (sourceDefinition) => sourceDefinition.definingPath === file,
            ),
          );

      if (source.kind === "external") {
        throw new Error(
          `Internal Error: external type "${identifier}" has been incorrectly marked as being defined by file "${file}"`,
        );
      }

      context.logTrace(`Adding type ${identifier} to file ${file}`);

      mustBeDefined(context.filesToContents[file]);

      context.filesToContents[file] += `\n${source.compiledContents}\n`;
    }
  }
};
