import { mustBeDefined } from "../../shared/util/must-be-defined.js";
import {
  typedEntries,
  typedValues,
} from "../../shared/util/typed-object-iter.js";
import type { PostprocessContext } from "../context/postprocess.js";
import { entityDefinitionNameForEntityType } from "../shared.js";

export const generateBlockLinkTargetAliases = (
  context: PostprocessContext,
): void => {
  context.logDebug("Generating block entity types to generated files");

  for (const [fileName, { blockEntity }] of typedEntries(
    context.parameters.targets,
  )) {
    if (blockEntity) {
      const type = mustBeDefined(context.allTypes[blockEntity]);
      const typeName = entityDefinitionNameForEntityType(type.title);

      /* @todo - make this more robust */
      const entityLinkAndTargetsIdentifier = `${typeName}OutgoingLinkAndTarget`;

      if (
        typedValues(context.filesToDefinedIdentifiers).find(
          (definedIdentifier) =>
            definedIdentifier.has(entityLinkAndTargetsIdentifier),
        )
      ) {
        context.logDebug(
          `Generating block entity links and targets alias ${typeName} for file ${fileName}`,
        );

        const identifier = "BlockEntityOutgoingLinkAndTarget";

        const blockEntityLinkAndTargetTypesFragment = `\nexport type ${identifier} = ${entityLinkAndTargetsIdentifier}\n`;

        context.defineIdentifierInFile(
          identifier,
          {
            definingPath: fileName,
            dependentOnIdentifiers: [entityLinkAndTargetsIdentifier],
            compiledContents: blockEntityLinkAndTargetTypesFragment,
          },
          false,
        );
      }
    }
  }
};
