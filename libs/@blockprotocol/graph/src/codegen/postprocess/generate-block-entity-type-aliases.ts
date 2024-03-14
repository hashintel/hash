import { mustBeDefined } from "../../shared/util/must-be-defined.js";
import { typedEntries } from "../../shared/util/typed-object-iter.js";
import type { PostprocessContext } from "../context/postprocess.js";
import { entityDefinitionNameForEntityType } from "../shared.js";

export const generateBlockEntityTypeAliases = (
  context: PostprocessContext,
): void => {
  context.logDebug("Generating block entity types to generated files");

  for (const [fileName, { blockEntity }] of typedEntries(
    context.parameters.targets,
  )) {
    if (blockEntity) {
      const type = mustBeDefined(context.allTypes[blockEntity]);
      const typeName = entityDefinitionNameForEntityType(type.title);

      context.logDebug(
        `Generating block entity type alias ${typeName} for file ${fileName}`,
      );

      const identifier = "BlockEntity";
      const blockEntityTypesFragment = `\nexport type ${identifier} = ${typeName}\n`;

      context.defineIdentifierInFile(
        identifier,
        {
          definingPath: fileName,
          dependentOnIdentifiers: [typeName],
          compiledContents: blockEntityTypesFragment,
        },
        false,
      );
    }
  }
};
