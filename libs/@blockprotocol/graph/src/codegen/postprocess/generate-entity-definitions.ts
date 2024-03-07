import { VersionedUrl } from "@blockprotocol/type-system/slim";

import { mustBeDefined } from "../../shared/util/must-be-defined.js";
import { typedEntries } from "../../shared/util/typed-object-iter.js";
import { PostprocessContext } from "../context/postprocess.js";
import { entityDefinitionNameForEntityType } from "../shared.js";

const generateEntityDefinitionForEntityType = (
  entityTypeId: VersionedUrl,
  title: string,
  context: PostprocessContext,
) => {
  const typeName = title;
  const isLinkType = mustBeDefined(context.linkTypeMap[entityTypeId]);

  const linkSuffix = isLinkType ? ` & { linkData: LinkData }` : "";
  const entityName = entityDefinitionNameForEntityType(typeName);

  const compiledContents = `\nexport type ${entityName} = Entity<${typeName}>${linkSuffix}\n`;

  return { entityName, isLinkType, compiledContents };
};

const allocateEntityDefinitionToFile = (
  fileName: string,
  entityName: string,
  isLinkType: boolean,
  compiledContents: string,
  context: PostprocessContext,
) => {
  context.logTrace(
    `Adding${isLinkType ? " link " : " "}entity definition for ${entityName}`,
  );

  context.defineIdentifierInFile(
    entityName,
    {
      definingPath: fileName,
      dependentOnIdentifiers: isLinkType ? ["Entity", "LinkData"] : ["Entity"],
      compiledContents,
    },
    true,
  );
};

/**
 * Generates types for the definition of various `Entity` kinds, alongside their entity type definitions.
 *
 * @param context
 */
export const generateEntityDefinitions = (
  context: PostprocessContext,
): void => {
  context.logDebug("Adding entity definitions");

  const entityTypeIdentifiersToIds = Object.fromEntries(
    typedEntries(context.entityTypes).map(([entityTypeId, { title }]) => [
      title,
      entityTypeId,
    ]),
  );

  const entityTypeIdsToEntityDefinitions = Object.fromEntries(
    typedEntries(context.entityTypes).map(([entityTypeId, { title }]) => {
      return [
        entityTypeId,
        generateEntityDefinitionForEntityType(entityTypeId, title, context),
      ];
    }),
  );

  for (const [file, dependentIdentifiers] of typedEntries(
    context.filesToDependentIdentifiers,
  )) {
    for (const identifier of dependentIdentifiers) {
      const entityTypeId = entityTypeIdentifiersToIds[identifier];
      if (entityTypeId) {
        const { entityName, isLinkType, compiledContents } = mustBeDefined(
          entityTypeIdsToEntityDefinitions[entityTypeId],
        );

        if (context.filesToDefinedIdentifiers[file]?.has(identifier)) {
          allocateEntityDefinitionToFile(
            file,
            entityName,
            isLinkType,
            compiledContents,
            context,
          );
        } else {
          context.addDependentIdentifierInFile(entityName, file);
        }
      }
    }
  }
};
