import { mustBeDefined } from "../../util/must-be-defined";
import { typedEntries, typedValues } from "../../util/typed-object-iter";
import type { PostprocessContext } from "../context/postprocess";
import { entityDefinitionNameForEntityType } from "../shared";

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
