import type { VersionedUrl } from "@blockprotocol/type-system/slim";

import { mustBeDefined } from "../../shared/util/must-be-defined.js";
import { typedEntries } from "../../shared/util/typed-object-iter.js";
import type { PostprocessContext } from "../context/postprocess.js";
import { sharedTypeFileName } from "../shared.js";

/**
 * Allocates types to files. If a type is defined in multiple files, it is hoisted to a shared file.
 *
 * @param context
 */
export const allocateTypesToFiles = (context: PostprocessContext): void => {
  context.logDebug("Allocating types to files");

  const typesToFiles: Record<VersionedUrl, Set<string>> = typedEntries(
    context.parameters.targets,
  ).reduce(
    (mapObject, [file, { sourceTypeIds }]) => {
      for (const typeId of sourceTypeIds) {
        // eslint-disable-next-line no-param-reassign -- this is a reduce function..
        mapObject[typeId] ??= new Set();
        mapObject[typeId]!.add(file);

        for (const dependencyUrl of context.typeDependencyMap.getDependenciesForType(
          typeId,
        )) {
          // eslint-disable-next-line no-param-reassign -- this is a reduce function..
          mapObject[dependencyUrl] ??= new Set();
          mapObject[dependencyUrl]!.add(file);
        }
      }

      return mapObject;
    },
    {} as Record<VersionedUrl, Set<string>>,
  );

  for (const [typeId, fileSet] of typedEntries(typesToFiles)) {
    const files = [...fileSet];
    const type = mustBeDefined(context.allTypes[typeId]);

    let definingFile;
    if (files.length > 1) {
      context.logTrace(
        `Type ${type.title} is defined in multiple files: ${files.join(
          ", ",
        )}, hoisting it to ${sharedTypeFileName}`,
      );
      for (const file of files) {
        // These files will need to import from the shared file
        context.filesToDependentIdentifiers[file] ??= new Set();
        context.filesToDependentIdentifiers[file]!.add(type.title);
      }
      definingFile = sharedTypeFileName;
    } else {
      definingFile = mustBeDefined(files.pop());
    }

    const dependentOnIdentifiers = [
      ...context.typeDependencyMap.getDependenciesForType(type.$id),
    ].map(
      (dependencyUrl) => mustBeDefined(context.allTypes[dependencyUrl]).title,
    );

    const compiledContents = mustBeDefined(
      context.typeIdsToCompiledTypes[typeId],
    );

    context.logTrace(
      `Defining type ${
        type.title
      } in file ${definingFile} with dependencies ${dependentOnIdentifiers.join(
        ", ",
      )}`,
    );

    context.defineIdentifierInFile(
      type.title,
      {
        definingPath: definingFile,
        dependentOnIdentifiers,
        compiledContents,
      },
      true,
    );
  }

  for (const [file, identifiers] of typedEntries(
    context.filesToDefinedIdentifiers,
  )) {
    context.logTrace(
      `Allocating types ${[...identifiers].join(`,`)} to file ${file}`,
    );
  }
};
